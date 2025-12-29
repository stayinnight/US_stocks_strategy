const SymbolState = require('../core/state');
const { placeOrder } = require('../longbridge/trade');
const { getAccountEquity } = require('../longbridge/trade');
const { calcPositionSize } = require('../core/position');

class VWAPStrategy {
    constructor(config) {
        this.config = config;
        this.dailyRisk = dailyRisk;
        this.states = {};
    }

    canOpen() {
        return this.dailyRisk.canTrade();
    }

    getState(symbol) {
        if (!this.states[symbol]) {
            this.states[symbol] = new SymbolState();
        }
        return this.states[symbol];
    }

    async onBar(symbol, atr) {
        this.managePosition(symbol, cur.close, vwap, atr);
    }

    managePosition(symbol, price, vwap, atr) {
        const state = this.getState(symbol);
        if (!state.position) return;

        const dir = state.position === 'LONG' ? 1 : -1;

        // ===== 半仓止盈 + 保本 =====
        if (
            !state.halfClosed &&
            dir * (price - vwap) >= this.config.tpProtectAtrRatio * atr
        ) {
            console.log(`[TP1] ${symbol} 半仓止盈`);
            placeOrder({
                symbol,
                side: state.position === 'LONG' ? 'Sell' : 'Buy',
                qty: state.qty / 2,
            });

            state.halfClosed = true;
            state.stopPrice = state.entryPrice; // 保本
        }

        // ===== 最终止盈 =====
        if (
            dir * (price - vwap) >= this.config.tpFinalAtrRatio * atr
        ) {
            console.log(`[TP2] ${symbol} 全部平仓`);
            placeOrder({
                symbol,
                side: state.position === 'LONG' ? 'Sell' : 'Buy',
                qty: state.qty,
            });

            state.reset();
        }

        // ===== 移动止损 =====
        if (
            state.stopPrice &&
            dir * (price - state.stopPrice) <= 0
        ) {
            console.log(`[STOP] ${symbol} 止损触发`);
            placeOrder({
                symbol,
                side: state.position === 'LONG' ? 'Sell' : 'Buy',
                qty: state.qty,
            });

            state.reset();
        }
    }

    async open(symbol, side, price) {
        if (!this.canOpen()) {
            console.log(`[BLOCK] 风控冻结，禁止开仓`);
            return;
        }
        
        const equity = await getAccountEquity();

        const qty = calcPositionSize({
            equity,
            pct: this.config.positionPctPerTrade,
            price,
        });

        if (qty <= 0) return;

        console.log(`[ENTRY] ${symbol} ${side} qty=${qty}`);

        await placeOrder({
            symbol,
            side: side === 'LONG' ? 'Buy' : 'Sell',
            qty,
        });

        const state = this.getState(symbol);
        state.traded = true;
        state.position = side;
        state.entryPrice = price;
        state.qty = qty;
    }
}

export default VWAPStrategy;
