/**
 * 风险控制模块
 */
class RiskManager {
  maxDrawdown: number;
  startEquity: number;
  stopped: boolean;

  constructor(maxDrawdown: number) {
    this.maxDrawdown = maxDrawdown;
    this.startEquity = 0;
    this.stopped = false;
  }

  updateEquity(equity: number) {
    if (!this.startEquity) {
      this.startEquity = equity;
    }

    const dd = (this.startEquity - equity) / this.startEquity;
    if (dd >= this.maxDrawdown) {
      this.stopped = true;
      console.log(`[RISK] ❌ 最大回撤触发: ${(dd * 100).toFixed(2)}%`);
    }
  }

  canTrade() {
    return !this.stopped;
  }
}

/**
 * 单日账户级最大回撤控制
 */
class DailyRiskManager {

  maxDrawdown: number;
  startEquity: number;
  tradingHalted: boolean;

  constructor(maxDrawdown: number) {
    this.maxDrawdown = maxDrawdown;

    this.startEquity = 0;
    this.tradingHalted = false;
  }

  /**
   * 每日开盘时调用一次
   */
  initDay(equity: number) {
    this.startEquity = equity;
    this.tradingHalted = false;

    console.log(
      `[RISK] 📊 当日初始净值: ${equity.toFixed(2)}`
    );
  }

  /**
   * 每分钟 / 每次循环调用
   */
  check(equity: number) {
    if (this.tradingHalted) return true;

    const drawdown =
      (this.startEquity - equity) / this.startEquity;

    if (drawdown >= this.maxDrawdown) {
      this.tradingHalted = true;

      console.log(
        `[RISK] ❌ 触发单日最大回撤 ${(drawdown * 100).toFixed(2)}%`
      );

      return true;
    }

    return false;
  }

  canTrade() {
    return !this.tradingHalted;
  }
}

export {
  DailyRiskManager,
  RiskManager
}
