import { Candlestick, OrderSide, OrderStatus, SecurityQuote } from "longport";
import { RiskManager } from "../core/risk";
import SymbolState from "../core/state";
import { StrategyConfig } from "../interface/config";
import { calcVWAP, calcVWAPSlope } from "../core/indicators/vwap";
import { placeOrder, getAccountEquity, getOrderDetail } from "../longbridge/trade";
import { calcPositionSize } from "../core/position";
import { logger } from "../utils/logger";
import { Market } from "../core/realTimeMarket";
import { sleep } from "../utils/sleep";
import { calcRSI } from "../core/indicators/rsi";
import { calcVolume } from "../core/indicators/volume";
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
        logger.debug(`持仓状态初始化完成，当前持仓 ${JSON.stringify(this.states)}`);
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
        preBar: Candlestick,
        quote: SecurityQuote,
        vwap: number,
        atr: number,
        volumes: {
            recentVolume: number,
            pastVolume: number,
        } | null,
        rsi: number | null,
        vwapSlope: number | null,
    ) {
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

        /**
         * 开仓条件：
         * 1. 如果judges长度为0，则不考虑score，直接开仓
         * 2. 如果judges长度为1，则判断其中的指标全部符合要求则开仓
         * 3. 如果judges长度为2，则判断其中的指标有一个符合要求则开仓
         * 4. 如果judges长度为3，则判断其中的指标有两个符合要求则开仓
         */
        const judges = {
            volumes,
            rsi,
            vwapSlope,
        };
        let score = 0;
        const count = Object.values(judges).filter(Boolean).length;

        if (
            // 价格突破的判断
            currPrice > vwap + this.config.vwapBandAtrRatio * atr &&
            preHigh < vwap + this.config.vwapBandAtrRatio * atr
        ) {
            // judge长度为0时，直接开仓
            // if (count === 0) {
            //     dir = OrderSide.Buy;
            // }

            // count不为0时，判断指标是否符合要求
            if (
                judges.volumes &&
                judges.volumes.recentVolume > judges.volumes.pastVolume * this.config.volumeEntryThreshold
            ) {
                logger.info(symbol, 'volumesPass', judges.volumes)
                score++;
            }
            if (judges.rsi && judges.rsi > this.config.rsiBuyThreshold) {
                logger.info(symbol, 'rsiPass', judges.rsi)
                score++;
            }
            if (judges.vwapSlope && judges.vwapSlope > 0) {
                logger.info(symbol, 'vwapSlopePass', judges.vwapSlope)
                score++;
            }
            if (count === 3 && score >= 2) {
                dir = OrderSide.Buy;
            } else if (count === 2 && score >= 1) {
                dir = OrderSide.Buy;
            } else if (count === 1 && score >= 1) {
                dir = OrderSide.Buy;
            }
            logger.info(count, score, dir)
        } else if (
            // 价格突破的判断
            currPrice < vwap - this.config.vwapBandAtrRatio * atr &&
            preLow > vwap - this.config.vwapBandAtrRatio * atr
        ) {
            // judge长度为0时，直接开仓
            // if (count === 0) {
            //     dir = OrderSide.Sell;
            // }

            // count不为0时，判断指标是否符合要求
            if (judges.volumes && judges.volumes.recentVolume > judges.volumes.pastVolume * this.config.volumeEntryThreshold) {
                logger.info(symbol, 'volumesPass', judges.volumes)
                score++;
            }
            if (judges.rsi && judges.rsi < this.config.rsiSellThreshold) {
                logger.info(symbol, 'rsiPass', judges.rsi)
                score++;
            }
            if (judges.vwapSlope && judges.vwapSlope < 0) { 
                logger.info(symbol, 'vwapSlopepass', judges.vwapSlope)
                score++;
            }
            if (judges.vwapSlope && judges.vwapSlope < 0) {
                logger.info(symbol, 'vwapSlopePass', judges.vwapSlope)
                score++;
            }
            if (count === 3 && score >= 2) {
                dir = OrderSide.Sell;
            } else if (count === 2 && score >= 1) {
                dir = OrderSide.Sell;
            } else if (count === 1 && score >= 1) {
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
        const postQuotes = market.getPostQuote(symbol);
        const quote = market.getQuote(symbol);
        const preBar = bars[bars.length - 2]; // 前一个k线

        const vwap = calcVWAP(quote);
        const rsi = calcRSI(bars, this.config.rsiPeriod);
        const vwapSlope = calcVWAPSlope(postQuotes, this.config.vwapSmoothPeriod);
        const volumes = calcVolume(bars);

        const dir = this.canOpen(
            symbol,
            preBar,
            quote,
            vwap,
            atr,
            volumes,
            rsi,
            vwapSlope,
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
