/**
 * 使用日线 K 线计算 ATR(14)
 * ATR = EMA(TR, 14)
 */
import { Candlestick, Decimal } from 'longport';
import config from '../../config/strategy.config';

import { getDailyBars } from "../../longbridge/market";

const { atr } = require('trading-indicator')

export const atrMap: Record<string, number> = {};

async function calcATR(dailyBars: Candlestick[]) {
  const input = {
    open: [] as Decimal[],
    high: [] as Decimal[],
    low: [] as Decimal[],
    close: [] as Decimal[],
    volume: [] as number[],
  }
  dailyBars.forEach((bar, i) => {
    input.open.push(bar.open);
    input.high.push(bar.high);
    input.low.push(bar.low);
    input.close.push(bar.close);
    input.volume.push(bar.volume);
  })
  const atrArr = await atr(config.atrPeriod, "close", input)
  const curATR = atrArr.at(-1)
  return curATR;
}

async function preloadATR() {
  console.log('📐 计算前一交易日 ATR');
  for (const symbol of config.symbols) {
    const dailyBars = await getDailyBars(symbol, config.atrPeriod * 2);
    const atr = await calcATR(dailyBars);
    if (atr) {
      atrMap[symbol] = atr;
      console.log(`[ATR] ${symbol} ATR=${atr?.toFixed(2)}`);
    }
  }
}

export {
  preloadATR,
  calcATR,
};
