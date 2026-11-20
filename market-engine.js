const { summarizeEquity } = require("./risk-metrics");
// ATBP deterministic research engine. Educational/paper analysis only; no order execution.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const std=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));};
function sma(a,n){return a.length<n?null:mean(a.slice(-n));}
function ema(a,n){const k=2/(n+1);let v=a[0];for(let i=1;i<a.length;i++)v=a[i]*k+v*(1-k);return v;}
function rsi(a,n=14){let g=0,l=0;for(let i=a.length-n;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)g+=d;else l-=d;}if(l===0)return g===0?50:100;return 100-100/(1+g/l);}
function validate(c){
 if(!Array.isArray(c)||c.length<35||c.length>5000)throw Error("يلزم إدخال 35 إلى 5000 شمعة.");
 for(const x of c){for(const k of ["open","high","low","close","volume"])if(!Number.isFinite(Number(x?.[k])))throw Error("صيغة OHLCV غير مكتملة.");
 const o=+x.open,h=+x.high,l=+x.low,cl=+x.close,v=+x.volume;
 if(l<=0||o<=0||cl<=0||v<0||h<Math.max(o,cl)||l>Math.min(o,cl))throw Error("بيانات OHLCV غير متسقة.");}
 return c.map(x=>({open:+x.open,high:+x.high,low:+x.low,close:+x.close,volume:+x.volume}));
}
function readings(a){
 const last=a.at(-1),s10=sma(a,10),s30=sma(a,30),r=rsi(a),m=ema(a,12)-ema(a,26),prev=ema(a.slice(0,-1),12)-ema(a.slice(0,-1),26);
 const mid=sma(a,20),sd=std(a.slice(-20)),mom=(last/a.at(-11)-1)*100;
 const rets=a.slice(-21).slice(1).map((v,i)=>v/a.slice(-21)[i]-1),vol=std(rets)*Math.sqrt(252)*100;
 const combo=(s10>s30?1:s10<s30?-1:0)+(r<45?1:r>55?-1:0)+(m>0?1:m<0?-1:0);
 const rows=[
 ["Moving Average Crossover",Math.sign(s10-s30),`SMA10=${s10.toFixed(4)} / SMA30=${s30.toFixed(4)}`],
 ["RSI",r<30?1:r>70?-1:0,`RSI=${r.toFixed(2)}`],
 ["MACD",Math.sign(m-prev),`MACD=${m.toFixed(5)}`],
 ["Bollinger Bands",last<mid-2*sd?1:last>mid+2*sd?-1:0,`النطاق ${(mid-2*sd).toFixed(4)} إلى ${(mid+2*sd).toFixed(4)}`],
 ["Momentum",mom>1?1:mom< -1?-1:0,`الزخم=${mom.toFixed(2)}%`],
 ["Trend Following",Math.sign(s10-s30),`الاتجاه ${s10>s30?"صاعد":s10<s30?"هابط":"محايد"}`],
 ["Mean Reversion",last<mid-sd?1:last>mid+sd?-1:0,`الابتعاد عن المتوسط ${(last-mid).toFixed(4)}`],
 ["Volatility Analysis",vol>35?0:Math.sign(mom),`تقلب سنوي تقريبي=${vol.toFixed(2)}%`],
 ["Multi-Indicator Confirmation",combo>=2?1:combo<=-2?-1:0,"تجميع المتوسطات وRSI وMACD"]
 ];
 return {rows,last,s10,s30,r,macd:m,mid,upper:mid+2*sd,lower:mid-2*sd,mom,vol};
}
function analyzeCandles(input){
 const c=validate(input),a=c.map(x=>x.close),x=readings(a),score=x.rows.reduce((s,r)=>s+r[1],0);
 const agents=[
 ["Trend Agent",Math.sign(x.s10-x.s30),"اتجاه المتوسطات"],
 ["Momentum Agent",Math.sign(x.mom),"زخم السعر"],
 ["Risk Agent",x.vol>35?0:Math.sign(x.mom),"التقلب التاريخي"],
 ["Mean-Reversion Agent",x.last<x.mid-std(a.slice(-20))?1:x.last>x.mid+std(a.slice(-20))?-1:0,"الابتعاد عن المتوسط"],
 ["Indicator Agent",Math.sign(x.macd),"إشارة MACD"],
 ["Data Guardian",0,"فحوص جودة OHLCV اجتازت التحقق"]
 ];
 const agentScore=agents.reduce((s,a)=>s+a[1],0);
 return {engine:"ATBP Research Engine 2.2",generatedAt:new Date().toISOString(),disclaimer:"قراءة تعليمية تاريخية للبيانات المدخلة، لا تمثل توصية أو توقعًا موثوقًا ولا تنفذ أوامر.",candlesAnalyzed:c.length,lastClose:x.last,indicators:{sma10:x.s10,sma30:x.s30,rsi:x.r,macd:x.macd,bollinger:{middle:x.mid,upper:x.upper,lower:x.lower},momentumPct:x.mom,annualizedVolatilityPct:x.vol},consensus:{score,maxScore:9,reading:score>=3?"ميل صاعد":score<=-3?"ميل هابط":"إشارات مختلطة",agreementPct:Math.round(Math.abs(score)/9*100)},strategies:x.rows.map(([name,v,explanation])=>({name,signal:v>0?"إيجابي":v<0?"سلبي":"محايد",explanation})),agents:agents.map(([name,v,reason])=>({name,vote:v>0?"إيجابي":v<0?"سلبي":"محايد",reason})),council:{score:agentScore,reading:agentScore>=2?"ميل صاعد":agentScore<=-2?"ميل هابط":"غير حاسم"},dataQuality:{valid:true,checks:["35 شمعة على الأقل","قيم رقمية","أسعار موجبة","اتساق OHLC","حجم غير سالب"],warnings:x.vol>60?["تقلب مرتفع في العينة"]:[]}};
}
function backtest(input,opts={}){
 const c=validate(input),fast=clamp(Number(opts.fast)||10,3,50),slow=clamp(Number(opts.slow)||30,fast+1,150);
 const fee=clamp(Number(opts.feeBps)||5,0,100),slip=clamp(Number(opts.slippageBps)||5,0,100);
 let cash=10000,units=0,trades=0,wins=0,peak=10000,maxDD=0,entry=0;const curve=[];
 for(let i=slow;i<c.length;i++){
  const closes=c.slice(0,i).map(x=>x.close),f=sma(closes,fast),s=sma(closes,slow),price=c[i].close;
  const target=f>s?1:0;
  if(target===1&&units===0){const cost=price*(1+(fee+slip)/10000);units=cash/cost;cash=0;entry=cost;trades++;}
  else if(target===0&&units>0){const proceeds=units*price*(1-(fee+slip)/10000);if(proceeds>units*entry)wins++;cash=proceeds;units=0;trades++;}
  const equity=cash+units*price;peak=Math.max(peak,equity);maxDD=Math.max(maxDD,(peak-equity)/peak);curve.push({index:i,equity:Number(equity.toFixed(2))});
 }
 const final= cash+units*c.at(-1).close,ret=(final/10000-1)*100;
 return {disclaimer:"اختبار تاريخي مبسط لاستراتيجية تقاطع متوسطات، وليس محاكاة تنفيذ واقعي أو توقعًا للمستقبل. لا يتضمن تمويلًا أو تداولًا حقيقيًا.",parameters:{initialCapital:10000,fast,slow,feeBps:fee,slippageBps:slip},metrics:{finalEquity:Number(final.toFixed(2)),returnPct:Number(ret.toFixed(2)),maxDrawdownPct:Number((maxDD*100).toFixed(2)),closedTrades:trades,profitableExits:wins,winRatePct:trades?Number((wins/Math.ceil(trades/2)*100).toFixed(2)):0},equityCurve:curve.slice(-250),riskMetrics:summarizeEquity([{equity:10000},...curve])};
}
module.exports={analyzeCandles,backtest,validate};
