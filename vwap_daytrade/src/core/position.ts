function calcPositionSize({
  equity,
  pct,
  price,
}: {
  equity: number,
  pct: number,
  price: number,
}) {
  const capital = equity * pct;
  return Math.floor(capital / price);
}

export {
  calcPositionSize,
};
