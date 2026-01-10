import { OrderSide } from 'longport';

class SymbolState {
  buyTraded: boolean;
  sellTraded: boolean;

  position: OrderSide | null;
  entryPrice: number | null;
  qty: number;
  stopDistance: number | null; // 止损距离
  stopPrice: number | null;
  halfClosed: boolean;

  constructor(buyTraded: boolean = false, sellTraded: boolean = false) {
    this.buyTraded = buyTraded;
    this.sellTraded = sellTraded;

    this.position = null;      // LONG | SHORT
    this.entryPrice = null;
    this.qty = 0;

    this.stopDistance = null; 
    this.stopPrice = null;
    this.halfClosed = false;
  }

  reset() {
    // 每次只重置交易状态，保留已交易方向的记录
    Object.assign(this, new SymbolState(this.buyTraded, this.sellTraded));
  }

  toString() {
    return JSON.stringify({
        buyTraded: this.buyTraded,
        sellTraded: this.sellTraded,
        position: this.position,
        entryPrice: this.entryPrice,
        qty: this.qty,
        stopPrice: this.stopPrice,
        halfClosed: this.halfClosed,
        stopDistance: this.stopDistance
    })
  }
}

export default SymbolState;
