// Educational statistics for simulated equity curves only.
function summarizeEquity(curve, periodsPerYear=252) {
  if (!Array.isArray(curve) || curve.length < 2) throw new Error("يلزم نقطتان على الأقل في منحنى المحفظة.");
  if (!Number.isFinite(periodsPerYear) || periodsPerYear <= 0 || periodsPerYear > 100000) throw new Error("قيمة الفترات السنوية غير صحيحة.");
  const values=curve.map(p=>Number(typeof p==="number"?p:p?.equity));
  if(values.some(v=>!Number.isFinite(v)||v<=0)) throw new Error("قيم المحفظة يجب أن تكون أرقامًا موجبة.");
  const returns=values.slice(1).map((v,i)=>v/values[i]-1);
  const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
  const variance=returns.reduce((a,b)=>a+(b-mean)**2,0)/returns.length;
  const volatility=Math.sqrt(variance)*Math.sqrt(periodsPerYear);
  const downside=returns.filter(r=>r<0);
  const downsideDeviation=downside.length
    ? Math.sqrt(downside.reduce((a,r)=>a+r*r,0)/returns.length)*Math.sqrt(periodsPerYear)
    : 0;
  let peak=values[0],maxDrawdown=0,underwater=0,longestUnderwater=0;
  for(const v of values){
    peak=Math.max(peak,v);
    const dd=(peak-v)/peak;
    maxDrawdown=Math.max(maxDrawdown,dd);
    underwater=dd>0?underwater+1:0;
    longestUnderwater=Math.max(longestUnderwater,underwater);
  }
  const annualizedReturn=Math.pow(values.at(-1)/values[0],periodsPerYear/returns.length)-1;
  return {
    totalReturnPct:Number(((values.at(-1)/values[0]-1)*100).toFixed(3)),
    annualizedReturnPct:Number((annualizedReturn*100).toFixed(3)),
    annualizedVolatilityPct:Number((volatility*100).toFixed(3)),
    maxDrawdownPct:Number((maxDrawdown*100).toFixed(3)),
    sharpeRatio:volatility?Number((mean*Math.sqrt(periodsPerYear)/volatility).toFixed(3)):null,
    sortinoRatio:downsideDeviation?Number((mean*periodsPerYear/downsideDeviation).toFixed(3)):null,
    longestUnderwaterPeriods:longestUnderwater,
    observations:returns.length,
    note:"مقاييس إحصائية تاريخية لعينة افتراضية؛ لا تقيس احتمال الربح ولا تتنبأ بالمستقبل."
  };
}
module.exports={summarizeEquity};
