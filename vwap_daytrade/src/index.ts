import config from './config/strategy.config';
import VWAPStrategy from './strategy/vwapStrategy';
import { getMinuteBars } from './longbridge/market';
import { calcATR } from './core/atr';
import { getDailyBars } from './longbridge/market';
import { getAccountEquity, closeAllPositions } from './longbridge/trade';
import { sleep } from './utils/sleep';
import { initTradeEnv } from './core/env';
import { DailyRiskManager } from './core/risk';

const dailyRisk = new DailyRiskManager(config.maxDailyDrawdown);
const strategy = new VWAPStrategy(config);

const atrMap: Record<string, number> = {};

async function preloadATR() {
    console.log('📐 计算前一交易日 ATR');
    for (const symbol of config.symbols) {
        const dailyBars = await getDailyBars(symbol);
        const atr = calcATR(dailyBars);
        if (atr) {
            atrMap[symbol] = atr;
            console.log(`[ATR] ${symbol} ATR=${atr?.toFixed(2)}`);
        }
    }
}

async function startTradeLoop() {
    while (true) {
        try {
            const equity = await getAccountEquity();
            // ===== 最高优先级：账户回撤检查 =====
            const halted = dailyRisk.check(equity);
            if (halted) {
                console.log('[RISK] 🚨 强制平仓并停止交易');
                await closeAllPositions();
                break; // 当日直接退出主循环
            }
            // ===== 正常策略执行 =====
            for (const symbol of config.symbols) {
                const bars = await getMinuteBars(symbol);
                // 频率控制，防止请求太多打满cpu、被长桥限流
                await sleep(300);
                await strategy.onBar(symbol, atrMap[symbol]);
            }
        } catch (e: any) {
            console.error('[ERROR]', e.message);
        }
    }
    console.log('[RISK] 🛑 今日交易结束');
}

async function main() {
    // ===== 交易日初始化 =====
    initTradeEnv();
    const startEquity = await getAccountEquity();
    dailyRisk.initDay(startEquity);
    await preloadATR();
}

main().then(_ => {
    console.log('🚀 VWAP 日内策略启动');
    startTradeLoop();
}).catch((e) =>
    console.error('[FATAL]', e.message)
);
