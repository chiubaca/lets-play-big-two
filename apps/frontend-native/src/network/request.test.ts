import { describe, expect, it, vi } from "vite-plus/test";
import { ApiError, apiUrl, authenticatedHeaders, createRequest } from "./request";

describe("native cookie requests", () => {
  it("attaches bridge cookies and the explicit trusted scheme, not bearer credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true }));
    const request = createRequest({
      baseURL: "https://api.example.com/",
      origin: "bigtwocrew://",
      getCookie: () => "__Secure-better-auth.session_token=secret",
      fetcher,
    });
    await expect(
      request("/api/room/action/ABCDE", {
        method: "POST",
        json: { type: "START_GAME" },
        credentials: "include",
        headers: { Cookie: "stale-cookie" },
      }),
    ).resolves.toEqual({ success: true });
    const [url, options] = fetcher.mock.calls[0];
    const headers = new Headers(options?.headers);
    expect(url).toBe("https://api.example.com/api/room/action/ABCDE");
    expect(url).not.toContain("secret");
    expect(headers.get("Cookie")).toBe("__Secure-better-auth.session_token=secret");
    expect(headers.get("Origin")).toBe("bigtwocrew://");
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(options).toMatchObject({ credentials: "omit", redirect: "error", cache: "no-store" });
    if (typeof options?.body !== "string") throw new Error("Expected a serialized JSON body");
    expect(JSON.parse(options.body)).toEqual({ type: "START_GAME" });
  });

  it("reads fresh bridge cookies for every request and removes stale header cookies on sign-out", async () => {
    const getCookie = vi.fn().mockReturnValueOnce("session=one").mockReturnValueOnce("");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ rooms: [] }));
    const request = createRequest({
      baseURL: "http://192.168.1.10:8788",
      origin: "bigtwocrew://",
      getCookie,
      fetcher,
    });
    await request("/api/rooms");
    fetcher.mockResolvedValueOnce(Response.json({ rooms: [] }));
    await request("/api/rooms", { headers: { cookie: "old=secret" } });
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("Cookie")).toBe("session=one");
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get("Cookie")).toBeNull();
  });

  it("preserves authenticated backend errors, including ordinary 404 responses", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: "Cannot act as another player" }, { status: 403 }),
      )
      .mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
      .mockResolvedValueOnce(new Response("not JSON", { status: 200 }));
    const request = createRequest({
      baseURL: "https://api.example.com",
      origin: "bigtwocrew://",
      getCookie: () => "",
      fetcher,
    });
    await expect(request("/api/room/action/ABCDE")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      message: "Cannot act as another player",
    });
    await expect(request("/api/room/ABCDE")).rejects.toMatchObject({
      status: 404,
      message: "This room could not be found.",
    });
    await expect(request("/api/rooms")).rejects.toBeInstanceOf(ApiError);
  });

  it("does not leak cookies to absolute, scheme-relative, traversal or backslash URLs", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const getCookie = vi.fn(() => "secret");
    const request = createRequest({
      baseURL: "https://api.example.com",
      origin: "bigtwocrew://",
      getCookie,
      fetcher,
    });
    for (const path of [
      "https://evil.example/api/rooms",
      "//evil.example/api/rooms",
      "/api/../../rooms",
      "/api/\\evil",
    ]) {
      await expect(request(path)).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(getCookie).not.toHaveBeenCalled();
    expect(apiUrl("https://api.example.com", "/api/room/AB%2FCD")).toBe(
      "https://api.example.com/api/room/AB%2FCD",
    );
    expect(authenticatedHeaders("", "bigtwocrew://").get("Cookie")).toBeNull();
  });
});
