/**
 * 美股交易时间守卫（使用美东时间）
 */
import { TradeSession } from 'longport';
import { getTradeSessions } from '../longbridge/market';
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import config from '../config/strategy.config';
// import Holidays from 'date-holidays'

// const hd = new Holidays('NY')

// const today = new Date()

// const isHoliday = hd.isHoliday(today)
// console.log(isHoliday, 'isHoliday')

// if (isHoliday) {
//   console.log('美股休市')
// }

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
    console.log(inTradaySession.toJSON(), 'inTradaySession')
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
  ): boolean {
    // 当前时间（UTC）
    const nowUtc = dayjs().utc()
    const exchangeNow = nowUtc.tz('America/New_York')

    const open = this.buildExchangeTime(exchangeNow, session.beginTime)
    const close = this.buildExchangeTime(exchangeNow, session.endTime)

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
  ): boolean {
    // 当前时间（UTC）
    const nowUtc = dayjs().utc()
    const exchangeNow = nowUtc.tz('America/New_York')

    const end = this.buildExchangeTime(exchangeNow, session.endTime)

    const forceCloseStart = end.subtract(closeMinutes, 'minute')

    // 防御：非法配置
    if (closeMinutes <= 0) {
      return false
    }

    return (
      nowUtc.isAfter(forceCloseStart.utc()) &&
      nowUtc.isBefore(end.utc())
    )
  }


  isInTradeTime(
    session: DailyTradeSession = this.session,
  ): boolean {
    // 当前时间（UTC）
    const nowUtc = dayjs().utc()
    const exchangeNow = nowUtc.tz('America/New_York')

    const begin = this.buildExchangeTime(exchangeNow, session.beginTime)
    const end = this.buildExchangeTime(exchangeNow, session.endTime)

    // 转成 UTC 再比较（最安全）
    return nowUtc.isAfter(begin.utc()) && nowUtc.isBefore(end.utc())
  }

  buildExchangeTime(
    exchangeNow: dayjs.Dayjs,
    time: string
  ) {
    const [h, m, s] = time.split(':').map(Number)

    return exchangeNow
      .startOf('day')
      .hour(h)
      .minute(m)
      .second(s ?? 0)
      .millisecond(0)
  }
}

export const timeGuard = new TimeGuard();
