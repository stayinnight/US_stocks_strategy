######################  参数设置区开始  ######################
t = {
'股票池' : [
    'COIN', 'APP', 'RKLB', 
    'ORCL', 'IONQ', 'FUTU', 
    'META', 'HOOD', 'TSM', 
    'MSTR', 'BE', 'HIMS', 
    'MP', 'TSLA', 'BABA', 
    'INTC', 'AMD', 'PDD', 
    'MRVL', 'DELL', 'SMCI', 
    'NVDA', 'CRDO', 'MU', 
    'PLTR', 'NFLX', 'LLY', 
    'LULU', 'CIEN', 'SATS', 
    'LITE', 'WDC', 'RIVN',
    'BIDU', 'NOW', 'COHR'
    ],
'开盘时间' : '2230',   #北京时间 
'收盘时间' : '0500',   #北京时间 
'ATR周期' : 14,
'止损ATR系数' : 0.2,
'每单仓位(%)' : 20,
'每日最大亏损限额(%)' : 2,
}
######################  参数设置区结束  ######################


import os
import time
import talib
import logging
import numpy as np
from decimal import Decimal
from threading import Thread
from datetime import datetime, timedelta
from longport.openapi import Config, QuoteContext, TradeContext, OrderType, OrderSide, TimeInForceType, Period, AdjustType   #pip3 install longport


class Status():
    pass    
s = Status() 
s.periodDict = {
    1 : Period.Min_1,
    3 : Period.Min_3,
    5 : Period.Min_5,
    10 : Period.Min_10,
    15 : Period.Min_15,
    30 : Period.Min_30,
    60 : Period.Min_60,
}

def show(msg):
    print(f"{datetime.now():%Y%m%d%H%M%S} {msg}")    
    logging.info(msg)


def start():
    config = Config(enable_overnight=True,
        app_key = "e8c06d148da98f63f04c4eae10db96ac", 
        app_secret = "d8118038165ce555672118f09bd81382629f279d142e5d05023150199fb23213", 
        access_token = "m_eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJsb25nYnJpZGdlIiwic3ViIjoiYWNjZXNzX3Rva2VuIiwiZXhwIjoxNzcyNTQ3NTkyLCJpYXQiOjE3NjQ3NzE1OTMsImFrIjoiZThjMDZkMTQ4ZGE5OGY2M2YwNGM0ZWFlMTBkYjk2YWMiLCJhYWlkIjoyMTAwMzQ4NiwiYWMiOiJsYl9wYXBlcnRyYWRpbmciLCJtaWQiOjE4OTMxMDA0LCJzaWQiOiJ0Z2o1RDNsOElvVHRpR1JGdTdTRnpnPT0iLCJibCI6MywidWwiOjAsImlrIjoibGJfcGFwZXJ0cmFkaW5nXzIxMDAzNDg2In0.EF7s5u-Z5O_jVjlmu9PwwvhYyVfzuiW5S2jM3FxLf81M4ZQAm7i1McQ2Hmhhnk_uw7fjsxxlrKfNo2tunsK0I3LLYRLFbYX7F6JcuqJnxXFebfpGrSyUmGWsrgP5OofZWMm7Sl9_H0Hab1xojgjYdOsSUceg7DsBkSKF1yzYGYjB3NEJ4zdukMoeY_ncjiVBxy7RUm6-XDNY6cobl3_E3Z3vkjcCgH8WphmHHw_e-oTY9G0NkHzv0PYb_hUHDf9oykgsx-AGqamhCy4Mbi0YB7dN0NsHonGc3mE2qk1YYNBi93gJtp2ke67xnb5hjj8RZ7VTAHSHJlnJUtcTaLJ8hcGmZGYk0x8wc3ftgQkJbHpTeikHT2-pH4RsMWPWSlIwnEtCxPrZxFSOey3uTrtnH8sW1v0au-3nttbA259AM5qkkjymKQqIX0hF4bKeR3xnpPC_Px40hyqPRwXh-6KJQZdX8ibDfo8IHujIh4q0JvxS5easEalRg6UvMY2u0OoUjM6UPauGRlGIiVoLTSxrlkxI0KtJMqhu8GIO4BuZdJyqWBp2eiQ1REzUGeI9zCS5ebksU-uqTqfiFgjKBv5G_ddAMiHnnulcgO_6qj4soVhOeucr4Ho_6t0_Zl-4xUwB7EF1Ad2nUVGv6n5_sqNgcytcSpRepKNZOFKoK9IbxAw")
    
    logFileName = os.path.basename(__file__).replace(".py", "_log.txt").replace(".PY", "_log.txt")
    logging.basicConfig(filename=logFileName, level=logging.INFO, format='%(asctime)s %(message)s', datefmt='%m-%d %H:%M:%S')
    s.infoDict = {}
    s.cap = 0
    s.isEnd = False
    s.maxPriceDict = {}
    s.longStockList = []
    s.shortStockList = []
    s.openedStockList = []
    s.excludeStockList = []
    s.quoteContext = QuoteContext(config)
    s.tradeContext = TradeContext(config)
    s.stockList = []
    for item in t['股票池']:
        s.stockList.append(f'{item}.US')
    #s.stockList = ["BABA.US"]
    show(f'准备就绪')
    thread = Thread(target=runLoop)
    thread.start()


def runLoop():
    while True: 
        loop()
        time.sleep(5)


def loop(): 
    if datetime.now().hour > 10:
        startTime = datetime.now().replace(hour=int(t['开盘时间'][:2]), minute=int(t['开盘时间'][2:]), second=0, microsecond=0)
        endTime = (datetime.now() + timedelta(days=1)).replace(hour=int(t['收盘时间'][:2]), minute=int(t['收盘时间'][2:]), second=0, microsecond=0)
    else:
        startTime = (datetime.now() - timedelta(days=1)).replace(hour=int(t['开盘时间'][:2]), minute=int(t['开盘时间'][2:]), second=0, microsecond=0)
        endTime = datetime.now().replace(hour=int(t['收盘时间'][:2]), minute=int(t['收盘时间'][2:]), second=0, microsecond=0)
    if datetime.now() < startTime + timedelta(minutes=10) or datetime.now() >= endTime:
    # if datetime.now() < startTime + timedelta(minutes=10) or datetime.now() >= endTime: // 可以控制开盘后多少分钟开始交易
        s.cap = 0
        s.isEnd = False
        s.infoDict = {}
        s.maxPriceDict = {}
        s.longStockList = []
        s.shortStockList = []
        s.openedStockList = []
        s.excludeStockList = []
        return
    
    cap = s.tradeContext.account_balance()[0].net_assets
    if s.cap == 0:
        s.cap = cap
    elif cap < s.cap * Decimal(0.97):
        s.isEnd = True
    
    holdDict = {}
    costDict = {}
    try:
        positions = s.tradeContext.stock_positions()
        quotes = s.quoteContext.quote(s.stockList)
    except Exception as e:
        show(f'查询失败:{e}')
        return
    for item in positions.channels[0].positions:
        if item.symbol not in s.stockList:
            continue
        holdDict[item.symbol] = item.available_quantity
        costDict[item.symbol] = item.cost_price

    for quote in quotes:
        if quote.volume == 0:
            continue
        if quote.symbol in s.excludeStockList:
            continue
        vwap = quote.turnover / quote.volume

        hold = holdDict.get(quote.symbol, 0)
        if hold != 0:    
            if quote.symbol in s.openedStockList:
                s.openedStockList.remove(quote.symbol)
            if hold > 0:             
                s.maxPriceDict[quote.symbol] = max(quote.last_done, s.maxPriceDict.get(quote.symbol, 0))
                isClose = False
                if s.isEnd:                
                    show(f'达到最大亏损限额,股票[{quote.symbol}]清仓')
                    isClose = True
                elif datetime.now() >= endTime - timedelta(minutes=10):              
                    show(f'尾盘,股票[{quote.symbol}]清仓')
                    isClose = True
                else:                    
                    info = s.infoDict.get(quote.symbol, None)
                    if not info:
                        continue
                    atr = info[2]
                    if quote.last_done <= s.maxPriceDict[quote.symbol] - Decimal(atr * t['止损ATR系数']):           
                        show(f'达到移动止损条件,股票[{quote.symbol}]清仓')
                        isClose = True
                if isClose:
                    try:
                        s.tradeContext.submit_order(
                            quote.symbol,
                            OrderType.LO,
                            OrderSide.Sell,
                            Decimal(hold),
                            TimeInForceType.Day,
                            submitted_price=Decimal(round(quote.last_done / Decimal(1.03), 2)))
                        s.maxPriceDict.pop(quote.symbol, None)
                    except Exception as e:
                        show(f'股票[{quote.symbol}]卖出失败:{e}')
            else:            
                s.maxPriceDict[quote.symbol] = min(quote.last_done, s.maxPriceDict.get(quote.symbol, 99999999))
                isClose = False
                if s.isEnd:                
                    show(f'达到最大亏损限额,股票[{quote.symbol}]清仓')
                    isClose = True
                elif datetime.now() >= endTime - timedelta(minutes=10):              
                    show(f'尾盘,股票[{quote.symbol}]清仓')
                    isClose = True
                else:                    
                    info = s.infoDict.get(quote.symbol, None)
                    if not info:
                        continue
                    atr = info[2]
                    if quote.last_done >= s.maxPriceDict[quote.symbol] + Decimal(atr * t['止损ATR系数']):           
                        show(f'达到移动止损条件,股票[{quote.symbol}]清仓')
                        isClose = True
                if isClose:
                    try:
                        s.tradeContext.submit_order(
                            quote.symbol,
                            OrderType.LO,
                            OrderSide.Buy,
                            Decimal(abs(hold)),
                            TimeInForceType.Day,
                            submitted_price=Decimal(round(quote.last_done * Decimal(1.03), 2)))
                        s.maxPriceDict.pop(quote.symbol, None)
                    except Exception as e:
                        show(f'股票[{quote.symbol}]买入失败:{e}')
            continue

        if s.isEnd:
            continue
        if quote.symbol in s.openedStockList:
            continue
        if datetime.now() >= endTime - timedelta(minutes=5):
            continue
        if quote.symbol in s.infoDict.keys():
            info = s.infoDict[quote.symbol]
            up, down, atr = info[0], info[1], info[2]
        else:
            try:
                data = s.quoteContext.history_candlesticks_by_offset(symbol = quote.symbol, period = Period.Day, adjust_type = AdjustType.ForwardAdjust, forward = False, count = t['ATR周期'] * 2)
                time.sleep(0.3)
                highs = np.zeros(len(data))
                lows = np.zeros(len(data))
                closes = np.zeros(len(data))
                for i in range(len(data)):
                    highs[i] = data[i].high
                    lows[i] = data[i].low
                    closes[i] = data[i].close
                atr = talib.ATR(highs, lows, closes, t['ATR周期'])[-1]

                data5 = s.quoteContext.history_candlesticks_by_date(quote.symbol, s.periodDict[5], AdjustType.ForwardAdjust, start=startTime, end=endTime)
                time.sleep(0.3)
                if len(data5) == 0:
                    continue
                up = data5[0].high
                down = data5[0].low
                s.infoDict[quote.symbol] = (up, down, atr)
                show(f'{quote.symbol} 上轨:{up} 下轨:{down}')
            except Exception as e:
                show(f'获取{quote.symbol}的K线失败:{e}')
                continue  
            
        data1 = s.quoteContext.history_candlesticks_by_offset(quote.symbol, s.periodDict[1], AdjustType.ForwardAdjust, forward = False, count = 3)
        time.sleep(0.3)
        if len(data1) < 3:
            continue
        if data1[-2].close > up + up * Decimal(0.002) and data1[-3].close < up + up * Decimal(0.002) and data1[-2].close > vwap: 
            if quote.symbol in s.longStockList:
                continue
            isBuy = True
        elif data1[-2].close < down - down * Decimal(0.002) and data1[-3].close > down - down * Decimal(0.002) and data1[-2].close < vwap: 
            if quote.symbol in s.shortStockList:
                continue
            isBuy = False
        else:
            continue

        if len(holdDict.keys()) >= int(1 / t['每单仓位(%)'] * 100):
            continue
        # data1 = s.quoteContext.history_candlesticks_by_date(quote.symbol, s.periodDict[1], AdjustType.ForwardAdjust, start=startTime, end=endTime)
        # time.sleep(0.3)
        # if len(data1) < 6:
        #     continue 
        # volumes = np.zeros(6)
        # for i in range(6):
        #     volumes[-1-i] = data1[-1-i].volume
        # volumeMA = talib.MA(volumes.astype(float), 5)[-1]
        # if max(volumes[-1], volumes[-2]) < volumeMA * 1.5:
        #     continue
        lot = round(cap * t['每单仓位(%)'] / 100 / Decimal(7.5) / quote.last_done)
        if lot == 0:
            s.excludeStockList.append(quote.symbol)
            continue 
        if isBuy:
            show(f'股票[{quote.symbol}]做多买入{lot}股')
            try:
                s.tradeContext.submit_order(
                    quote.symbol,
                    OrderType.LO,
                    OrderSide.Buy,
                    Decimal(lot),
                    TimeInForceType.Day,
                    submitted_price=Decimal(round(quote.last_done * Decimal(1.03), 2)))
                s.longStockList.append(quote.symbol)
                s.openedStockList.append(quote.symbol)
                s.maxPriceDict[quote.symbol] = quote.last_done
            except Exception as e:
                show(f'股票[{quote.symbol}]买入失败:{e}')
                s.excludeStockList.append(quote.symbol)
        else:
            show(f'股票[{quote.symbol}]做空卖出{lot}股')
            try:
                s.tradeContext.submit_order(
                    quote.symbol,
                    OrderType.LO,
                    OrderSide.Sell,
                    Decimal(lot),
                    TimeInForceType.Day,
                    submitted_price=Decimal(round(quote.last_done / Decimal(1.03), 2)))
                s.shortStockList.append(quote.symbol)
                s.openedStockList.append(quote.symbol)
                s.maxPriceDict[quote.symbol] = quote.last_done
            except Exception as e:
                show(f'股票[{quote.symbol}]卖出失败:{e}')
                s.excludeStockList.append(quote.symbol)

start()