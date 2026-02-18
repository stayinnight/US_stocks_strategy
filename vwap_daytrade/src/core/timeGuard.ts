/**
 * 美股交易时间守卫（使用美东时间）
 */
import { TradeSession } from 'longport';
import { getTradeSessions } from '../longbridge/market';
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import config from '../config/strategy.config';

dayjs.extend(utc)
dayjs.extend(timezone)

type DailyTradeSession = {
  beginTime: string // '09:30:00'
  endTime: string   // '16:00:00'
  tradeSession: 'Intraday'
}

class TimeGuard {
  session: DailyTradeSession = {
    beginTime: '09:30:00',
    endTime: '16:00:00',
    tradeSession: 'Intraday',
  }

  async initTradeSession() {
    const tradeSession = await getTradeSessions();
    const USmarketSession = tradeSession.find((session) => session.toJSON().market === 'US')?.tradeSessions;
    if (!USmarketSession) {
      throw new Error('US market session not found');
    }
    const inTradaySession = USmarketSession.find((session) => session.tradeSession === TradeSession.Intraday);
    if (!inTradaySession) {
      throw new Error('intraday session not found');
    }
    this.session.beginTime = inTradaySession.toJSON().beginTime;
    this.session.endTime = inTradaySession.toJSON().endTime;
  }

  /**
    * 是否允许交易
    * @param {number} openDelayMin  开盘后禁止分钟数
    * @param {number} closeAheadMin 收盘前禁止分钟数
  */
  isInStrategyTradeTime(
    session: DailyTradeSession = this.session,
    noTradeAfterOpenMinutes: number = config.noTradeAfterOpenMinutes,
    noTradeBeforeCloseMinutes: number = config.noTradeBeforeCloseMinutes,
    now: Date | number = Date.now(),
    exchangeTZ = 'America/New_York'
  ): boolean {
    const { beginTime, endTime } = session

    const nowUtc = dayjs(now).utc()

    // 以交易所“今天”为准
    const exchangeNow = nowUtc.tz(exchangeTZ)
    const tradeDate = exchangeNow.format('YYYY-MM-DD')

    // 构造交易所本地的开盘 / 收盘时间
    const open = dayjs.tz(
      `${tradeDate} ${beginTime}`,
      'YYYY-MM-DD HH:mm:ss',
      exchangeTZ
    )

    const close = dayjs.tz(
      `${tradeDate} ${endTime}`,
      'YYYY-MM-DD HH:mm:ss',
      exchangeTZ
    )

    // 策略允许的交易窗口
    const strategyStart = open.add(noTradeAfterOpenMinutes, 'minute')
    const strategyEnd = close.subtract(noTradeBeforeCloseMinutes, 'minute')

    // 防御：配置错误直接返回 false
    if (strategyStart.isAfter(strategyEnd)) {
      return false
    }

    return (
      nowUtc.isAfter(strategyStart.utc()) &&
      nowUtc.isBefore(strategyEnd.utc())
    )
  }

  /**
    * 是否是尾盘全平时间
  */
  isForceCloseTime(
    session: DailyTradeSession = this.session,
    closeMinutes: number = config.closeTimeMinutes,
    now: Date | number = Date.now(),
    exchangeTZ = 'America/New_York'
  ): boolean {
    const { endTime } = session

    const nowUtc = dayjs(now).utc()

    // 以交易所当天为准
    const exchangeNow = nowUtc.tz(exchangeTZ)
    const tradeDate = exchangeNow.format('YYYY-MM-DD')

    // 构造收盘时间（交易所本地）
    const close = dayjs.tz(
      `${tradeDate} ${endTime}`,
      'YYYY-MM-DD HH:mm:ss',
      exchangeTZ
    )

    const forceCloseStart = close.subtract(closeMinutes, 'minute')

    // 防御：非法配置
    if (closeMinutes <= 0) {
      return false
    }

    return (
      nowUtc.isAfter(forceCloseStart.utc()) &&
      nowUtc.isBefore(close.utc())
    )
  }


  isInTradeTime(
    session: DailyTradeSession = this.session,
    now: Date | number = Date.now(),
    exchangeTZ = 'America/New_York'
  ): boolean {
    const { beginTime, endTime } = session

    // 当前时间（UTC）
    const nowUtc = dayjs(now).utc()

    // 用“交易所今天的日期”
    const exchangeNow = nowUtc.tz(exchangeTZ)
    const tradeDate = exchangeNow.format('YYYY-MM-DD')

    // 构造交易开始 / 结束时间（交易所本地时间）
    const begin = dayjs.tz(
      `${tradeDate} ${beginTime}`,
      'YYYY-MM-DD HH:mm:ss',
      exchangeTZ
    )

    const end = dayjs.tz(
      `${tradeDate} ${endTime}`,
      'YYYY-MM-DD HH:mm:ss',
      exchangeTZ
    )

    // 转成 UTC 再比较（最安全）
    return nowUtc.isAfter(begin.utc()) && nowUtc.isBefore(end.utc())
  }
}

export const timeGuard = new TimeGuard();
