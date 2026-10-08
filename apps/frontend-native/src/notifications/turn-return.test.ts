import { expect, it } from "vite-plus/test";
import { notificationRoom, notificationTicket } from "./turn-return";

it("accepts only bounded opaque tickets, never arbitrary notification URLs", () => {
  expect(notificationTicket({ ticket: "a".repeat(50), url: "https://evil.test" })).toBe(
    "a".repeat(50),
  );
  for (const data of [
    null,
    {},
    { ticket: "//evil.test" },
    { ticket: "a".repeat(501) },
    { url: "bigtwocrew://room/ABCDE" },
  ])
    expect(notificationTicket(data)).toBeNull();
});

it("opens only verified room targets and provides recovery for wrong accounts and missing rooms", () => {
  expect(notificationRoom({ allowed: true, target: "/room/ABCDE" })).toBe("ABCDE");
  expect(() => notificationRoom({ allowed: false, target: "/room/ABCDE" })).toThrow(
    "account that received",
  );
  expect(() => notificationRoom({ allowed: true, missing: true })).toThrow("no longer available");
  for (const target of [
    "https://evil.test/room/ABCDE",
    "//evil.test",
    "/room/ABCDE?admin=true",
    "/room/abcde",
    "/room/ABCDE/other",
  ])
    expect(() => notificationRoom({ allowed: true, target })).toThrow("verify");
});
