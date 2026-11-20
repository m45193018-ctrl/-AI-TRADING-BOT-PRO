const test=require('node:test');const assert=require('node:assert/strict');const {analyzeCandles,backtest}=require('./market-engine');
function sample(n=120){return Array.from({length:n},(_,i)=>{const close=100+i*.08+Math.sin(i/4)*2;return {open:close-.2,high:close+.6,low:close-.6,close,volume:1000+i};});}
test('analysis provides nine strategies and six agent votes',()=>{const x=analyzeCandles(sample());assert.equal(x.strategies.length,9);assert.equal(x.agents.length,6);assert.equal(x.dataQuality.valid,true);});
test('rejects insufficient or malformed candles',()=>{assert.throws(()=>analyzeCandles(sample(10)));const a=sample();a[0].high=1;assert.throws(()=>analyzeCandles(a));});
test('backtest returns finite metrics and never negative curve values',()=>{const x=backtest(sample());assert.ok(Number.isFinite(x.metrics.returnPct));assert.ok(x.equityCurve.every(p=>p.equity>=0));});

const {summarizeEquity}=require('./risk-metrics');
test('risk metrics calculate drawdown and return for a paper equity curve',()=>{
 const m=summarizeEquity([100,110,99,120],4);
 assert.equal(m.totalReturnPct,20);
 assert.equal(m.maxDrawdownPct,10);
 assert.equal(m.observations,3);
});
test('risk metrics reject invalid equity curves',()=>{
 assert.throws(()=>summarizeEquity([100]));
 assert.throws(()=>summarizeEquity([100,0]));
});
