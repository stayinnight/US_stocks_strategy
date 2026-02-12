// 持仓数据类型 - 更新为包含多空方向
export interface Position {
  symbol: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  time: string;
  status: 'active' | 'closed' | 'pending';
  direction: 'long' | 'short'; // 多空方向
  stopLoss: number; // 止损价格
  entryPrice: number; // 入场价格
}

// 股票池股票数据类型 - 精简版
export interface Stock {
  symbol: string;
  atr: number; // ATR值
  amplitude: number; // 振幅百分比
  volumeRatio: number; // 量比
}

// 配置项类型
export interface ConfigItem {
  key: string;
  name: string;
  value: string | number;
  desc: string;
  type: 'number' | 'percent' | 'time' | 'array' | 'stockList';
}

// 配置分类类型
export interface ConfigCategory {
  title: string;
  icon: string;
  items: ConfigItem[];
  stocks?: Stock[]; // 基础参数分类包含股票列表
}

// VWAP策略配置类型
export interface VWAPConfig {
  // 基础参数
  symbols: string[];
  
  // VWAP 区间参数
  vwapBandAtrRatio: number;
  vwapSmoothPeriod: number;
  stopAtrRatio: number;
  tpProtectAtrRatio: number;
  tpFinalAtrRatio: number;
  
  // ATR 区间参数
  atrPeriod: number;
  
  // RSI 区间参数
  rsiPeriod: number;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  
  // 成交量 区间参数
  volumePeriod: number;
  volumeEntryThreshold: number;
  breakVolumePeriod: number;
  postVolumePeriod: number;
  
  // 时间限制（美股时间，分钟）
  noTradeAfterOpenMinutes: number;
  noTradeBeforeCloseMinutes: number;
  closeTimeMinutes: number;
  marketOpenMinutes: number;
  marketCloseMinutes: number;
  
  // 波动过滤
  minDailyMoveAtrRatio: number;
  
  // 风控
  maxDailyDrawdown: number;
  positionPctPerTrade: number;
}

// Toast消息类型
export interface ToastMessage {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

// 交易信号类型
export interface TradeSignal {
  symbol: string;
  time: string;
  type: 'buy' | 'sell';
  reason: string;
  params: {
    vwapSlope: number;
    volumeRatio: number;
    rsi: number;
  };
}

// 页面标签类型
export type TabType = 'positions' | 'config' | 'signals'; // 修改顺序：持仓管理放在第一位

// 信号统计数据
export interface SignalStats {
  total: number;
  buy: number;
  sell: number;
}