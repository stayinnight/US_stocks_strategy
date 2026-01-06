
/**
 * VWAP & ATR 计算模块
 */
import { SecurityQuote } from "longport";

async function calcVWAP(quote: SecurityQuote) {
  return quote.turnover.toNumber() / quote.volume;
}

function calcVWAPBands(vwap: number, atr: number, ratio: number) {
  return {
    upper: vwap + atr * ratio,
    lower: vwap - atr * ratio,
  };
}

export { calcVWAP, calcVWAPBands };
