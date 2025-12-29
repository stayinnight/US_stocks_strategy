const { quoteCtx } = require('./client');

/**
 * 获取 1 分钟 K 线
 */
async function getMinuteBars(symbol, count = 500) {
  const res = await quoteCtx.candlesticks(
    symbol,
    '1min',
    count
  );
  return res;
}

async function getDailyBars(symbol, count = 30) {
  return quoteCtx.candlesticks(
    symbol,
    'day',
    count
  );
}

export {
  getMinuteBars,
  getDailyBars,
};

