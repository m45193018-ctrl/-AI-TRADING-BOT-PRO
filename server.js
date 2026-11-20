const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { analyzeCandles, backtest } = require("./market-engine");
const { recordOutcome, buildDailyReview, getLearningSummary } = require("./learning-engine");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");
const JWT_SECRET = String(process.env.JWT_SECRET || "");

if (!ADMIN_EMAIL || ADMIN_PASSWORD.length < 12 || JWT_SECRET.length < 32) {
  console.error("Missing Replit Secrets. Set ADMIN_EMAIL, ADMIN_PASSWORD (12+ chars), and JWT_SECRET (32+ chars).");
  process.exit(1);
}

app.disable("x-powered-by");
app.use(express.json({limit:"1mb"}));
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","no-referrer");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control","no-store");
  next();
});

const dataDir = path.join(__dirname,"data");
const dbFile = path.join(dataDir,"store.json");
fs.mkdirSync(dataDir,{recursive:true});
let db;
try { db = JSON.parse(fs.readFileSync(dbFile,"utf8")); }
catch { db = {users:[],audit:[],ledger:[],experiments:[]}; }
db.users ||= []; db.audit ||= []; db.ledger ||= []; db.experiments ||= []; db.learningEvents ||= []; db.dailyReviews ||= [];

function save(){ fs.writeFileSync(dbFile,JSON.stringify(db,null,2),"utf8"); }
function hashPassword(password,salt=crypto.randomBytes(16).toString("hex")){
  const hash=crypto.scryptSync(password,salt,64).toString("hex");
  return {salt,hash};
}
function verifyPassword(password,record){
  const candidate=crypto.scryptSync(password,record.salt,64);
  const original=Buffer.from(record.hash,"hex");
  return original.length===candidate.length && crypto.timingSafeEqual(original,candidate);
}
function sign(payload){
  const body=Buffer.from(JSON.stringify({...payload,exp:Date.now()+8*60*60*1000})).toString("base64url");
  const sig=crypto.createHmac("sha256",JWT_SECRET).update(body).digest("base64url");
  return body+"."+sig;
}
function auth(req,res,next){
  const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  const parts=token.split(".");
  if(parts.length!==2)return res.status(401).json({error:"يلزم تسجيل الدخول"});
  const expected=crypto.createHmac("sha256",JWT_SECRET).update(parts[0]).digest();
  let actual;try{actual=Buffer.from(parts[1],"base64url");}catch{return res.status(401).json({error:"جلسة غير صالحة"});}
  if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return res.status(401).json({error:"جلسة غير صالحة"});
  try{
    const p=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    if(p.exp<Date.now())return res.status(401).json({error:"انتهت الجلسة"});
    const user=db.users.find(u=>u.id===p.sub&&u.status==="approved");
    if(!user)return res.status(403).json({error:"الحساب غير مفعّل"});
    req.user=user;next();
  }catch{return res.status(401).json({error:"جلسة غير صالحة"});}
}
function admin(req,res,next){if(req.user.role!=="admin")return res.status(403).json({error:"هذه الصلاحية للمدير فقط"});next();}
function audit(actor,action,target,details={}){db.audit.unshift({id:crypto.randomUUID(),actor,action,target,details,at:new Date().toISOString()});db.audit=db.audit.slice(0,500);save();}
function publicUser(u){return {id:u.id,name:u.name,email:u.email,role:u.role,status:u.status};}

if(!db.users.some(u=>u.email===ADMIN_EMAIL&&u.role==="admin")){
  const pw=hashPassword(ADMIN_PASSWORD);
  db.users.push({id:crypto.randomUUID(),name:"المدير الرئيسي",email:ADMIN_EMAIL,role:"admin",status:"approved",...pw,createdAt:new Date().toISOString()});
  save();
}

app.get("/api/health",(req,res)=>res.json({ok:true,app:"AI TRADING BOT PRO 2.0",mode:"paper-simulation-only"}));

app.post("/api/register",(req,res)=>{
  const {name,email,password}=req.body||{};
  if(typeof name!=="string"||name.trim().length<2||name.trim().length>80||
     typeof email!=="string"||!/.+@.+\..+/.test(email)||email.length>160||
     typeof password!=="string"||password.length<10||password.length>100)
    return res.status(400).json({error:"أدخل اسمًا وبريدًا صحيحًا وكلمة مرور من 10 أحرف على الأقل"});
  const normalized=email.trim().toLowerCase();
  if(db.users.some(u=>u.email===normalized))return res.status(409).json({error:"هذا البريد مسجل بالفعل"});
  const pw=hashPassword(password);
  const user={id:crypto.randomUUID(),name:name.trim(),email:normalized,role:"user",status:"pending",...pw,createdAt:new Date().toISOString()};
  db.users.push(user);audit(null,"registration.requested",user.id);
  res.status(201).json({message:"تم استلام طلبك. حسابك في انتظار موافقة المدير.",status:"pending"});
});

const loginAttempts=new Map();
app.post("/api/login",(req,res)=>{ 
  const attemptKey=(req.ip||"unknown")+":"+String(req.body?.email||"").trim().toLowerCase();
  const attempt=loginAttempts.get(attemptKey)||{count:0,until:0};
  if(attempt.until>Date.now())return res.status(429).json({error:"محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى."});
  const {email,password}=req.body||{};
  const u=db.users.find(x=>x.email===String(email||"").trim().toLowerCase());
  if(!u||typeof password!=="string"||!verifyPassword(password,u)){
    attempt.count++; if(attempt.count>=6){attempt.until=Date.now()+10*60*1000;attempt.count=0;} loginAttempts.set(attemptKey,attempt);
    return res.status(401).json({error:"بيانات الدخول غير صحيحة"});
  }
  loginAttempts.delete(attemptKey);
  if(u.status!=="approved")return res.status(403).json({error:u.status==="pending"?"حسابك في انتظار موافقة الإدارة":"هذا الحساب غير مفعّل"});
  audit(u.id,"auth.login",u.id);
  res.json({token:sign({sub:u.id,role:u.role}),user:publicUser(u)});
});
app.get("/api/me",auth,(req,res)=>res.json({user:publicUser(req.user)}));

app.get("/api/admin/requests",auth,admin,(req,res)=>{
  res.json({requests:db.users.filter(u=>u.role==="user").map(u=>({...publicUser(u),createdAt:u.createdAt}))});
});
app.post("/api/admin/requests/:id",auth,admin,(req,res)=>{
  const decision=req.body?.decision;
  if(!["approved","rejected"].includes(decision))return res.status(400).json({error:"قرار غير صالح"});
  const u=db.users.find(x=>x.id===req.params.id&&x.role==="user");
  if(!u)return res.status(404).json({error:"الطلب غير موجود"});
  u.status=decision;audit(req.user.id,"registration."+decision,u.id);save();
  res.json({ok:true,status:u.status});
});
app.post("/api/admin/users/:id/disable",auth,admin,(req,res)=>{
  const u=db.users.find(x=>x.id===req.params.id&&x.role==="user");
  if(!u)return res.status(404).json({error:"المستخدم غير موجود"});
  u.status="disabled";audit(req.user.id,"user.disabled",u.id);save();res.json({ok:true});
});

// Four isolated paper-account slots. These are local demo ledgers only; no broker credentials or orders.
const paperProviders = [
  {id:"paper-1",name:"حساب تجريبي 1",provider:"Paper Provider A",currency:"USD"},
  {id:"paper-2",name:"حساب تجريبي 2",provider:"Paper Provider B",currency:"USD"},
  {id:"paper-3",name:"حساب تجريبي 3",provider:"Paper Provider C",currency:"USD"},
  {id:"paper-4",name:"حساب تجريبي 4",provider:"Paper Provider D",currency:"USD"}
];
app.get("/api/paper-accounts",auth,(req,res)=>{
  res.json({mode:"paper-only",liveConnectionsEnabled:false,accounts:paperProviders.map((a)=>({...a,status:"demo-only",virtualBalanceCents:1000000,openPositions:0,notice:"حساب افتراضي مستقل؛ لا يتصل بوسيط حقيقي."}))});
});

app.get("/api/dashboard",auth,(req,res)=>{
  const start=1000000;
  const delta=db.ledger.reduce((sum,e)=>sum+e.amountCents,0);
  res.json({virtualCashCents:start+delta,pendingRequests:req.user.role==="admin"?db.users.filter(u=>u.role==="user"&&u.status==="pending").length:null,
    ledger:db.ledger.slice(0,20),reconciliation:{ok:Number.isSafeInteger(start+delta),expectedCents:start+delta}});
});
app.post("/api/simulation/demo",auth,(req,res)=>{
  audit(req.user.id,"simulation.demo.viewed",null,{note:"No balance changes; demonstration endpoint only."});
  res.json({ok:true,netPnlCents:0,message:"تم تسجيل تشغيل تجريبي فقط؛ لم تتم إضافة أرباح أو تغيير الرصيد."});
});
app.post("/api/analyze",auth,(req,res)=>{
  try {
    const result=analyzeCandles(req.body?.candles);
    audit(req.user.id,"analysis.completed",null,{candles:result.candlesAnalyzed,score:result.consensus.score});
    res.json(result);
  } catch(error) {
    res.status(400).json({error:error.message||"تعذر تحليل البيانات"});
  }
});

app.post("/api/backtest",auth,(req,res)=>{
  try {
    const result=backtest(req.body?.candles,req.body?.parameters||{});
    audit(req.user.id,"backtest.completed",null,{candles:req.body.candles.length,returnPct:result.metrics.returnPct});
    res.json(result);
  } catch(error) { res.status(400).json({error:error.message||"تعذر الاختبار التاريخي"}); }
});
// Evidence-led learning loop. It records paper-analysis outcomes and creates daily review suggestions only.
app.get("/api/learning/summary",auth,(req,res)=>res.json(getLearningSummary(db)));
app.post("/api/learning/outcomes",auth,(req,res)=>{
  try { const item=recordOutcome(db,req.user.id,req.body||{}); audit(req.user.id,"learning.outcome.recorded",item.id,{category:item.category,absoluteError:item.absoluteError}); save(); res.status(201).json({outcome:item,summary:getLearningSummary(db)}); }
  catch(error){ res.status(400).json({error:error.message||"تعذر تسجيل النتيجة"}); }
});
app.post("/api/learning/daily-review",auth,(req,res)=>{
  const review=buildDailyReview(db); audit(req.user.id,"learning.daily_review.generated",review.id,{day:review.day,observations:review.observations}); save(); res.json({review,summary:getLearningSummary(db)});
});

app.get("/api/experiments",auth,(req,res)=>res.json({experiments:db.experiments}));
app.post("/api/experiments",auth,(req,res)=>{
  const {title,hypothesis}=req.body||{};
  if(typeof title!=="string"||title.trim().length<3||title.length>100||typeof hypothesis!=="string"||hypothesis.trim().length<5||hypothesis.length>1000)
    return res.status(400).json({error:"أدخل عنوانًا وفرضية صحيحة"});
  const e={id:crypto.randomUUID(),title:title.trim(),hypothesis:hypothesis.trim(),status:"proposed",result:"",at:new Date().toISOString()};
  db.experiments.unshift(e);audit(req.user.id,"experiment.created",e.id);save();res.status(201).json({experiment:e});
});
app.get("/api/audit",auth,admin,(req,res)=>res.json({events:db.audit.slice(0,100)}));

app.use(express.static(path.join(__dirname,"public"),{extensions:["html"]}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,"0.0.0.0",()=>console.log("AI TRADING BOT PRO 2.0 listening on "+PORT));
