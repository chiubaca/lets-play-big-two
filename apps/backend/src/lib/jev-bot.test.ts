import type { Card } from "@big-two/game-state-machine";
import { describe, expect, it } from "vite-plus/test";

import { chooseJevBotMove, chooseJevBotMoveWithFallback, type JevAiBinding } from "./jev-bot";

const card = (value: Card["value"], suit: Card["suit"]): Card => ({ value, suit });

describe("chooseJevBotMove", () => {
  it("asks Jev to select from legal moves using its hand and the played deck", async () => {
    let model: string | undefined;
    let input: unknown;
    const ai: JevAiBinding = {
      async run(requestedModel, requestedInput) {
        model = requestedModel;
        input = requestedInput;
        return {
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
        };
      },
    };

    const decision = await chooseJevBotMove(
      {
        hand: [card("3", "DIAMOND"), card("4", "HEART")],
        playedHands: [[card("3", "CLUB")]],
        roundMode: "single",
        opponentHandSizes: [1, 5, 8],
      },
      { ai },
    );

    expect(model).toBe("typesafe/jev");
    expect(input).toMatchObject({
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
    let aiCalled = false;
    const ai: JevAiBinding = {
      async run() {
        aiCalled = true;
        throw new Error("AI binding should not be called");
      },
    };

    const decision = await chooseJevBotMove(
      {
        hand: [card("3", "DIAMOND")],
        playedHands: [[card("2", "SPADE")]],
        roundMode: "single",
      },
      { ai },
    );

    expect(aiCalled).toBe(false);
    expect(decision).toEqual({ cards: null, source: "forced" });
  });

  it("falls back to the deterministic bot when Jev is unavailable", async () => {
    const ai: JevAiBinding = {
      async run() {
        throw new Error("AI binding unavailable");
      },
    };

    const decision = await chooseJevBotMoveWithFallback(
      {
        hand: [card("5", "HEART"), card("4", "SPADE")],
        playedHands: [[card("4", "HEART")]],
        roundMode: "single",
      },
      { ai },
    );

    expect(decision).toEqual({ cards: [card("4", "SPADE")], source: "fallback" });
  });
});
