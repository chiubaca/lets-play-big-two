import { z } from "zod";

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

export const profileEmoji = z
  .string()
  .max(32)
  .refine(
    (value) =>
      Array.from(segmenter.segment(value)).length === 1 && /\p{Extended_Pictographic}/u.test(value),
    "Choose a single emoji for your profile.",
  );
