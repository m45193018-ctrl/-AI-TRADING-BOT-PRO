// Daily learning review: evidence-led suggestions only; never mutates production strategies.
const crypto = require('crypto');
const DAY_MS = 24 * 60 * 60 * 1000;
function classifyOutcome(event) {
  const expected = Number(event.expectedScore);
  const actual = Number(event.actualScore);
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) throw new Error('يلزم إدخال درجتي التوقع والنتيجة كأرقام.');
  if (Math.abs(expected) > 100 || Math.abs(actual) > 100) throw new Error('الدرجات يجب أن تكون بين -100 و100.');
  const error = actual - expected;
  return { error, absoluteError: Math.abs(error), category: Math.abs(error) >= 30 ? 'large-error' : Math.abs(error) >= 10 ? 'moderate-error' : 'small-error' };
}
function recordOutcome(db, actor, input) {
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
  const result = classifyOutcome(input);
  const item = { id: crypto.randomUUID(), actor, expectedScore: Number(input.expectedScore), actualScore: Number(input.actualScore), ...result, note, at: new Date().toISOString() };
  db.learningEvents ||= []; db.learningEvents.unshift(item); db.learningEvents = db.learningEvents.slice(0, 1000);
  return item;
}
function buildDailyReview(db, now = new Date()) {
  db.learningEvents ||= []; db.dailyReviews ||= [];
  const day = now.toISOString().slice(0, 10);
  const existing = db.dailyReviews.find(x => x.day === day);
  if (existing) return { ...existing, alreadyGenerated: true };
  const since = now.getTime() - DAY_MS;
  const events = db.learningEvents.filter(e => new Date(e.at).getTime() >= since && new Date(e.at).getTime() <= now.getTime());
  const meanAbsError = events.length ? events.reduce((s,e)=>s+e.absoluteError,0)/events.length : null;
  const largeErrors = events.filter(e=>e.category==='large-error').length;
  const suggestions = [];
  if (!events.length) suggestions.push({ title:'جمع بيانات تقييم كافية', reason:'لا توجد نتائج مسجلة خلال آخر 24 ساعة؛ لا يمكن إثبات تحسن اليوم.', status:'needs-data' });
  else {
    if (largeErrors) suggestions.push({ title:'مراجعة الحالات ذات الخطأ الكبير', reason:`تم رصد ${largeErrors} حالة بخطأ مطلق 30 نقطة أو أكثر. راجع البيانات والسياق قبل تعديل الاستراتيجية.`, status:'proposed' });
    if (meanAbsError !== null) suggestions.push({ title:'قياس خطأ التوقع', reason:`متوسط الخطأ المطلق المسجل ${meanAbsError.toFixed(2)} نقطة. قارن هذا المؤشر بعينة اختبار مستقلة قبل أي اعتماد.`, status:'proposed' });
    suggestions.push({ title:'اختبار التحسين خارج العينة', reason:'أي تغيير مقترح يجب اختباره على بيانات لم تُستخدم في ضبطه ومقارنته بالإصدار المستقر.', status:'required-check' });
  }
  const review = { id:crypto.randomUUID(), day, generatedAt:now.toISOString(), observations:events.length, meanAbsoluteError:meanAbsError===null?null:Number(meanAbsError.toFixed(4)), largeErrors, decision:events.length?'اقتراحات للمراجعة — لم يتم تعديل أي استراتيجية':'لا يوجد تحسين مؤهل اليوم', suggestions };
  db.dailyReviews.unshift(review); db.dailyReviews=db.dailyReviews.slice(0,180);
  return review;
}
function getLearningSummary(db) {
  db.learningEvents ||= []; db.dailyReviews ||= [];
  const events = db.learningEvents.slice(0,100);
  const mean = events.length ? events.reduce((s,e)=>s+e.absoluteError,0)/events.length : null;
  return { engine:'Daily Self-Improvement Engine', mode:'paper-review-only', automaticCodeChanges:false, liveTradingEnabled:false, totalRecordedOutcomes:db.learningEvents.length, recentMeanAbsoluteError:mean===null?null:Number(mean.toFixed(4)), recentEvents:events.slice(0,10), dailyReviews:db.dailyReviews.slice(0,10), notice:'المحرك يسجل النتائج ويقترح اختبارات فقط؛ لا يعدّل الكود أو ينفذ تداولًا تلقائيًا.' };
}
module.exports = { classifyOutcome, recordOutcome, buildDailyReview, getLearningSummary };
