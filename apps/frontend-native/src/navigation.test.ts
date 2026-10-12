import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { routeFromURL } from "./navigation";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("native room links", () => {
  it("accepts room links and normalizes codes", () => {
    expect(routeFromURL("bigtwocrew://room/abc123")).toEqual({ name: "room", roomId: "ABC123" });
    expect(routeFromURL("https://big-two.chiubaca.com/room/ABC123")).toEqual({
      name: "room",
      roomId: "ABC123",
    });
  });
  it("ignores OAuth callbacks, untrusted hosts, and invalid codes", () => {
    for (const url of [
      "bigtwocrew://?cookie=secret",
      "https://evil.test/room/ABC",
      "bigtwocrew://room/../../api",
      "https://big-two.chiubaca.com.evil.test/room/ABC",
      "bigtwocrew://room/TOOLONGCODE",
    ])
      expect(routeFromURL(url)).toBeNull();
  });
  it("uses only the development scheme in the development variant", async () => {
    vi.stubEnv("EXPO_PUBLIC_APP_VARIANT", "development");
    vi.resetModules();
    const { routeFromURL: developmentRoute } = await import("./navigation");
    expect(developmentRoute("bigtwocrew-dev://room/abc123")).toEqual({
      name: "room",
      roomId: "ABC123",
    });
    expect(developmentRoute("bigtwocrew://room/ABC123")).toBeNull();
  });
});
