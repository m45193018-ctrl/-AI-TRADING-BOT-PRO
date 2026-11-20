const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyOutcome, recordOutcome, buildDailyReview, getLearningSummary } = require('./learning-engine');

test('classifies prediction error and validates score bounds', () => {
  assert.equal(classifyOutcome({expectedScore:10,actualScore:45}).category, 'large-error');
  assert.throws(() => classifyOutcome({expectedScore:101,actualScore:0}));
});

test('records an outcome and daily review without enabling automatic changes', () => {
  const db = {learningEvents:[],dailyReviews:[]};
  recordOutcome(db,'user-1',{expectedScore:20,actualScore:5,note:'test'});
  const now = new Date();
  const review = buildDailyReview(db,now);
  assert.equal(review.observations,1);
  assert.equal(review.decision,'اقتراحات للمراجعة — لم يتم تعديل أي استراتيجية');
  assert.equal(buildDailyReview(db,now).alreadyGenerated,true);
  assert.equal(getLearningSummary(db).automaticCodeChanges,false);
});

test('daily review does not claim improvement without observations', () => {
  const db = {learningEvents:[],dailyReviews:[]};
  const review = buildDailyReview(db,new Date());
  assert.equal(review.observations,0);
  assert.equal(review.decision,'لا يوجد تحسين مؤهل اليوم');
});
