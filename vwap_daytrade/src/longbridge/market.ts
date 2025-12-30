import { Period, AdjustType, TradeSessions } from 'longport';
import { getQuoteCtx } from './client';

/**
 * 获取 1 分钟 K 线
 */
async function getMinuteBars(symbol: string, count = 1) {
  const c = await getQuoteCtx();
  const [res] = await c.candlesticks(
    symbol,
    Period.Min_1,
    count,
    AdjustType.NoAdjust,
    TradeSessions.Intraday
  );
  return res;
}

/**
 * 获取 5 分钟 K 线
 */
async function getFiveMinuteBars(symbol: string, count = 500) {
  const c = await getQuoteCtx();
  const res = await c.candlesticks(
    symbol,
    Period.Min_5,
    count,
    AdjustType.NoAdjust,
    TradeSessions.Intraday
  );
  return res;
}

/**
 * 获取日线 K 线
 */
async function getDailyBars(symbol: string, count = 14) {
  const c = await getQuoteCtx();
  return await c.candlesticks(
    symbol,
    Period.Day,
    count,
    AdjustType.NoAdjust,
    TradeSessions.Intraday
  );
}

export {
  getMinuteBars,
  getFiveMinuteBars,
  getDailyBars,
};

