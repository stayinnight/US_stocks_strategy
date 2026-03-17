import {
    Candlestick,
    OrderSide,
    OrderStatus,
    SecurityQuote,
    TradeSession,
} from "longport";
import dayjs from "dayjs";
import { calcTopAndLow } from "../utils/max";
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
import { timeGuard } from "../core/timeGuard";

class VWAPStrategy {
    config: StrategyConfig;
    dailyRisk: RiskManager;
    states: Record<string, SymbolState>;
    lastEntryTriggerLogKey: Record<string, string>;

    constructor(config: StrategyConfig, dailyRisk: RiskManager) {
        this.config = config;
        this.dailyRisk = dailyRisk;
        this.states = {};
        this.lastEntryTriggerLogKey = {};
    }

    // 读取持仓状态
    async init() {
        this.states = await db?.states?.getAll() || {};
    }

    // ========================
    // 入场触发日志（仅价格触发时打印）
    // 说明：将日志展示逻辑从 canOpen() 中抽离，避免业务判断被“格式化/打印”淹没。
    // ========================
    private fmtNumber(n: number, digits = 4) {
        return Number.isFinite(n) ? n.toFixed(digits) : String(n);
    }

    private fmtMaybe(n: number | null, digits = 4) {
        return n === null ? 'null' : this.fmtNumber(n, digits);
    }

    /**
     * 从 Candlestick 上取时间字段，并转成可读字符串。
     * 不同数据源字段名可能不同，这里做一个兼容兜底。
     */
    private getBarTimeStr(bar: Candlestick) {
        const raw: any =
            (bar as any).timestamp ??
            (bar as any).time ??
            (bar as any).t ??
            (bar as any).datetime ??
            null;
        if (raw === null || raw === undefined) return '未知';

        if (typeof raw === 'number') {
            const ms = raw > 1e12 ? raw : raw * 1000;
            return dayjs(ms).format('YYYY-MM-DD HH:mm');
        }
        if (typeof raw === 'string') return raw;
        return String(raw);
    }

    /**
     * 只对“价格触发”的入场信号打印，并对同一标的同一根 K 去重。
     */
    private logEntryPriceTriggerOnce(params: {
        symbol: string;
        dirText: '做多' | '做空';
        barTimeStr: string;
        phaseText: string;
        indexRule: string;
        indexResult: string;
        allow: boolean;
        priceLine: string;
        rsi: number | null;
        rsiRule: string;
        rsiResult: string;
        volumeRatio: number | null;
        volRule: string;
        volResult: string;
        key: string;
    }) {
        if (this.lastEntryTriggerLogKey[params.symbol] === params.key) return;
        this.lastEntryTriggerLogKey[params.symbol] = params.key;

        logger.info(
            `\n🚀【入场触发-价格】${params.symbol} 方向=${params.dirText} 时段=${params.phaseText} K线=${params.barTimeStr}  结论=${
                params.allow ? '允许入场' : '被拦截'
            }\n` +
                `  价格：${params.priceLine}\n` +
                `  指数：${params.indexRule} 结果=${params.indexResult}\n` +
                `  指标：RSI=${this.fmtMaybe(params.rsi, 2)} ${params.rsiRule} 结果=${
                    params.rsiResult
                }   ` +
                `量比=${this.fmtMaybe(params.volumeRatio, 2)} ${params.volRule} 结果=${
                    params.volResult
                }\n`
        );
    }

    /**
     * 检查是否可以开仓
     * @param symbol 股票代码
     * @param preBars 最近的已收盘 K 线（策略用最后两根做突破判定）
     * @param vwap VWAP 值
     * @param atr ATR 值
     * @param rsi RSI 指标（可能为 null，代表指标暂不可用）
     * @param volumeRatio 成交量比（可能为 null，代表指标暂不可用）
     * @returns 开仓方向（Buy/Sell）或null（不能开仓）
     */
    canOpen(
        symbol: string,
        preBars: Candlestick[],
        vwap: number,
        atr: number,
        rsi: number | null,
        volumeRatio: number | null,
        indexSlope: number | null,
    ) {
        // 1) 风控：达到最大回撤等条件后，直接禁止开新仓
        if (!this.dailyRisk.canTrade()) {
            return null;
        }
        const state = this.getState(symbol);
        // 2) 已有持仓则不重复开仓
        if (state.position) {
            return null;
        };

        // 3) 数据不足（至少需要两根已收盘 K）
        if (preBars.length < 2) {
            return null;
        }

        let dir = null;

        // VWAP 带（价格入场触发阈值）
        const k = this.config.vwapBandAtrRatio;
        const upperBand = vwap + k * atr;
        const lowerBand = vwap - k * atr;

        // 3) 最近两根已收盘 1 分钟 K 的高低点（用于判断是否“跨越”上/下轨）
        const lastOneMinutesBar = preBars[preBars.length - 1];
        const lastTwoMinutesBar = preBars[preBars.length - 2];
        const {
            low: lastOneMinuteslow,
            top: lastOneMinutesHigh,
        } = calcTopAndLow([lastOneMinutesBar]);
        const {
            low: lastTwoMinuteslow,
            top: lastTwoMinutesHigh,
        } = calcTopAndLow([lastTwoMinutesBar]);

        // 4) 指标过滤（当指标为 null 时，视为“跳过”该过滤条件）
        // - RSI/量比 是否参与过滤，由当天交易时段决定（见 config.entryFilterSchedule）
        const volumeOk =
            volumeRatio === null ||
            volumeRatio >= this.config.volumeEntryThreshold;

        const longRsiOk = rsi === null || rsi >= this.config.rsiBuyThreshold;
        const shortRsiOk = rsi === null || rsi <= this.config.rsiSellThreshold;

        // 5) 时段规则：
        // - 开盘后 noTradeAfterOpenMinutes ~ 30min：只看价格突破（不看 RSI/量比）
        // - 开盘 30min ~ 收盘前 60min：价格 + RSI + 量比
        // - 收盘前 60min ~ 收盘前 noTradeBeforeCloseMinutes：只看价格突破
        const schedule = this.config.entryFilterSchedule || {
            rsiVolumeDisabledUntilOpenMinutes: 30,
            rsiVolumeDisabledBeforeCloseMinutes: 60,
        };
        const progress = timeGuard.getTradeProgressMinutes();
        const minutesSinceOpen = progress?.minutesSinceOpen;
        const minutesToClose = progress?.minutesToClose;

        const isEarlyPriceOnly =
            minutesSinceOpen !== undefined &&
            minutesSinceOpen <= schedule.rsiVolumeDisabledUntilOpenMinutes;
        const isLatePriceOnly =
            minutesToClose !== undefined &&
            minutesToClose <= schedule.rsiVolumeDisabledBeforeCloseMinutes;

        const shouldCheckIndicators = !(isEarlyPriceOnly || isLatePriceOnly);
        const phaseText = shouldCheckIndicators
            ? '主交易段(价格+RSI+量比)'
            : isEarlyPriceOnly
              ? '早盘价格段(只看价格)'
              : '尾盘价格段(只看价格)';

        // 6) 价格触发：只要触发，就打印一条中文日志（方便排查“价格到了但没进场”的原因）
        const barTimeStr = this.getBarTimeStr(lastOneMinutesBar);
        const longPriceTrigger =
            lastOneMinuteslow >= upperBand && lastTwoMinuteslow < upperBand;
        const shortPriceTrigger =
            lastOneMinutesHigh <= lowerBand && lastTwoMinutesHigh > lowerBand;

        // 6) 指数趋势过滤：
        // - .IXIC VWAP 斜率 > 0 才做多
        // - .IXIC VWAP 斜率 < 0 才做空
        const trendCfg = this.config.indexTrendFilter;
        const epsilon = trendCfg?.epsilon ?? 0;
        const isTrendEnabled = !!trendCfg?.enabled;
        const slopeOkLong =
            !isTrendEnabled
                ? true
                : indexSlope === null
                  ? trendCfg?.whenSlopeUnavailable !== 'block'
                  : indexSlope > epsilon;
        const slopeOkShort =
            !isTrendEnabled
                ? true
                : indexSlope === null
                  ? trendCfg?.whenSlopeUnavailable !== 'block'
                  : indexSlope < -epsilon;

        const indexRule = !isTrendEnabled
            ? '指数过滤=关闭'
            : `${trendCfg?.indexSymbol ?? ''} VWAP斜率=${
                  indexSlope === null ? 'null' : this.fmtNumber(indexSlope, 6)
              } (多>${epsilon} 空<${-epsilon})`;

        // 只要“价格触发”就打印，allow 反映最终是否会被指标拦截。
        if (longPriceTrigger) {
            const allowLong =
                (shouldCheckIndicators ? longRsiOk && volumeOk : true) &&
                slopeOkLong;
            this.logEntryPriceTriggerOnce({
                symbol,
                dirText: '做多',
                barTimeStr,
                phaseText,
                indexRule,
                indexResult: slopeOkLong ? '通过' : '不通过',
                allow: allowLong,
                priceLine:
                    `上轨=${this.fmtNumber(upperBand)} (VWAP=${this.fmtNumber(vwap)} ATR=${this.fmtNumber(atr)} k=${k}) ` +
                    `last2Low=${this.fmtNumber(lastTwoMinuteslow)} -> last1Low=${this.fmtNumber(lastOneMinuteslow)}`,
                rsi,
                rsiRule: shouldCheckIndicators
                    ? `阈值>=${this.config.rsiBuyThreshold}`
                    : '本时段不校验',
                rsiResult: shouldCheckIndicators
                    ? rsi === null
                        ? '跳过'
                        : longRsiOk
                          ? '通过'
                          : '不通过'
                    : '不参与',
                volumeRatio,
                volRule: shouldCheckIndicators
                    ? `阈值>=${this.config.volumeEntryThreshold}`
                    : '本时段不校验',
                volResult: shouldCheckIndicators
                    ? volumeRatio === null
                        ? '跳过'
                        : volumeOk
                          ? '通过'
                          : '不通过'
                    : '不参与',
                key: `L:${barTimeStr}:${this.fmtNumber(upperBand)}:${this.fmtNumber(lastOneMinuteslow)}`,
            });
        } else if (shortPriceTrigger) {
            const allowShort =
                (shouldCheckIndicators ? shortRsiOk && volumeOk : true) &&
                slopeOkShort;
            this.logEntryPriceTriggerOnce({
                symbol,
                dirText: '做空',
                barTimeStr,
                phaseText,
                indexRule,
                indexResult: slopeOkShort ? '通过' : '不通过',
                allow: allowShort,
                priceLine:
                    `下轨=${this.fmtNumber(lowerBand)} (VWAP=${this.fmtNumber(vwap)} ATR=${this.fmtNumber(atr)} k=${k}) ` +
                    `last2High=${this.fmtNumber(lastTwoMinutesHigh)} -> last1High=${this.fmtNumber(lastOneMinutesHigh)}`,
                rsi,
                rsiRule: shouldCheckIndicators
                    ? `阈值<=${this.config.rsiSellThreshold}`
                    : '本时段不校验',
                rsiResult: shouldCheckIndicators
                    ? rsi === null
                        ? '跳过'
                        : shortRsiOk
                          ? '通过'
                          : '不通过'
                    : '不参与',
                volumeRatio,
                volRule: shouldCheckIndicators
                    ? `阈值>=${this.config.volumeEntryThreshold}`
                    : '本时段不校验',
                volResult: shouldCheckIndicators
                    ? volumeRatio === null
                        ? '跳过'
                        : volumeOk
                          ? '通过'
                          : '不通过'
                    : '不参与',
                key: `S:${barTimeStr}:${this.fmtNumber(lowerBand)}:${this.fmtNumber(lastOneMinutesHigh)}`,
            });
        }

        // 7) 最终开仓判定：
        // - 价格段：只要价格突破就开仓
        // - 主交易段：价格突破 + RSI + 量比都通过才开仓
        // 另外：多空方向必须满足指数 VWAP 斜率门控
        if (longPriceTrigger) {
            const allow =
                (shouldCheckIndicators ? longRsiOk && volumeOk : true) &&
                slopeOkLong;
            if (allow) {
                dir = OrderSide.Buy;
            }
        } else if (shortPriceTrigger) {
            const allow =
                (shouldCheckIndicators ? shortRsiOk && volumeOk : true) &&
                slopeOkShort;
            if (allow) {
                dir = OrderSide.Sell;
            }
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

        // 防止开盘初期 count 取太长导致混入盘前/盘后数据
        const intradayBars = bars.filter(
            bar => bar.tradeSession === TradeSession.Intraday
        );

        // 不使用最后一根，避免拿到未收盘的分钟 K
        const closedBars = intradayBars.slice(0, -1);
        const preBarsStart = Math.max(
            0,
            closedBars.length - (this.config.rsiPeriod + 1)
        );
        const preBars = closedBars.slice(preBarsStart);

        const vwap = calcVWAP(quote);
        const rsi = calcRSI(preBars, this.config.rsiPeriod);

        const volume = calcVolume(closedBars);
        const volumeRatio =
            volume && volume.pastVolume > 0
                ? volume.recentVolume / volume.pastVolume
                : null;

        // 指数 VWAP 斜率（用于多空方向门控）
        const trendCfg = this.config.indexTrendFilter;
        const indexSymbol = trendCfg?.enabled ? trendCfg?.indexSymbol : null;
        const slopePeriod =
            trendCfg?.slopePeriod ?? this.config.vwapSmoothPeriod;
        const indexQuotes = indexSymbol ? market.getPostQuote(indexSymbol) : null;
        const indexSlope =
            indexSymbol && indexQuotes
                ? calcVWAPSlope(indexQuotes, slopePeriod)
                : null;

        const dir = this.canOpen(
            symbol,
            preBars,
            vwap,
            atr,
            rsi,
            volumeRatio,
            indexSlope,
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
        const posText = state.position === OrderSide.Buy ? '做多' : '做空';
        const nowStr = dayjs(Date.now()).format('YYYY-MM-DD HH:mm:ss');

        // ===== 移动止损 / 止盈 ===== 
        if (
            state.stopPrice !== null &&
            dir * (currPrice - state.stopPrice) <= 0
        ) {
            // 触发止损/止盈：只在真正触发时打印（避免刷屏）
            const pnl =
                state.entryPrice !== null
                    ? dir * (currPrice - state.entryPrice)
                    : null;
            const pnlPct =
                state.entryPrice !== null && state.entryPrice > 0
                    ? (dir * (currPrice - state.entryPrice)) / state.entryPrice
                    : null;
            logger.info(
                `\n🛑【触发移动止损】${symbol} 持仓=${posText} 时间=${nowStr}\n` +
                    `  价格：现价=${this.fmtNumber(currPrice, 4)} 止损价=${this.fmtNumber(state.stopPrice, 4)} (触发条件：${posText === '做多' ? '现价<=止损价' : '现价>=止损价'})\n` +
                    `  仓位：数量=${state.qty} 入场价=${this.fmtMaybe(state.entryPrice, 4)} VWAP=${this.fmtNumber(vwap, 4)} ATR=${this.fmtNumber(atr, 4)}\n` +
                    `  盈亏：每股=${pnl === null ? '未知' : this.fmtNumber(pnl, 4)} 比例=${pnlPct === null ? '未知' : (pnlPct * 100).toFixed(2) + '%'}\n`
            );
            await placeOrder({
                symbol,
                side: state.position === OrderSide.Buy ? OrderSide.Sell : OrderSide.Buy,
                qty: state.qty,
            });

            Object.assign(state, new SymbolState());
        } else if (state.stopPrice !== null && state.stopDistance !== null) {
            // 如果当前价格未触发止损/止盈，更新止损价格
            const oldStop = state.stopPrice;
            const newStop =
                dir === 1
                    ? Math.max(oldStop, currPrice - state.stopDistance)
                    : Math.min(oldStop, currPrice + state.stopDistance);

            // 只在止损价发生变化时记录一次（减少噪音）
            if (newStop !== oldStop) {
                state.stopPrice = newStop;
            }
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
            currPrice - this.config.stopAtrRatio * atr :
            currPrice + this.config.stopAtrRatio * atr;
        
        state.stopDistance = Math.abs(state.entryPrice - state.stopPrice);
        state.qty = qty;

        await db?.states?.setSymbolState(symbol, state);
    }
}

export default VWAPStrategy;
