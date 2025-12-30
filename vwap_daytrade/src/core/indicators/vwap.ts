
/**
 * VWAP & ATR 计算模块
 */
import { Candlestick, Decimal } from "longport";
const { vwap } = require('trading-indicator')

async function calcVWAP(bars: Candlestick[]) {
  const input = {
    open: [] as Decimal[],
    high: [] as Decimal[],
    low: [] as Decimal[],
    close: [] as Decimal[],
    volume: [] as number[],
  }
  bars.forEach((bar, i) => {
    input.open.push(bar.open);
    input.high.push(bar.high);
    input.low.push(bar.low);
    input.close.push(bar.close);
    input.volume.push(bar.volume);
  })
  const vwapArr = await vwap(input);
  return vwapArr.at(-1);
}

function calcVWAPBands(vwap: number, atr: number, ratio: number) {
  return {
    upper: vwap + atr * ratio,
    lower: vwap - atr * ratio,
  };
}

export { calcVWAP, calcVWAPBands };
