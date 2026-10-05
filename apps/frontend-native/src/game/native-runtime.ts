/** Shared rules use ES2023 toSorted, which older Hermes releases do not provide. */
export function ensureGameRuntimeCompatibility(): void {
  if (typeof Array.prototype.toSorted === "function") return;
  Object.defineProperty(Array.prototype, "toSorted", {
    configurable: true,
    writable: true,
    value: function <T>(this: T[], compare?: (left: T, right: T) => number): T[] {
      return Array.from(this).sort(compare);
    },
  });
}
