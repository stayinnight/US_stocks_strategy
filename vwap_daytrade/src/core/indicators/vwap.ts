
/**
 * VWAP & ATR 计算模块
 */
import { SecurityQuote } from "longport";
import strategyConfig from "../../config/strategy.config";

function calcVWAP(quote: SecurityQuote) {
  return quote.turnover.toNumber() / quote.volume;
}

function calcVWAPBands(vwap: number, atr: number, ratio: number) {
  return {
    upper: vwap + atr * ratio,
    lower: vwap - atr * ratio,
  };
}
/**
 * 计算 VWAP 斜率（线性回归）
 * @param {number[]} vwapList - 最近 N 根 K 线的 VWAP 数组（按时间先后）
 * @returns {number} slope - VWAP 每根 K 线的变化速度
 */
function calcVWAPSlope(
  quotes: SecurityQuote[],
  period = strategyConfig.vwapSmoothPeriod
) {
  // 时间上需要从后往前
  const vwapList = quotes.map(quote => calcVWAP(quote)).reverse();
  const n = vwapList.length
  if (n < period) return null;

  // 1️⃣ 构造时间序列 x = [1, 2, 3, ..., n]
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0

  for (let i = 0; i < Math.min(period, n); i++) {
    const x = i + 1        // 时间索引
    const y = vwapList[i] // 对应时间点的 VWAP

    sumX += x
    sumY += y
    sumXY += x * y
    sumXX += x * x
  }

  // 2️⃣ 线性回归公式：k = (nΣxy - ΣxΣy) / (nΣx² - (Σx)²)
  const numerator = n * sumXY - sumX * sumY
  const denominator = n * sumXX - sumX * sumX

  if (denominator === 0) return 0

  return numerator / denominator
}

export { calcVWAP, calcVWAPBands, calcVWAPSlope };
