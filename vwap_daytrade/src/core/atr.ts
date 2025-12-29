/**
 * 使用日线 K 线计算 ATR(14)
 * ATR = EMA(TR, 14)
 */

function trueRange(cur, prev) {
  return Math.max(
    cur.high - cur.low,
    Math.abs(cur.high - prev.close),
    Math.abs(cur.low - prev.close)
  );
}

function calcATR(dailyBars, period = 14) {
  if (dailyBars.length < period + 1) return null;

  let trs = [];
  for (let i = 1; i < dailyBars.length; i++) {
    trs.push(trueRange(dailyBars[i], dailyBars[i - 1]));
  }

  // 使用简单 EMA
  const k = 2 / (period + 1);
  let atr = trs[0];
  for (let i = 1; i < trs.length; i++) {
    atr = trs[i] * k + atr * (1 - k);
  }

  return atr;
}

export {
  calcATR,
};
