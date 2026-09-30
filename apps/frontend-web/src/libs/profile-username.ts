const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

export function profileUsernameError(value: string): string | undefined {
  const name = value.trim().normalize("NFC");
  const length = Array.from(segmenter.segment(name)).length;
  if (name.length > 1024 || length < 3 || length > 30)
    return "Use 3–30 characters for your username.";
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(name))
    return "Usernames can’t contain line breaks or control characters.";
  return undefined;
}
