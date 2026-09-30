import { expect, it } from "vite-plus/test";
import { profileEmoji } from "./profile-emoji";

it.each(["♠️", "😎", "🃏", "👨🏻‍✈️", "❤️", "🐲"])("accepts one emoji: %s", (emoji) => {
  expect(profileEmoji.safeParse(emoji).success).toBe(true);
});

it.each(["", "hello", "😎😀", "a😎", "😎 ", "<script>", "x".repeat(33)])(
  "rejects invalid profile emojis: %s",
  (emoji) => {
    expect(profileEmoji.safeParse(emoji).success).toBe(false);
  },
);
