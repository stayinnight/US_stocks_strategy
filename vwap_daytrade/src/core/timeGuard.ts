/**
 * 美股交易时间守卫（使用美东时间）
 */
import config from '../config/strategy.config';

function getETMinutes() {
  const now = new Date();

  // 转为美东时间
  const et = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );

  return et.getHours() * 60 + et.getMinutes();
}

/**
 * 是否允许交易
 * @param {number} openDelayMin  开盘后禁止分钟数
 * @param {number} closeAheadMin 收盘前禁止分钟数
 */
function isTradableTime(openDelayMin: number, closeAheadMin: number) {
  const nowMin = getETMinutes();

  const tradeStart = config.marketOpenMinutes + openDelayMin;
  const tradeEnd = config.marketCloseMinutes - closeAheadMin;

  return nowMin > tradeStart && nowMin < tradeEnd;
}

module.exports = {
  isTradableTime,
};
