import config from './config/strategy.config';
import VWAPStrategy from './strategy/vwapStrategy';
import { getMinuteBars } from './longbridge/market';
import { getAccountEquity, closeAllPositions } from './longbridge/trade';
import { sleep } from './utils/sleep';
import { initTradeEnv } from './core/env';
import { RiskManager } from './core/risk';
import { ATRManager } from './core/indicators/atr';
import { isMarketCloseTime, isTradableTime } from './core/timeGuard';
import { logger } from './utils/logger';
import { Market } from './core/realTimeMarket';
import { getBarLength } from './utils';
import { db, initDB } from './db';

const Koa = require('koa');
const app = new Koa();
const PORT = 3000;

async function loop() {
    let strategy: VWAPStrategy | null = null;
    let dailyRisk: RiskManager | null = null;
    let atrManager: ATRManager | null = null;
    let inited = false;

    // 异步行情更新
    const market = new Market();
    market.start();

    while (true) {
        // 每5秒执行一次
        await sleep(1000 * 5);

        // 尾盘平仓, 做好清理工作
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
            // 清空持仓状态
            await db?.states?.clear();
            continue;
        }

        // ===== 交易日初始化 =====
        const initContext = async () => {
            atrManager = new ATRManager();
            dailyRisk = new RiskManager(config.maxDailyDrawdown);
            strategy = new VWAPStrategy(config, dailyRisk);

            // 初始化持仓状态
            await strategy.init();
            await atrManager.preloadATR();

            const { netAssets: startEquity } = await getAccountEquity();
            await dailyRisk?.initDay(startEquity);

            logger.info(`初始化结束`);
        }

        // ===== 正常策略执行 =====
        const trade = async (market: Market) => {
            const tasks = config.symbols.map(async symbol => {
                const bars = await getMinuteBars(symbol, getBarLength());
                await strategy?.onBar(
                    symbol,
                    bars,
                    atrManager!.getATR(symbol),
                    market
                );
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
            await market.initMarketQuote(config.symbols);

            await trade(market);
        } catch (e: any) {
            logger.error(e.message);
        }
    }
}

async function init() {
    // ===== 交易日初始化 =====
    logger.info('🚀 VWAP 日内策略初始化');
    initTradeEnv();
    // ===== 数据库初始化 =====
    await initDB();
}

init().then(async _ => {
    // 初始化交易之前，先清空所有持仓
    await closeAllPositions();
    // 主交易循环
    loop();

    // SERVER START
    app.listen(PORT, () => {
        logger.info(`🚀 VWAP 日内策略启动`);
    });
}).catch((e) =>
    logger.fatal(e.message)
);

process.on('SIGINT', async () => {
    logger.info('SIGINT signal received.');
    process.exit(0);
});

process.on('uncaughtException', async () => {
    logger.info('uncaughtException signal received.');
    process.exit(0);
});

process.on('unhandledRejection', async () => {
    logger.info('unhandledRejection signal received.');
    process.exit(0);
});