import { getQuote } from "../longbridge/market";
import { SecurityQuote } from "longport";


class RealTimeMarket {
    private quotes: Record<string, SecurityQuote> = {};

    /**
     * 每次循环都要调用，获取所有标的的实时行情
     * @param symbols 标的代码列表
     * @returns 
     */
    async init(symbols: string[]) {
        const quotes = await getQuote(symbols);
        quotes.forEach(q => {
            this.quotes[q.symbol] = q;
        })
    }

    getQuote(symbol: string) {
        return this.quotes[symbol];
    }
}

export {
    RealTimeMarket,
}