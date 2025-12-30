import { Decimal, OrderSide, OrderType, TimeInForceType } from 'longport';
import { getTradeCtx } from './client';

/**
 * 下单
 * @param param0 
 * @returns 
 */
async function placeOrder({ symbol, side, qty }: {
  symbol: string,
  side: OrderSide,
  qty: number
}) {
  console.log(`[ORDER] ${symbol} ${side} ${qty}`);
  const c = await getTradeCtx();
  return c.submitOrder({
    symbol,
    orderType: OrderType.MO,
    submittedQuantity: new Decimal(qty),
    side,
    timeInForce: TimeInForceType.Day,
  });
}

/**
 * 获取账户总资产
 * @returns 
 */
async function getAccountEquity() {
  const c = await getTradeCtx();
  const res = await c.accountBalance();
  return Number(res[0].netAssets);
}

/**
 * 强制平仓所有持仓
 * @returns 
 */
async function closeAllPositions() {
  const c = await getTradeCtx();
  const positions = await c.stockPositions();

  for (const pos of positions.channels) {
    const [curr] = pos.positions;
    if (curr.availableQuantity.toNumber() === 0) continue;
    const side = curr.availableQuantity.toNumber() > 0 ? OrderSide.Sell : OrderSide.Buy;

    console.log(
      `[FORCE CLOSE] ${curr.symbol} qty=${curr.availableQuantity}`
    );

    await placeOrder({
      symbol: curr.symbol,
      side,
      qty: Math.abs(curr.availableQuantity.toNumber()),
    });
  }
}


export {
  placeOrder,
  getAccountEquity,
  closeAllPositions
};
