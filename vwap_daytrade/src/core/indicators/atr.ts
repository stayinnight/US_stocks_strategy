/**
 * 使用日线 K 线计算 ATR(14)
 * ATR = EMA(TR, 14)
 */
import { Candlestick } from 'longport';
import config from '../../config/strategy.config';

import { getDailyBars } from "../../longbridge/market";
import { logger } from '../../utils/logger';

import { atr } from 'technicalindicators'
import { ATRInput } from 'technicalindicators/declarations/directionalmovement/ATR';

async function calcATR(dailyBars: Candlestick[]) {
  const input: ATRInput = {
    high: [] as number[],
    low: [] as number[],
    close: [] as number[],
    period: config.atrPeriod,
  }
  dailyBars.forEach((bar, i) => {
    input.high.push(bar.high.toNumber());
    input.low.push(bar.low.toNumber());
    input.close.push(bar.close.toNumber());
  })
  const atrArr = atr(input)
  return atrArr[atrArr.length - 1];
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
    return this.atrMap;
  }

  getATR(symbol: string) {
    return this.atrMap[symbol];
  }
}

export {
  ATRManager
};
