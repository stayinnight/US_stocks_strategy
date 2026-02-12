// import strategyConfig from "../config/strategy.config";
// import { getETMinutes } from "../core/timeGuard";

// // 计算当前可以获取的k线数量
// export const getBarLength = () => {
//     const now = getETMinutes();
//     const defaultLength = Math.max(
//         15,
//         strategyConfig.rsiPeriod + 1
//         // strategyConfig.postVolumePeriod + strategyConfig.breakVolumePeriod + 1
//     );
//     if (now > strategyConfig.marketOpenMinutes) {
//         return Math.min(now - strategyConfig.marketOpenMinutes, defaultLength);
//     } else if (now < strategyConfig.marketCloseMinutes) {
//         return Math.min(strategyConfig.marketCloseMinutes - now, defaultLength);
//     }
//     return defaultLength;
// }