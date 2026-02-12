import React, { useState, useEffect } from 'react';
import './App.css';
import {
  Position,
  ConfigCategory,
  ToastMessage,
  TabType,
  SignalStats,
  VWAPConfig,
  Stock,
  ConfigItem
} from './types';

// 模拟的持仓数据 - 更新为包含多空方向和止损价格
const initialPositions: Position[] = [
  { symbol: 'TSLA.US', shares: 150, avgPrice: 185.42, currentPrice: 187.56, pnl: 321, pnlPercent: 1.15, time: '09:45', status: 'active', direction: 'long', stopLoss: 182.50, entryPrice: 185.42 },
  { symbol: 'NVDA.US', shares: 80, avgPrice: 450.25, currentPrice: 452.78, pnl: 202.4, pnlPercent: 0.56, time: '10:15', status: 'active', direction: 'long', stopLoss: 445.00, entryPrice: 450.25 },
  { symbol: 'AAPL.US', shares: 200, avgPrice: 172.30, currentPrice: 173.45, pnl: 230, pnlPercent: 0.67, time: '11:30', status: 'active', direction: 'long', stopLoss: 169.80, entryPrice: 172.30 },
  { symbol: 'AMD.US', shares: 120, avgPrice: 125.60, currentPrice: 124.85, pnl: -90, pnlPercent: -0.60, time: '13:20', status: 'active', direction: 'short', stopLoss: 127.50, entryPrice: 125.60 },
  { symbol: 'MSFT.US', shares: 100, avgPrice: 335.40, currentPrice: 337.20, pnl: 180, pnlPercent: 0.54, time: '14:45', status: 'active', direction: 'long', stopLoss: 332.00, entryPrice: 335.40 },
];

// VWAP策略配置
const vwapConfig: VWAPConfig = {
  // 基础参数
  symbols: [
    'COIN', 'APP', 'RKLB', 'ORCL', 'IONQ', 'FUTU', 'HOOD', 'TSM', 'MSTR', 'BE',
    'HIMS', 'MP', 'TSLA', 'BABA', 'INTC', 'AMD', 'PDD', 'MRVL', 'DELL', 'SMCI',
    'CRDO', 'MU', 'PLTR', 'NFLX', 'LLY', 'LULU', 'CIEN', 'SATS', 'LITE', 'WDC',
    'RIVN', 'NOW', 'COHR', 'FCX', 'STX'
  ].map(s => s + '.US'),
  
  // VWAP 区间参数
  vwapBandAtrRatio: 0.05,
  vwapSmoothPeriod: 10,
  stopAtrRatio: 0.1,
  tpProtectAtrRatio: 0.2,
  tpFinalAtrRatio: 0.25,
  
  // ATR 区间参数
  atrPeriod: 14,
  
  // RSI 区间参数
  rsiPeriod: 6,
  rsiBuyThreshold: 55,
  rsiSellThreshold: 45,
  
  // 成交量 区间参数
  volumePeriod: 15,
  volumeEntryThreshold: 1.2,
  breakVolumePeriod: 5,
  postVolumePeriod: 10,
  
  // 时间限制（美股时间，分钟）
  noTradeAfterOpenMinutes: 5,
  noTradeBeforeCloseMinutes: 20,
  closeTimeMinutes: 10,
  marketOpenMinutes: 22 * 60 + 30,
  marketCloseMinutes: 5 * 60,
  
  // 波动过滤
  minDailyMoveAtrRatio: 0.5,
  
  // 风控
  maxDailyDrawdown: 0.02,
  positionPctPerTrade: 0.2,
};

// 股票logo列表 - 随机选择
const stockLogos = ['📈', '📊', '💹', '💰', '💎', '🚀', '⭐', '🔥', '⚡', '🏆', '🎯', '💼', '📉', '📌', '📍', '🔔'];

// 生成股票池数据 - 精简版
const generateStockPool = (): Stock[] => {
  return vwapConfig.symbols.map((symbol, index) => {
    const atr = parseFloat((0.5 + Math.random() * 5).toFixed(2)); // ATR值 0.5-5.5
    const amplitude = parseFloat((1 + Math.random() * 10).toFixed(2)); // 振幅 1-11%
    const volumeRatio = parseFloat((0.5 + Math.random() * 3).toFixed(2)); // 量比 0.5-3.5
    
    return {
      symbol,
      atr,
      amplitude,
      volumeRatio,
    };
  });
};

// 配置分类及描述
const configCategories: ConfigCategory[] = [
  {
    title: "基础参数",
    icon: "📋",
    items: [
      { 
        key: "symbols", 
        name: "交易标的", 
        value: `${vwapConfig.symbols.length} 只股票`, 
        desc: "策略将监控和交易的股票列表，支持滚动查看详细信息", 
        type: "stockList" 
      }
    ],
    stocks: generateStockPool()
  },
  {
    title: "VWAP区间参数",
    icon: "📊",
    items: [
      { 
        key: "vwapBandAtrRatio", 
        name: "VWAP带ATR比率", 
        value: vwapConfig.vwapBandAtrRatio, 
        desc: "VWAP上下轨基于ATR的宽度比例", 
        type: "number" 
      },
      { 
        key: "vwapSmoothPeriod", 
        name: "VWAP平滑周期", 
        value: vwapConfig.vwapSmoothPeriod, 
        desc: "计算VWAP斜率的时间窗口(分钟)", 
        type: "number" 
      },
      { 
        key: "stopAtrRatio", 
        name: "止损ATR比率", 
        value: vwapConfig.stopAtrRatio, 
        desc: "基于ATR的止损幅度", 
        type: "number" 
      },
      { 
        key: "tpProtectAtrRatio", 
        name: "止盈保护ATR比率", 
        value: vwapConfig.tpProtectAtrRatio, 
        desc: "保护性止盈的ATR比率", 
        type: "number" 
      },
      { 
        key: "tpFinalAtrRatio", 
        name: "最终止盈ATR比率", 
        value: vwapConfig.tpFinalAtrRatio, 
        desc: "最终止盈的ATR比率", 
        type: "number" 
      }
    ]
  },
  {
    title: "ATR区间参数",
    icon: "📈",
    items: [
      { 
        key: "atrPeriod", 
        name: "ATR周期", 
        value: vwapConfig.atrPeriod, 
        desc: "计算平均真实波幅的周期", 
        type: "number" 
      }
    ]
  },
  {
    title: "RSI区间参数",
    icon: "🔄",
    items: [
      { 
        key: "rsiPeriod", 
        name: "RSI周期", 
        value: vwapConfig.rsiPeriod, 
        desc: "计算相对强弱指数的周期", 
        type: "number" 
      },
      { 
        key: "rsiBuyThreshold", 
        name: "RSI买入阈值", 
        value: vwapConfig.rsiBuyThreshold, 
        desc: "触发买入信号的RSI阈值", 
        type: "number" 
      },
      { 
        key: "rsiSellThreshold", 
        name: "RSI卖出阈值", 
        value: vwapConfig.rsiSellThreshold, 
        desc: "触发卖出信号的RSI阈值", 
        type: "number" 
      }
    ]
  },
  {
    title: "成交量区间参数",
    icon: "📉",
    items: [
      { 
        key: "volumePeriod", 
        name: "成交量周期", 
        value: vwapConfig.volumePeriod, 
        desc: "计算成交量均线的周期(分钟)", 
        type: "number" 
      },
      { 
        key: "volumeEntryThreshold", 
        name: "成交量入场阈值", 
        value: vwapConfig.volumeEntryThreshold, 
        desc: "成交量突破触发交易的倍数", 
        type: "number" 
      },
      { 
        key: "breakVolumePeriod", 
        name: "突破成交量周期", 
        value: vwapConfig.breakVolumePeriod, 
        desc: "检测成交量突破的时间窗口(分钟)", 
        type: "number" 
      },
      { 
        key: "postVolumePeriod", 
        name: "后成交量周期", 
        value: vwapConfig.postVolumePeriod, 
        desc: "对比过去成交量的时间窗口(分钟)", 
        type: "number" 
      }
    ]
  },
  {
    title: "时间限制参数",
    icon: "⏰",
    items: [
      { 
        key: "noTradeAfterOpenMinutes", 
        name: "开盘不交易时间", 
        value: vwapConfig.noTradeAfterOpenMinutes, 
        desc: "开盘后多少分钟内不交易(分钟)", 
        type: "number" 
      },
      { 
        key: "noTradeBeforeCloseMinutes", 
        name: "收盘前不交易时间", 
        value: vwapConfig.noTradeBeforeCloseMinutes, 
        desc: "收盘前多少分钟内不交易(分钟)", 
        type: "number" 
      },
      { 
        key: "closeTimeMinutes", 
        name: "尾盘平仓时间", 
        value: vwapConfig.closeTimeMinutes, 
        desc: "收盘前多少分钟开始强制平仓(分钟)", 
        type: "number" 
      },
      { 
        key: "marketOpenMinutes", 
        name: "市场开盘时间", 
        value: "10:30", 
        desc: "市场开盘时间(美东时间)", 
        type: "time" 
      },
      { 
        key: "marketCloseMinutes", 
        name: "市场收盘时间", 
        value: "17:00", 
        desc: "市场收盘时间(美东时间)", 
        type: "time" 
      }
    ]
  },
  {
    title: "波动过滤参数",
    icon: "🌊",
    items: [
      { 
        key: "minDailyMoveAtrRatio", 
        name: "最小日波动ATR比率", 
        value: vwapConfig.minDailyMoveAtrRatio, 
        desc: "触发交易的最小日波动幅度(ATR比率)", 
        type: "number" 
      }
    ]
  },
  {
    title: "风控参数",
    icon: "🛡️",
    items: [
      { 
        key: "maxDailyDrawdown", 
        name: "最大日回撤", 
        value: `${(vwapConfig.maxDailyDrawdown * 100).toFixed(1)}%`, 
        desc: "当日最大允许回撤比例", 
        type: "percent" 
      },
      { 
        key: "positionPctPerTrade", 
        name: "单笔仓位比例", 
        value: `${(vwapConfig.positionPctPerTrade * 100).toFixed(1)}%`, 
        desc: "每笔交易占用资金的比例", 
        type: "percent" 
      }
    ]
  }
];

// 模拟信号统计数据
const initialSignalStats: SignalStats = {
  total: 24,
  buy: 16,
  sell: 8
};

const App: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>(initialPositions);
  const [activeTab, setActiveTab] = useState<TabType>('positions'); // 默认显示持仓管理
  const [strategyStatus, setStrategyStatus] = useState<boolean>(true);
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [showCloseAllModal, setShowCloseAllModal] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage>({ 
    show: false, 
    message: '', 
    type: 'success' 
  });
  const [signalStats] = useState<SignalStats>(initialSignalStats);
  
  // 计算总盈亏
  const totalPnl = positions.reduce((sum, pos) => sum + pos.pnl, 0);
  const totalPnlPercent = positions.length > 0 
    ? positions.reduce((sum, pos) => sum + pos.pnlPercent, 0) / positions.length 
    : 0;
  
  // 显示Toast提示
  const showToast = (message: string, type: ToastMessage['type'] = 'success'): void => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 3000);
  };
  
  // 平仓单个持仓
  const handleClosePosition = (symbol: string): void => {
    setClosingPosition(symbol);
    
    // 模拟平仓操作
    setTimeout(() => {
      setPositions(prev => prev.filter(pos => pos.symbol !== symbol));
      setClosingPosition(null);
      showToast(`已平仓 ${symbol}`);
    }, 800);
  };
  
  // 一键平仓所有持仓
  const handleCloseAllPositions = (): void => {
    setShowCloseAllModal(false);
    
    // 模拟平仓动画
    const closingInterval = setInterval(() => {
      setPositions(prev => {
        if (prev.length === 0) {
          clearInterval(closingInterval);
          return [];
        }
        return prev.slice(1);
      });
    }, 300);
    
    setTimeout(() => {
      clearInterval(closingInterval);
      showToast("已平仓所有持仓");
    }, positions.length * 300 + 500);
  };
  
  // 获取股票颜色标识
  const getStockColor = (symbol: string): string => {
    const colors = [
      '#165DFF', '#00B42A', '#FF7D00', '#F53F3F', 
      '#722ED1', '#14C9C9', '#FF4D4F', '#FFC64A'
    ];
    const index = symbol.charCodeAt(0) % colors.length;
    return colors[index];
  };
  
  // 获取随机股票logo
  const getRandomStockLogo = (symbol: string): string => {
    const index = symbol.charCodeAt(0) % stockLogos.length;
    return stockLogos[index];
  };
  
  // 获取多空方向样式
  const getDirectionStyle = (direction: 'long' | 'short'): React.CSSProperties => {
    return {
      color: direction === 'long' ? '#00B42A' : '#F53F3F',
      fontWeight: 'bold'
    };
  };
  
  // 获取多空方向显示文本
  const getDirectionText = (direction: 'long' | 'short'): string => {
    return direction === 'long' ? '多仓' : '空仓';
  };
  
  // 格式化数字
  const formatNumber = (num: number): string => {
    return num.toFixed(2);
  };
  
  // 格式化配置项值显示
  const formatConfigValue = (item: ConfigItem): string => {
    if (typeof item.value === 'number') {
      return item.value.toString();
    }
    return item.value;
  };
  
  // 获取标签页显示名称
  const getTabName = (tab: TabType): string => {
    const tabNames: Record<TabType, string> = {
      positions: '持仓管理',
      config: '策略配置',
      signals: '交易信号'
    };
    return tabNames[tab];
  };
  
  // 获取股票卡片样式
  const getStockCardStyle = (index: number): React.CSSProperties => {
    const delays = ['0s', '0.05s', '0.1s', '0.15s', '0.2s', '0.25s'];
    return {
      animationDelay: delays[index % delays.length]
    };
  };
  
  return (
    <div className="app">
      {/* 顶部状态栏 */}
      <div className="status-bar">
        <div className="status-time">
          {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
        </div>
        <div className="status-indicator">
          <div className={`status-dot ${strategyStatus ? 'active' : 'inactive'}`}></div>
          <span>{strategyStatus ? '策略运行中' : '策略已暂停'}</span>
        </div>
      </div>
      
      {/* 头部 */}
      <div className="header">
        <div className="header-content">
          <h1 className="app-title">VWAP日内量化策略</h1>
          <div className="strategy-status">
            <span className="status-label">策略状态:</span>
            <div className="switch-container">
              <input 
                type="checkbox" 
                id="strategy-switch" 
                className="switch-input" 
                checked={strategyStatus}
                onChange={() => setStrategyStatus(!strategyStatus)}
              />
              <label htmlFor="strategy-switch" className="switch-label">
                <span className="switch-slider"></span>
                <span className="switch-text">{strategyStatus ? '运行中' : '已暂停'}</span>
              </label>
            </div>
          </div>
        </div>
        
        {/* 统计卡片 */}
        <div className="stats-cards">
          <div className="stat-card">
            <div className="stat-content">
              <div className="stat-icon">📈</div>
              <div>
                <div className="stat-label">总持仓</div>
                <div className="stat-value">{positions.length}</div>
              </div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-content">
              <div className="stat-icon" style={{color: totalPnl >= 0 ? '#00B42A' : '#F53F3F'}}>
                {totalPnl >= 0 ? '💰' : '📉'}
              </div>
              <div>
                <div className="stat-label">总盈亏</div>
                <div className="stat-value" style={{color: totalPnl >= 0 ? '#00B42A' : '#F53F3F'}}>
                  ${formatNumber(totalPnl)}
                </div>
              </div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-content">
              <div className="stat-icon">📊</div>
              <div>
                <div className="stat-label">平均收益率</div>
                <div className="stat-value" style={{color: totalPnlPercent >= 0 ? '#00B42A' : '#F53F3F'}}>
                  {formatNumber(totalPnlPercent)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 主内容区域 */}
      <div className="main-content">
        {/* 标签页导航 - 调整顺序：持仓管理放在第一位 */}
        <div className="tabs-container">
          <div className="tabs-header">
            {(['positions', 'config', 'signals'] as TabType[]).map(tab => (
              <button 
                key={tab}
                className={`tab-button ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {getTabName(tab)}
              </button>
            ))}
          </div>
          
          <div className="tabs-content">
            {/* 持仓管理标签页 - 放在第一位 */}
            {activeTab === 'positions' && (
              <div className="tab-content active">
                <div className="positions-section">
                  <div className="section-header">
                    <h2 className="section-title">当前持仓</h2>
                    <div className="section-actions">
                      <button 
                        className="btn btn-danger btn-small"
                        onClick={() => setShowCloseAllModal(true)}
                        disabled={positions.length === 0}
                      >
                        一键平仓
                      </button>
                    </div>
                  </div>
                  
                  {positions.length === 0 ? (
                    <div className="empty-positions">
                      <div className="empty-icon">📭</div>
                      <p className="empty-text">暂无持仓</p>
                      <p className="empty-desc">当前没有活跃的持仓</p>
                    </div>
                  ) : (
                    <>
                      <div className="positions-list">
                        {positions.map((position, index) => (
                          <div 
                            key={position.symbol}
                            className="position-item"
                            style={{animationDelay: `${index * 0.1}s`}}
                          >
                            <div className="position-header">
                              <div className="stock-info">
                                <div 
                                  className="stock-avatar"
                                  style={{ backgroundColor: getStockColor(position.symbol) }}
                                >
                                  {getRandomStockLogo(position.symbol)}
                                </div>
                                <div className="stock-details">
                                  <div className="stock-symbol">{position.symbol}</div>
                                  <div className="stock-direction" style={getDirectionStyle(position.direction)}>
                                    {getDirectionText(position.direction)}
                                  </div>
                                </div>
                              </div>
                              <div className="position-actions">
                                <button 
                                  className={`btn btn-close ${closingPosition === position.symbol ? 'loading' : ''}`}
                                  style={{ 
                                    backgroundColor: position.pnl >= 0 ? '#00B42A' : '#F53F3F'
                                  }}
                                  onClick={() => handleClosePosition(position.symbol)}
                                  disabled={closingPosition === position.symbol}
                                >
                                  {closingPosition === position.symbol ? (
                                    <>
                                      <span className="spinner"></span>
                                      平仓中
                                    </>
                                  ) : '平仓'}
                                </button>
                              </div>
                            </div>
                            
                            <div className="position-content">
                              <div className="position-details">
                                <div className="position-info">
                                  <div className="info-row">
                                    <span className="info-label">入场价格:</span>
                                    <span className="info-value">${formatNumber(position.entryPrice)}</span>
                                  </div>
                                  <div className="info-row">
                                    <span className="info-label">持仓数量:</span>
                                    <span className="info-value">{position.shares} 股</span>
                                  </div>
                                  <div className="info-row">
                                    <span className="info-label">止损价格:</span>
                                    <span className="info-value">${formatNumber(position.stopLoss)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="positions-summary">
                        <div className="summary-card">
                          <div className="summary-row">
                            <span>总持仓数量:</span>
                            <span>{positions.length} 只股票</span>
                          </div>
                          <div className="summary-row">
                            <span>总盈亏:</span>
                            <span style={{color: totalPnl >= 0 ? '#00B42A' : '#F53F3F'}}>
                              {totalPnl >= 0 ? '+' : ''}${formatNumber(totalPnl)}
                            </span>
                          </div>
                          <div className="summary-row">
                            <span>平均收益率:</span>
                            <span style={{color: totalPnlPercent >= 0 ? '#00B42A' : '#F53F3F'}}>
                              {totalPnlPercent >= 0 ? '+' : ''}{formatNumber(totalPnlPercent)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            
            {/* 策略配置标签页 - 放在第二位 */}
            {activeTab === 'config' && (
              <div className="tab-content active">
                <div className="config-section">
                  <h2 className="section-title">VWAP策略参数配置</h2>
                  <p className="section-desc">调整以下参数以优化您的VWAP日内交易策略</p>
                  
                  {configCategories.map((category, catIndex) => (
                    <div 
                      key={catIndex} 
                      className="config-category-card"
                      style={{animationDelay: `${catIndex * 0.1}s`}}
                    >
                      <div className="category-header">
                        <span className="category-icon">{category.icon}</span>
                        <h3 className="category-title">{category.title}</h3>
                      </div>
                      
                      <div className="config-items">
                        {category.items.map((item, itemIndex) => (
                          <div key={item.key}>
                            {item.type === 'stockList' && category.stocks ? (
                              <div className="stock-list-container">
                                <div className="stock-list-header">
                                  <div className="stock-list-title">{item.name}</div>
                                  <div className="stock-list-count">{item.value}</div>
                                </div>
                                <div className="stock-list-desc">{item.desc}</div>
                                
                                <div className="stock-pool-container">
                                  <div className="stock-pool-scroll">
                                    {category.stocks.map((stock, stockIndex) => (
                                      <div 
                                        key={stock.symbol}
                                        className="stock-card"
                                        style={getStockCardStyle(stockIndex)}
                                      >
                                        <div className="stock-card-header">
                                          <div className="stock-logo">
                                            {getRandomStockLogo(stock.symbol)}
                                          </div>
                                          <div className="stock-symbol">
                                            {stock.symbol}
                                          </div>
                                        </div>
                                        
                                        <div className="stock-card-content">
                                          <div className="stock-metrics">
                                            <div className="stock-metric">
                                              <div className="metric-label">ATR值</div>
                                              <div className="metric-value">{stock.atr}</div>
                                            </div>
                                            <div className="stock-metric">
                                              <div className="metric-label">振幅</div>
                                              <div className="metric-value">{stock.amplitude}%</div>
                                            </div>
                                            <div className="stock-metric">
                                              <div className="metric-label">量比</div>
                                              <div className="metric-value">{stock.volumeRatio}x</div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div 
                                key={item.key} 
                                className="config-item"
                                style={{animationDelay: `${catIndex * 0.1 + itemIndex * 0.05}s`}}
                              >
                                <div className="config-item-header">
                                  <span className="config-item-name">{item.name}</span>
                                  <span className="config-item-value">{formatConfigValue(item)}</span>
                                </div>
                                <div className="config-item-desc">{item.desc}</div>
                                
                                {/* 对于数值型参数显示滑块 */}
                                {item.type === 'number' && (
                                  <div className="config-slider">
                                    <div className="slider-container">
                                      <div className="slider-track">
                                        <div 
                                          className="slider-fill" 
                                          style={{width: `${(vwapConfig[item.key as keyof VWAPConfig] as number / (item.key.includes('Ratio') ? 0.5 : 50)) * 100}%`}}
                                        ></div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  
                  <div className="action-buttons">
                    <button 
                      className="btn btn-primary"
                      onClick={() => showToast('配置已保存', 'success')}
                    >
                      保存配置
                    </button>
                    <button 
                      className="btn btn-secondary"
                      onClick={() => showToast('已重置为默认配置', 'info')}
                    >
                      重置为默认
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* 交易信号标签页 - 放在第三位，只显示统计 */}
            {activeTab === 'signals' && (
              <div className="tab-content active">
                <div className="signals-section">
                  <h2 className="section-title">今日交易信号统计</h2>
                  <p className="section-desc">今日交易信号的统计概览</p>
                  
                  <div className="signals-overview">
                    <div className="signal-overview-card">
                      <div className="signal-overview-content">
                        <div className="signal-stat">
                          <div className="signal-stat-value">{signalStats.total}</div>
                          <div className="signal-stat-label">总信号数</div>
                        </div>
                        <div className="signal-stat">
                          <div className="signal-stat-value" style={{color: '#00B42A'}}>
                            {signalStats.buy}
                          </div>
                          <div className="signal-stat-label">买入信号</div>
                        </div>
                        <div className="signal-stat">
                          <div className="signal-stat-value" style={{color: '#F53F3F'}}>
                            {signalStats.sell}
                          </div>
                          <div className="signal-stat-label">卖出信号</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="signals-summary">
                    <div className="summary-card">
                      <div className="summary-row">
                        <span>信号时间范围:</span>
                        <span>09:30 - 16:00</span>
                      </div>
                      <div className="summary-row">
                        <span>买入信号占比:</span>
                        <span style={{color: '#00B42A'}}>
                          {((signalStats.buy / signalStats.total) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="summary-row">
                        <span>卖出信号占比:</span>
                        <span style={{color: '#F53F3F'}}>
                          {((signalStats.sell / signalStats.total) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* 一键平仓确认模态框 */}
      {showCloseAllModal && (
        <div className="modal-overlay" onClick={() => setShowCloseAllModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">确认一键平仓</h3>
              <button 
                className="modal-close" 
                onClick={() => setShowCloseAllModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="close-all-modal">
                <div className="modal-icon">⚠️</div>
                <p>您确定要平仓所有 {positions.length} 个持仓吗？</p>
                <div className="modal-positions">
                  {positions.slice(0, 3).map(pos => (
                    <div key={pos.symbol} className="modal-position">
                      {pos.symbol}: <span style={{color: pos.pnl >= 0 ? '#00B42A' : '#F53F3F'}}>
                        {pos.pnl >= 0 ? '+' : ''}${formatNumber(pos.pnl)}
                      </span>
                    </div>
                  ))}
                  {positions.length > 3 && (
                    <div className="modal-position">
                      ... 还有 {positions.length - 3} 个持仓
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowCloseAllModal(false)}
              >
                取消
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleCloseAllPositions}
              >
                确认平仓
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Toast提示 */}
      {toast.show && (
        <div className={`toast toast-${toast.type}`}>
          <div className="toast-content">
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      )}
      
      {/* 底部导航栏 */}
      <div className="footer">
        <div className="footer-content">
          <div className="footer-status">
            <div className="status-indicator">
              <div className={`status-dot ${strategyStatus ? 'active' : 'inactive'}`}></div>
              <span>{strategyStatus ? '策略运行中' : '策略已暂停'}</span>
            </div>
            <div className="footer-time">
              更新时间: {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;