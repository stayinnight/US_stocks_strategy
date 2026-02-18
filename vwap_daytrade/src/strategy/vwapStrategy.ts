import { Candlestick, OrderSide, OrderStatus, SecurityQuote } from "longport";
import { calcTopAndLow } from "../utils/max";
import { RiskManager } from "../core/risk";
import SymbolState from "../core/state";
import { StrategyConfig } from "../interface/config";
import { calcVWAP } from "../core/indicators/vwap";
import { placeOrder, getAccountEquity, getOrderDetail } from "../longbridge/trade";
import { calcPositionSize } from "../core/position";
import { logger } from "../utils/logger";
import { Market } from "../core/realTimeMarket";
import { sleep } from "../utils/sleep";
import { calcRSI } from "../core/indicators/rsi";
import { db } from "../db";

class VWAPStrategy {
    config: StrategyConfig;
    dailyRisk: RiskManager;
    states: Record<string, SymbolState>;

    constructor(config: StrategyConfig, dailyRisk: RiskManager) {
        this.config = config;
        this.dailyRisk = dailyRisk;
        this.states = {};
    }

    // 读取持仓状态
    async init() {
        this.states = await db?.states?.getAll() || {};
    }

    /**
     * 检查是否可以开仓
     * @param symbol 股票代码
     * @param price 当前价格
     * @param vwap VWAP值
     * @param atr ATR值
     * @returns 开仓方向（Buy/Sell）或null（不能开仓）
     */
    canOpen(
        symbol: string,
        preSixMinutesBars: Candlestick[],
        // quote: SecurityQuote,
        vwap: number,
        atr: number,
        rsi: number | null,
    ) {
        if (!this.dailyRisk.canTrade()) {
            return null;
        }
        const state = this.getState(symbol);
        if (state.position) {
            return null;
        };

        let dir = null;
        // 计算5分钟内的最低值和最高值
        const {
            low: lastFiveMinuteslow,
            top: lastFiveMinutesHigh,
        } = calcTopAndLow(preSixMinutesBars.slice(1, 6));
        // 计算5分钟之前的第一根k的最高值
        const { 
            top: sixMinuteHigh,
            low: sixMinuteLow,
         } = calcTopAndLow(preSixMinutesBars.slice(0, 1));

        const judges = {
            rsi,
        };
        let score = 0;
        const count = Object.values(judges).filter(Boolean).length;

        if (
            // 价格突破的判断
            lastFiveMinuteslow >= vwap + this.config.vwapBandAtrRatio * atr &&
            sixMinuteLow < vwap + this.config.vwapBandAtrRatio * atr
        ) {
            if (judges.rsi && judges.rsi > this.config.rsiBuyThreshold) {
                score++;
            }
            if (count === 1 && score === 1) {
                dir = OrderSide.Buy;
            }
            logger.info(count, score, dir)
        } else if (
            // 价格突破的判断
            lastFiveMinutesHigh <= vwap - this.config.vwapBandAtrRatio * atr &&
            sixMinuteHigh > vwap - this.config.vwapBandAtrRatio * atr
        ) {
            if (judges.rsi && judges.rsi < this.config.rsiSellThreshold) {
                score++;
            }
            if (count === 1 && score === 1) {
                dir = OrderSide.Sell;
            }
            logger.info(count, score, dir)
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
        bars: Candlestick[],
        atr: number,
        market: Market
    ) {
        // const postQuotes = market.getPostQuote(symbol);
        const quote = market.getQuote(symbol);
        const preSixMinutesBars = bars.slice(bars.length - 7, bars.length - 1); // 前六分钟k线  

        const vwap = calcVWAP(quote);
        const rsi = calcRSI(preSixMinutesBars, this.config.rsiPeriod);

        const dir = this.canOpen(
            symbol,
            preSixMinutesBars,
            vwap,
            atr,
            rsi,
        );

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

        // ===== 移动止损 / 止盈 ===== 
        if (
            state.stopPrice &&
            dir * (currPrice - state.stopPrice) <= 0
        ) {
            logger.info(`[移动止损/止盈: before] ${symbol} PRICE ${currPrice} VWAP ${vwap} ATR ${atr} ${JSON.stringify(state)}`);
            await placeOrder({
                symbol,
                side: state.position === OrderSide.Buy ? OrderSide.Sell : OrderSide.Buy,
                qty: state.qty,
            });

            Object.assign(state, new SymbolState());
        } else if (state.stopPrice && state.stopDistance) {
            // 如果当前价格未触发止损/止盈，更新止损价格
            state.stopPrice = dir === 1 ?
                Math.max(state.stopPrice, currPrice - state.stopDistance) :
                Math.min(state.stopPrice, currPrice + state.stopDistance);
        }

        await db?.states?.setSymbolState(symbol, state);
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

        await db?.states?.setSymbolState(symbol, state);

        logger.info(`[OPEN] ${symbol} 开仓方向: ${side} VWAP: ${vwap} ATR: ${atr} OPEN: ${currPrice} ${state.toString()}`);

    }
}

export default VWAPStrategy;
