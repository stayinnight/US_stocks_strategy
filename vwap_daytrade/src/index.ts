import config from './config/strategy.config';
import VWAPStrategy from './strategy/vwapStrategy';
import { getMinuteBars } from './longbridge/market';
import { getAccountEquity, closeAllPositions } from './longbridge/trade';
import { sleep } from './utils/sleep';
import { initTradeEnv } from './core/env';
import { RiskManager } from './core/risk';
import { ATRManager } from './core/indicators/atr';
import { timeGuard } from './core/timeGuard';
import { logger } from './utils/logger';
import { Market } from './core/realTimeMarket';
// import { getBarLength } from './utils';
import { db, initDB } from './db';
import path from 'path';
// const PQueue = require('p-queue');
import router from './routes';
import { createBatchPicker } from './utils/picker';

const PORT = 3000;

const serve = require('koa-static');
const Koa = require('koa');
const app = new Koa();

app
    .use(router.routes())
    .use(router.allowedMethods());

app.use(
    serve(path.join(__dirname, '../public'), {
        index: 'index.html',
    })
);

const defaultBarLength = 10;
const concurrency = 30;

async function loop() {
    closeAllPositions()
    let strategy: VWAPStrategy | null = null;
    let dailyRisk: RiskManager | null = null;
    let atrManager: ATRManager | null = null;
    let inited = false;

    // 异步行情更新
    const market = new Market();
    market.start();
    const picker = createBatchPicker(config.symbols, concurrency);

    while (true) {

        await sleep(5000);
        // ===== 交易日初始化, 每天只执行一次 =====
        if (!inited) {
            atrManager = new ATRManager();
            dailyRisk = new RiskManager(config.maxDailyDrawdown);
            strategy = new VWAPStrategy(config, dailyRisk);
            // 每次重新拉一遍持仓状态，来初始化持仓状态
            await strategy!.init();
            await atrManager.preloadATR();

            const { netAssets: startEquity } = await getAccountEquity();
            await dailyRisk?.initDay(startEquity);

            logger.info(`初始化结束`);
            inited = true;
        }


        // 尾盘平仓, 做好清理工作
        if (timeGuard.isForceCloseTime()) {
            await closeAllPositions();
            // 清空持仓状态
            await db?.states?.clear();
            logger.info('[RISK] 📊 尾盘全平');
            continue;
        }

        // 非交易时间，跳过
        if (!timeGuard.isInTradeTime()) {
            // 非交易时间清空状态
            strategy = null;
            dailyRisk = null;
            atrManager = null;
            inited = false;
            continue;
        }

        // ===== 正常策略执行 =====
        const trade = async (symbols: string[], market: Market) => {
            const tasks = symbols.map(async symbol => {
                const bars = await getMinuteBars(symbol, defaultBarLength);
                return await strategy?.onBar(
                    symbol,
                    bars,
                    atrManager!.getATR(symbol),
                    market
                );
            });
            await Promise.all(tasks);
        }

        try {
            const { netAssets: equity } = await getAccountEquity();
            // ===== 最高优先级：账户回撤检查 =====
            const shouldStop = dailyRisk!.check(equity);
            if (shouldStop) {
                await closeAllPositions();
                continue;
            }

            // 初始化实时行情信息
            await market.initMarketQuote(config.symbols);
            const symbols = picker();

            await trade(symbols, market);

        } catch (e: any) {
            logger.error(e.message);
        }
    }
}

async function init() {
    // ===== 交易日初始化 =====
    logger.info('🚀 VWAP 日内策略初始化');
    initTradeEnv();
    await timeGuard.initTradeSession();
    // ===== 数据库初始化 =====
    await initDB();
}

init().then(async _ => {
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