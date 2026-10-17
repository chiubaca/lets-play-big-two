import { bigTwoGameMachine, type Card } from "@big-two/game-state-machine";
import type { JevMoveRequest } from "@big-two/game-ai";
import { describe, expect, it, vi } from "vite-plus/test";
import { createRequest } from "../network/request";
import { createJevBotClient, getJevMoveRequest } from "./jev-bot-client";

const three: Card = { suit: "DIAMOND", value: "3" };
const four: Card = { suit: "HEART", value: "4" };
const five: Card = { suit: "SPADE", value: "5" };
const opening: JevMoveRequest = {
  hand: [three, four, five],
  playedHands: [],
  roundMode: null,
  requiredCard: three,
};

function client(response: unknown) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
  const request = createRequest({
    baseURL: "https://api.example.com",
    origin: "bigtwocrew://",
    getCookie: () => "",
    fetcher,
  });
  return { fetcher, move: createJevBotClient(request) };
}

describe("native Jev client", () => {
  it("posts to the backend without requiring a session and forwards cancellation", async () => {
    const { fetcher, move } = client({ cards: [three], source: "jev" });
    const controller = new AbortController();
    await expect(move(opening, controller.signal)).resolves.toEqual({
      cards: [three],
      source: "jev",
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.example.com/api/bot/jev/move");
    expect(options).toMatchObject({ method: "POST", signal: controller.signal });
    expect(new Headers(options?.headers).get("Cookie")).toBeNull();
    expect(JSON.parse(options!.body as string)).toEqual(opening);
  });

  it("sends only the acting hand, played cards and public opponent counts", () => {
    const snapshot = bigTwoGameMachine.resolveState({
      value: "NEXT_PLAYER_TURN",
      context: {
        players: [
          { id: "human", name: "Alex", hand: [five] },
          { id: "bot", name: "Bot", hand: [four] },
        ],
        currentPlayerIndex: 1,
        roundMode: "single",
        cardPile: [[three]],
        consecutivePasses: 0,
      },
    });
    const request = getJevMoveRequest(snapshot, "bot");
    expect(request).toEqual({
      hand: [four],
      playedHands: [[three]],
      roundMode: "single",
      opponentHandSizes: [1],
    });
    expect(JSON.stringify(request)).not.toContain(JSON.stringify(five));
    expect(() => getJevMoveRequest(snapshot, "human")).toThrow();
    expect(
      getJevMoveRequest(
        bigTwoGameMachine.resolveState({ value: "PLAY_NEW_ROUND", context: snapshot.context }),
        "bot",
      ).roundMode,
    ).toBeNull();
  });

  it.each([
    null,
    {},
    { cards: [three], source: "unknown" },
    { cards: [three] },
    { cards: [], source: "jev" },
    { cards: null, source: "jev" },
    { cards: [five], source: "jev" },
    { cards: [three, three], source: "jev" },
    { cards: [{ suit: "unknown", value: "3" }], source: "jev" },
  ])("rejects malformed or illegal opening responses: %j", async (response) => {
    await expect(client(response).move(opening, new AbortController().signal)).rejects.toThrow();
  });

  it("accepts a strategic pass or a stronger legal play instead of forcing the deterministic choice", async () => {
    const following: JevMoveRequest = {
      hand: [four, five],
      playedHands: [[three]],
      roundMode: "single",
    };
    await expect(
      client({ cards: null, source: "jev" }).move(following, new AbortController().signal),
    ).resolves.toEqual({ cards: null, source: "jev" });
    await expect(
      client({ cards: [five], source: "jev" }).move(following, new AbortController().signal),
    ).resolves.toEqual({ cards: [five], source: "jev" });
    await expect(
      client({ cards: [three], source: "jev" }).move(following, new AbortController().signal),
    ).rejects.toThrow("illegal");
  });

  it("preserves server and connection errors for deterministic fallback", async () => {
    const { fetcher, move } = client({ cards: [three] });
    fetcher.mockResolvedValueOnce(
      Response.json({ error: "Too many Jev move requests" }, { status: 429 }),
    );
    await expect(move(opening, new AbortController().signal)).rejects.toMatchObject({
      status: 429,
    });
    fetcher.mockRejectedValueOnce(new Error("offline"));
    await expect(move(opening, new AbortController().signal)).rejects.toThrow("offline");
  });

  it.each(["fallback", "forced"])(
    "preserves the backend's %s decision source without claiming Jev",
    async (source) => {
      await expect(
        client({ cards: [three], source }).move(opening, new AbortController().signal),
      ).resolves.toEqual({ cards: [three], source });
    },
  );
});
