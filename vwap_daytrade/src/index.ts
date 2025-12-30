import config from './config/strategy.config';
import VWAPStrategy from './strategy/vwapStrategy';
import { getMinuteBars } from './longbridge/market';
import { getAccountEquity, closeAllPositions } from './longbridge/trade';
import { sleep } from './utils/sleep';
import { initTradeEnv } from './core/env';
import { DailyRiskManager } from './core/risk';
import { atrMap, preloadATR } from './core/indicators/atr';

const Koa = require('koa');
const app = new Koa();
const PORT = 3000;

const dailyRisk = new DailyRiskManager(config.maxDailyDrawdown);
const strategy = new VWAPStrategy(config, dailyRisk);

async function startTradeLoop() {
    const init = async () => {
        await preloadATR();
        const startEquity = await getAccountEquity();
        dailyRisk.initDay(startEquity);
    }

    const trade = async () => {
        // ===== 正常策略执行 =====
        const tasks = config.symbols.map(async symbol => {
            const bar = await getMinuteBars(symbol);
            await strategy.onBar(symbol, bar, atrMap[symbol]);
        });
        await Promise.all(tasks);
    }

    while (true) {
        // 频率控制，防止请求太多打满cpu、被长桥限流
        await sleep(1000);

        try {
            const equity = await getAccountEquity();
            // ===== 最高优先级：账户回撤检查 =====
            const halted = dailyRisk.check(equity);
            if (halted) {
                console.log('[RISK] 🚨 强制平仓并停止交易');
                await closeAllPositions();
                // 当日直接退出主循环
                break;
            }
            // ===== 正常策略执行 =====
            await init();
            await trade();
        } catch (e: any) {
            console.error('[ERROR]', e.message);
        }
    }
    console.log('[RISK] 🛑 今日交易结束');
}

async function init() {
    // ===== 交易日初始化 =====
    console.log('🚀 VWAP 日内策略初始化');
    initTradeEnv();
}

init().then(_ => {
    console.log('🚀 VWAP 日内策略启动');
    startTradeLoop();
    // SERVER START
    app.listen(PORT, () => {
        console.log(`Koa server is running on port ${PORT}`);
    });
}).catch((e) =>
    console.error('[FATAL]', e.message)
);
