import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";

function dimensions(name: string) {
  const png = readFileSync(new URL(`../../assets/${name}.png`, import.meta.url));
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

it("keeps the card's three logo assets within the native SVG decoded-image cache", () => {
  const copies = ["logo", "title", "crew"].map((name) => dimensions(`membership-card-${name}`));
  const decodedBytes = copies.reduce((bytes, { width, height }) => bytes + width * height * 4, 0);
  expect(decodedBytes).toBeLessThan(5 * 1024 * 1024);
});

it.each([
  ["logo", "logo", 768],
  ["title", "text", 768],
  ["crew", "crew", 512],
])(
  "preserves the original %s artwork's aspect ratio at card resolution",
  (copy, original, maximum) => {
    const card = dimensions(`membership-card-${copy}`);
    const full = dimensions(`title-${original}`);
    expect(Math.max(card.width, card.height)).toBe(maximum);
    expect(card.width / card.height).toBeCloseTo(full.width / full.height, 3);
  },
);
