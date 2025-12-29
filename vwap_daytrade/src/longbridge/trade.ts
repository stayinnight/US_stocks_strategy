import { tradeCtx } from './client';

async function placeOrder({ symbol, side, qty }) {
  console.log(`[ORDER] ${symbol} ${side} ${qty}`);
  return tradeCtx.placeOrder({
    symbol,
    side,
    quantity: qty,
    orderType: 'Market',
  });
}

async function getAccountEquity() {
  const res = await tradeCtx.accountBalance();
  return Number(res.totalAssets);
}

async function closeAllPositions() {
  const positions = await tradeCtx.stockPositions();

  for (const pos of positions) {
    if (pos.quantity <= 0) continue;

    const side = pos.side === 'Long' ? 'Sell' : 'Buy';

    console.log(
      `[FORCE CLOSE] ${pos.symbol} qty=${pos.quantity}`
    );

    await tradeCtx.placeOrder({
      symbol: pos.symbol,
      side,
      quantity: pos.quantity,
      orderType: 'Market',
    });
  }
}


export {
  placeOrder,
  getAccountEquity,
  closeAllPositions
};
