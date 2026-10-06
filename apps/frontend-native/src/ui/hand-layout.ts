export function handLayout(width: number, count: number, compact = false) {
  const cardWidth = compact ? Math.min(50, width * 0.12) : Math.min(110, width * 0.19);
  const cardHeight = cardWidth * 1.48;
  const intervals = Math.max(count - 1, 1);
  const spread = Math.min(0.082, 0.69 / intervals) * width;
  const arc = width * (compact ? 0.025 : 0.05);
  const lift = compact ? 14 : 20;
  return {
    cardWidth,
    cardHeight,
    height: cardHeight + arc + lift,
    card: (index: number, selected = false) => {
      const offset = index - (count - 1) / 2;
      return {
        left: (width - cardWidth) / 2 + offset * spread,
        top: lift + (offset / Math.max((count - 1) / 2, 1)) ** 2 * arc - (selected ? lift : 0),
        angle: offset * Math.min(3.5, 32 / intervals),
      };
    },
  };
}
