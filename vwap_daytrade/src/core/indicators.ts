/**
 * VWAP & ATR 计算模块
 */

function calcVWAP(bars) {
  let totalPV = 0;
  let totalVolume = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    totalPV += typicalPrice * bar.volume;
    totalVolume += bar.volume;
  }

  return totalVolume === 0 ? null : totalPV / totalVolume;
}

function calcVWAPBands(vwap, atr, ratio) {
  return {
    upper: vwap + atr * ratio,
    lower: vwap - atr * ratio,
  };
}

module.exports = {
  calcVWAP,
  calcVWAPBands,
};
