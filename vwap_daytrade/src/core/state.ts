class SymbolState {
  constructor() {
    this.traded = false;

    this.position = null;      // LONG | SHORT
    this.entryPrice = null;
    this.qty = 0;

    this.stopPrice = null;
    this.halfClosed = false;
  }

  reset() {
    Object.assign(this, new SymbolState());
  }
}

export default SymbolState;
