import { expect, it } from "vite-plus/test";
import { validProfileUsername } from "./profile-username";

it.each([
  "大二高手",
  "カード王",
  "مرحبا",
  "Игрок",
  "José",
  "Card Sharp",
  "🦊🐲🍀",
  "♥♠♦",
  "👨‍👩‍👧‍👦".repeat(30),
  "e\u0301té",
])("accepts Unicode usernames: %s", (name) => {
  expect(validProfileUsername(name)).toBe(true);
});

it.each(["", "  ", "ab", "a".repeat(31), "🦊".repeat(31), "a\nb", "a\u0000b", "a\u2028b"])(
  "rejects invalid usernames: %s",
  (name) => {
    expect(validProfileUsername(name)).toBe(false);
  },
);
