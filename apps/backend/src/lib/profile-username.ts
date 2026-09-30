const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

export function validProfileUsername(value: string): boolean {
  const name = value.trim().normalize("NFC");
  const length = Array.from(segmenter.segment(name)).length;
  return name.length <= 1024 && length >= 3 && length <= 30 && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(name);
}
