import { Candlestick, OrderSide, OrderStatus, SecurityQuote } from "longport";
import { RiskManager } from "../core/risk";
import SymbolState from "../core/state";
import { StrategyConfig } from "../interface/config";
import { calcVWAP } from "../core/indicators/vwap";
import { placeOrder, getAccountEquity, getOrderDetail } from "../longbridge/trade";
import { calcPositionSize } from "../core/position";
import { logger } from "../utils/logger";
import { RealTimeMarket } from "../core/realTimeMarket";
import { sleep } from "../utils/sleep";

class VWAPStrategy {
    config: StrategyConfig;
    dailyRisk: RiskManager;
    states: Record<string, SymbolState>;

    constructor(config: StrategyConfig, dailyRisk: RiskManager) {
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
    canOpen(symbol: string, preBar: Candlestick, quote: SecurityQuote, vwap: number, atr: number) {
        if (!this.dailyRisk.canTrade()) {
            return null;
        }

        const state = this.getState(symbol);
        if (state.position) {
            return null;
        };

        let dir = null;
        const currPrice = quote.lastDone.toNumber();

        const preHigh = preBar.high.toNumber();
        const preLow = preBar.low.toNumber();
        if (
            currPrice > vwap + this.config.vwapBandAtrRatio * atr &&
            preHigh < vwap + this.config.vwapBandAtrRatio * atr
            // !state.buyTraded // 之前未开仓买
        ) {
            dir = OrderSide.Buy;
        } else if (
            currPrice < vwap - this.config.vwapBandAtrRatio * atr &&
            preLow > vwap - this.config.vwapBandAtrRatio * atr
            // !state.sellTraded // 之前未开仓卖
        ) {
            dir = OrderSide.Sell;
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

    async onBar(
        symbol: string,
        bar: Candlestick,
        atr: number,
        realTimeMarket: RealTimeMarket
    ) {
        const quote = realTimeMarket.getQuote(symbol);
        const vwap = await calcVWAP(quote);

        const dir = this.canOpen(symbol, bar, quote, vwap, atr);

        if (dir) {
            return this.open(symbol, dir, quote, vwap, atr);
        } else {
            return this.managePosition(symbol, vwap, atr, quote);
        }
    }

    async managePosition(
        symbol: string,
        vwap: number,
        atr: number,
        quote: SecurityQuote
    ) {
        const state = this.getState(symbol);
        if (!state.position) return;

        const dir = state.position === OrderSide.Buy ? 1 : -1;
        const currPrice = quote.lastDone.toNumber();

        // ===== 半仓止盈 + 保本 =====
        // if (
        //     !state.halfClosed &&
        //     dir * (price - vwap) >= this.config.tpProtectAtrRatio * atr
        // ) {
        //     logger.info(`[半仓止盈: before] ${symbol} PRICE ${price} VWAP ${vwap} ATR ${atr} ${state.toString()}`);
        //     const qty = Math.floor(state.qty / 2);

        //     await placeOrder({
        //         symbol,
        //         side: state.position === OrderSide.Buy ? OrderSide.Sell : OrderSide.Buy,
        //         qty,
        //     });

        //     state.halfClosed = true;
        //     state.stopPrice = state.entryPrice; // 保本
        //     state.qty = state.qty - qty;

        //     logger.info(`[半仓止盈: after] ${symbol} PRICE ${price} VWAP ${vwap} ATR ${atr} ${state.toString()}`);
        // }

        // ===== 最终止盈 =====
        // if (
        //     dir * (price - vwap) >= this.config.tpFinalAtrRatio * atr
        // ) {
        //     logger.info(`[全部平仓: before] ${symbol} PRICE ${price} VWAP ${vwap} ATR ${atr} ${state.toString()}`);
        //     await placeOrder({
        //         symbol,
        //         side: state.position === OrderSide.Buy ? OrderSide.Sell : OrderSide.Buy,
        //         qty: state.qty,
        //     });

        //     state.reset();
        //     logger.info(`[全部平仓: after] ${symbol} PRICE ${price} VWAP ${vwap} ATR ${atr} ${state.toString()}`);
        // }

        // ===== 移动止损 / 止盈 ===== 
        if (
            state.stopPrice &&
            dir * (currPrice - state.stopPrice) <= 0
        ) {
            logger.info(`[移动止损/止盈: before] ${symbol} PRICE ${currPrice} VWAP ${vwap} ATR ${atr} ${state.toString()}`);
            await placeOrder({
                symbol,
                side: state.position === OrderSide.Buy ? OrderSide.Sell : OrderSide.Buy,
                qty: state.qty,
            });

            state.reset();
        } else if (state.stopPrice && state.stopDistance) {
            // 如果当前价格未触发止损/止盈，更新止损价格
            state.stopPrice = dir === 1 ?
                Math.max(state.stopPrice, currPrice - state.stopDistance) :
                Math.min(state.stopPrice, currPrice + state.stopDistance);
        }
    }

    async open(
        symbol: string,
        side: OrderSide,
        quote: SecurityQuote,
        vwap: number,
        atr: number
    ) {
        const { netAssets: equity } = await getAccountEquity();
        const currPrice = quote.lastDone.toNumber();

        const qty = calcPositionSize({
            equity,
            pct: this.config.positionPctPerTrade,
            price: currPrice,
        });

        if (qty <= 0) return;

        const order = await placeOrder({
            symbol,
            side,
            qty,
        });

        // 等待订单成交
        await sleep(300);

        const orderDetail = await getOrderDetail(order.orderId);

        if (orderDetail.status !== OrderStatus.Filled) {
            logger.error(`[OPEN] ${symbol} 下单失败 ${orderDetail.status}`);
            return;
        }

        const state = this.getState(symbol);
        state[side === OrderSide.Buy ? 'buyTraded' : 'sellTraded'] = true;
        state.position = side;
        state.entryPrice = currPrice;
        state.stopPrice = side === OrderSide.Buy ?
            vwap - this.config.stopAtrRatio * atr :
            vwap + this.config.stopAtrRatio * atr;
        state.stopDistance = Math.abs(state.entryPrice - state.stopPrice);
        state.qty = qty;

        logger.info(`[OPEN] ${symbol} 开仓方向: ${side} VWAP: ${vwap} ATR: ${atr} OPEN: ${currPrice} ${state.toString()}`);

    }
}

export default VWAPStrategy;
