import { Candlestick, OrderSide } from "longport";
import { DailyRiskManager } from "../core/risk";
import SymbolState from "../core/state";
import { StrategyConfig } from "../interface/config";
import { calcVWAP } from "../core/indicators/vwap";
import { placeOrder, getAccountEquity } from "../longbridge/trade";
import { calcPositionSize } from "../core/position";

class VWAPStrategy {
    config: StrategyConfig;
    dailyRisk: DailyRiskManager;
    states: Record<string, SymbolState>;

    constructor(config: StrategyConfig, dailyRisk: DailyRiskManager) {
        this.config = config;
        this.dailyRisk = dailyRisk;
        this.states = {};
    }

    /**
     * 检查是否可以开仓
     * @param symbol 股票代码
     * @param price 当前价格
     * @param vwap VWAP值
     * @param atr ATR值
     * @returns 开仓方向（Buy/Sell）或null（不能开仓）
     */
    canOpen(symbol: string, price: number, vwap: number, atr: number) {
        if (!this.dailyRisk.canTrade()) {
            return null;
        }

        const state = this.getState(symbol);
        if (state.position) {
            return null;
        };

        let dir = null;
        if ((price - vwap) >= this.config.tpProtectAtrRatio * atr) {
            dir = OrderSide.Sell;
        } else if ((vwap - price) >= this.config.tpProtectAtrRatio * atr) {
            dir = OrderSide.Buy;
        }

        if (!dir) return null;

        return dir;
    }

    getState(symbol: string) {
        if (!this.states[symbol]) {
            this.states[symbol] = new SymbolState();
        }
        return this.states[symbol];
    }

    async onBar(symbol: string, bar: Candlestick, atr: number) {
        const vwap = await calcVWAP([bar]);
        const dir = this.canOpen(symbol, bar.close.toNumber(), vwap, atr);
        if (dir) {
            return this.open(symbol, dir, bar.close.toNumber());
        } else {
            return this.managePosition(symbol, bar.close.toNumber(), vwap, atr);
        }
    }

    async managePosition(symbol: string, price: number, vwap: number, atr: number) {
        const state = this.getState(symbol);
        if (!state.position) return;

        const dir = state.position === OrderSide.Buy ? 1 : -1;

        // ===== 半仓止盈 + 保本 =====
        if (
            !state.halfClosed &&
            dir * (price - vwap) >= this.config.tpProtectAtrRatio * atr
        ) {
            console.log(`[TP1] ${symbol} 半仓止盈`);

            await placeOrder({
                symbol,
                side: state.position === OrderSide.Buy ? OrderSide.Sell : OrderSide.Buy,
                qty: state.qty / 2,
            });

            state.halfClosed = true;
            state.stopPrice = state.entryPrice; // 保本
            state.qty = state.qty - state.qty / 2;
        }

        // ===== 最终止盈 =====
        if (
            dir * (price - vwap) >= this.config.tpFinalAtrRatio * atr
        ) {
            console.log(`[TP2] ${symbol} 全部平仓`);
            placeOrder({
                symbol,
                side: state.position === OrderSide.Buy ? OrderSide.Sell : OrderSide.Buy,
                qty: state.qty,
            });

            state.reset();
        }

        // ===== 移动止损 ===== TODO
        if (
            state.stopPrice &&
            dir * (price - state.stopPrice) <= 0
        ) {
            console.log(`[STOP] ${symbol} 止损触发`);
            placeOrder({
                symbol,
                side: state.position === OrderSide.Buy ? OrderSide.Sell : OrderSide.Buy,
                qty: state.qty,
            });

            state.reset();
        }
    }

    async open(symbol: string, side: OrderSide, price: number) {
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
            side,
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
