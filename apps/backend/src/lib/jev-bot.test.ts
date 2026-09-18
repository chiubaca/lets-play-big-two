import type { Card } from "@big-two/game-state-machine";
import type { Fetch } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vite-plus/test";

import { chooseJevBotMove, chooseJevBotMoveWithFallback } from "./jev-bot";

const card = (value: Card["value"], suit: Card["suit"]): Card => ({ value, suit });

describe("chooseJevBotMove", () => {
  it("asks Jev to select from legal moves using its hand and the played deck", async () => {
    let requestBody: unknown;
    const fetch: Fetch = async (_input, init) => {
      if (typeof init?.body !== "string") throw new Error("Expected a JSON request body");
      requestBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          model: "jev-1.13.0",
          answers: {
            best_move: {
              type: "choice",
              choice: "play_1",
              confidence: 0.82,
              probabilities: { play_1: 0.9, pass: 0.1 },
            },
          },
          usage: { input_tokens: 200, output_tokens: 20 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const decision = await chooseJevBotMove(
      {
        hand: [card("3", "DIAMOND"), card("4", "HEART")],
        playedHands: [[card("3", "CLUB")]],
        roundMode: "single",
        opponentHandSizes: [1, 5, 8],
      },
      { apiKey: "test-key", fetch },
    );

    expect(requestBody).toMatchObject({
      model: "jev-latest",
      state: {
        turn: {
          own_hand: ["3 of diamonds", "4 of hearts"],
          played_hands: [["3 of clubs"]],
          opponent_hand_sizes: [1, 5, 8],
        },
      },
      questions: {
        best_move: {
          type: "choice",
          criteria: {
            play_1: expect.stringContaining("4 of hearts"),
            pass: expect.any(String),
          },
        },
      },
    });
    expect(decision).toEqual({
      cards: [card("4", "HEART")],
      confidence: 0.82,
      model: "jev-1.13.0",
      source: "jev",
    });
  });

  it("returns a forced pass without calling Jev when no play can win the trick", async () => {
    let fetchCalled = false;
    const fetch: Fetch = async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    };

    const decision = await chooseJevBotMove(
      {
        hand: [card("3", "DIAMOND")],
        playedHands: [[card("2", "SPADE")]],
        roundMode: "single",
      },
      { apiKey: "test-key", fetch },
    );

    expect(fetchCalled).toBe(false);
    expect(decision).toEqual({ cards: null, source: "forced" });
  });

  it("falls back to the deterministic bot when Jev is unavailable", async () => {
    const fetch: Fetch = async () => {
      throw new Error("network unavailable");
    };

    const decision = await chooseJevBotMoveWithFallback(
      {
        hand: [card("5", "HEART"), card("4", "SPADE")],
        playedHands: [[card("4", "HEART")]],
        roundMode: "single",
      },
      { apiKey: "test-key", fetch },
    );

    expect(decision).toEqual({ cards: [card("4", "SPADE")], source: "fallback" });
  });
});
