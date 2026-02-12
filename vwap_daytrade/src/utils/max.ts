import { Candlestick } from "longport";


export const calcTopAndLow = (bars: Candlestick[]) => {
    const top = bars.reduce((prev, curr) => {
        return prev.high.toNumber() > curr.high.toNumber() ? prev : curr;
    });
    const low = bars.reduce((prev, curr) => {
        return prev.low.toNumber() < curr.low.toNumber() ? prev : curr;
    });
    return { top, low };
}