const { Config, QuoteContext, TradeContext } = require('longport');

const config = new Config({
  app_key: process.env.LB_APP_KEY,
  app_secret: process.env.LB_APP_SECRET,
  access_token: process.env.LB_ACCESS_TOKEN,
});

const quoteCtx = QuoteContext.new(config);
const tradeCtx = TradeContext.new(config);

export {
  quoteCtx,
  tradeCtx,
};
