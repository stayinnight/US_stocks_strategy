import config from './config/strategy.config';
import VWAPStrategy from './strategy/vwapStrategy';
import { getMinuteBars } from './longbridge/market';
import { getAccountEquity, closeAllPositions } from './longbridge/trade';
import { sleep } from './utils/sleep';
import { initTradeEnv } from './core/env';
import { DailyRiskManager } from './core/risk';
import { ATRManager } from './core/indicators/atr';
import { isTradableTime } from './core/timeGuard';
import { logger } from './utils/logger';

const Koa = require('koa');
const app = new Koa();
const PORT = 3000;

async function startLoop() {

    while (true) {
        // 频率控制，防止请求太多打满cpu、被长桥限流
        await sleep(1000);

        let strategy: VWAPStrategy | null = null;
        let dailyRisk: DailyRiskManager | null = null;
        let atrManager: ATRManager | null = null;
        let inited = false;

        // 非交易时间，跳过
        if (!isTradableTime(config.noTradeAfterOpenMinutes, config.noTradeBeforeCloseMinutes)) {
            // 非交易时间清空状态
            strategy = null;
            dailyRisk = null;
            inited = false;
            continue;
        }

        // ===== 交易日初始化 =====
        const init = async () => {
            atrManager = new ATRManager();
            await atrManager.preloadATR();
            dailyRisk = new DailyRiskManager(config.maxDailyDrawdown);
            strategy = new VWAPStrategy(config, dailyRisk);
            const startEquity = await getAccountEquity();
            dailyRisk.initDay(startEquity);
        }

        const trade = async () => {
            // ===== 正常策略执行 =====
            const tasks = config.symbols.map(async symbol => {
                const bar = await getMinuteBars(symbol);
                await strategy?.onBar(symbol, bar, atrManager!.getATR(symbol));
            });
            await Promise.all(tasks);
        }

        try {
            // init每天只执行一次
            if (!inited) {
                await init();
                inited = true;
            }
            const equity = await getAccountEquity();
            // ===== 最高优先级：账户回撤检查 =====
            const halted = dailyRisk!.check(equity);
            if (halted) {
                logger.fatal('[RISK] 🚨 强制平仓并停止交易');
                await closeAllPositions();
                // 当日直接退出主循环
                break;
            }
            // ===== 正常策略执行 =====
            await trade();
        } catch (e: any) {
            logger.error(e.message);
        }
    }
    logger.info('[RISK] 🛑 今日交易结束');
}

async function init() {
    // ===== 交易日初始化 =====
    logger.info('🚀 VWAP 日内策略初始化');
    initTradeEnv();
}

init().then(_ => {
    logger.info('🚀 VWAP 日内策略启动');
    startLoop();
    // SERVER START
    app.listen(PORT, () => {
        logger.info(`Koa server is running on port ${PORT}`);
    });
}).catch((e) =>
    logger.fatal(e.message)
);
