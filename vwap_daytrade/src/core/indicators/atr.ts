/**
 * 使用日线 K 线计算 ATR(14)
 * ATR = EMA(TR, 14)
 */
import { Candlestick, Decimal } from 'longport';
import config from '../../config/strategy.config';

import { getDailyBars } from "../../longbridge/market";
import { logger } from '../../utils/logger';

const { atr } = require('trading-indicator')

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

class ATRManager {
  private atrMap: Record<string, number> = {};

  async preloadATR() {
    logger.info('📐 计算前一交易日 ATR');
    for (const symbol of config.symbols) {
      const dailyBars = await getDailyBars(symbol, config.atrPeriod * 2);
      const atr = await calcATR(dailyBars);
      if (atr) {
        this.atrMap[symbol] = atr;
        logger.info(`[ATR] ${symbol} ATR=${atr?.toFixed(2)}`);
      }
    }
  }

  getATR(symbol: string) {
    return this.atrMap[symbol];
  }
}

export {
  ATRManager
};
