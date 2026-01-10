import config from './config/strategy.config';
import VWAPStrategy from './strategy/vwapStrategy';
import { getMinuteBars, getQuote } from './longbridge/market';
import { getAccountEquity, closeAllPositions, placeOrder, getOrderDetail } from './longbridge/trade';
import { sleep } from './utils/sleep';
import { initTradeEnv } from './core/env';
import { RiskManager } from './core/risk';
import { ATRManager } from './core/indicators/atr';
import { isMarketCloseTime, isTradableTime } from './core/timeGuard';
import { logger } from './utils/logger';
import { RealTimeMarket } from './core/realTimeMarket';

const Koa = require('koa');
const app = new Koa();
const PORT = 3000;

async function startLoop() {
    let strategy: VWAPStrategy | null = null;
    let dailyRisk: RiskManager | null = null;
    let atrManager: ATRManager | null = null;
    let inited = false;

    while (true) {
        // 每5秒执行一次
        await sleep(1000 * 5);

        // 尾盘平仓
        if (isMarketCloseTime(config.closeTimeMinutes)) {
            await closeAllPositions();
            logger.info('[RISK] 📊 尾盘全平');
            continue;
        }

        // 非交易时间，跳过
        if (!isTradableTime(config.noTradeAfterOpenMinutes, config.noTradeBeforeCloseMinutes)) {
            // 非交易时间清空状态
            strategy = null;
            dailyRisk = null;
            atrManager = null;
            inited = false;
            continue;
        }

        // ===== 交易日初始化 =====
        const initContext = async () => {
            atrManager = new ATRManager();
            dailyRisk = new RiskManager(config.maxDailyDrawdown);
            strategy = new VWAPStrategy(config, dailyRisk);

            await atrManager.preloadATR();
            logger.debug(`ATR 预热完成`);

            const { netAssets: startEquity } = await getAccountEquity();
            dailyRisk.initDay(startEquity);
            logger.debug(`[RISK] 初始化日风险控制，初始净值 ${startEquity}`);

            logger.info(`初始化结束`);
        }

        // ===== 正常策略执行 =====
        const trade = async (realTimeMarket: RealTimeMarket) => {
            const tasks = config.symbols.map(async symbol => {
                // 取前一分钟的k线来判断
                const [bar] = await getMinuteBars(symbol, 2);
                await strategy?.onBar(symbol, bar, atrManager!.getATR(symbol), realTimeMarket);
            });
            await Promise.all(tasks);
        }

        try {
            // init每天只执行一次
            if (!inited) {
                await initContext();
                inited = true;
            }
            const { netAssets: equity } = await getAccountEquity();
            // ===== 最高优先级：账户回撤检查 =====
            const shouldStop = dailyRisk!.check(equity);
            if (shouldStop) {
                await closeAllPositions();
                continue;
            }
            // 初始化实时行情信息
            const realTimeMarket = new RealTimeMarket();
            await realTimeMarket.init(config.symbols);

            await trade(realTimeMarket);
        } catch (e: any) {
            logger.error(e.message);
        }
    }
}

async function init() {
    // ===== 交易日初始化 =====
    logger.info('🚀 VWAP 日内策略初始化');
    initTradeEnv();
}

init().then(_ => {
    startLoop();
    // SERVER START
    app.listen(PORT, () => {
        logger.info(`🚀 VWAP 日内策略启动`);
    });
}).catch((e) =>
    logger.fatal(e.message)
);
