import { expect, test } from "vite-plus/test";
import { createRoomCode } from "./room-code";

test("new room codes contain exactly five uppercase letters", () => {
  for (let i = 0; i < 100; i++) {
    expect(createRoomCode()).toMatch(/^[A-Z]{5}$/);
  }
});
