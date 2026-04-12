export function makePlayerOrder(startingIndex: number): [number, number, number, number] {
  const indices = [0, 1, 2, 3];
  const rotated = [...indices.slice(startingIndex), ...indices.slice(0, startingIndex)];
  return rotated as [number, number, number, number];
}
