function calcPositionSize({
  equity,
  pct,
  price,
}) {
  const capital = equity * pct;
  return Math.floor(capital / price);
}

module.exports = {
  calcPositionSize,
};
