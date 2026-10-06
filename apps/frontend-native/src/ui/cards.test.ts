import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getCardKey, type Card } from "@big-two/game-core";
import { CardBacks, CardSuit, Hand, PlayingCard } from "./cards";

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("react-native-svg", () => ({
  default: "Svg",
  Circle: "Circle",
  Defs: "Defs",
  Pattern: "Pattern",
  Rect: "Rect",
  Path: "Path",
}));
vi.mock("./theme", () => ({ colors: { gold: "#f4ce78" }, fonts: { display: "Fraunces" } }));

let renderer: ReactTestRenderer;
const card: Card = { suit: "HEART", value: "Q" };
const hosts = (type: string) => renderer.root.findAll((node) => node.type === type);

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});

describe("native table cards", () => {
  it("renders both corners and a vector suit instead of Android emoji glyphs", async () => {
    await act(async () => {
      renderer = create(createElement(PlayingCard, { card, width: 70 }));
    });
    expect(hosts("Text").map((node) => node.props.children)).toEqual(["Q", "Q"]);
    expect(renderer.root.findAllByType(CardSuit)).toHaveLength(3);
    expect(hosts("Path").every((node) => node.props.fill === "#d50918")).toBe(true);
    expect(hosts("Pressable")[0]!.props.accessibilityLabel).toBe("queen of hearts");
  });

  it("preserves selection and the card's full press target", async () => {
    const onPress = vi.fn();
    await act(async () => {
      renderer = create(createElement(PlayingCard, { card, selected: true, onPress }));
    });
    const pressable = hosts("Pressable")[0]!;
    expect(pressable.props.accessibilityState).toEqual({ selected: true });
    expect(pressable.props.accessibilityRole).toBe("button");
    expect(pressable.props.disabled).toBe(false);
    pressable.props.onPress();
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("does not enable cards while the hand is disabled", async () => {
    const onToggle = vi.fn();
    await act(async () => {
      renderer = create(
        createElement(Hand, {
          cards: [card],
          selected: [getCardKey(card)],
          onToggle,
          width: 390,
          disabled: true,
        }),
      );
    });
    const pressable = hosts("Pressable")[0]!;
    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.onPress).toBeUndefined();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("caps opponent backs at ten and gives every checker pattern a unique ID", async () => {
    await act(async () => {
      renderer = create(createElement(CardBacks, { count: 13 }));
    });
    expect(hosts("Svg")).toHaveLength(10);
    const ids = hosts("Pattern").map((node) => node.props.id);
    expect(new Set(ids).size).toBe(10);
    expect(hosts("View")[0]!.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("does not reserve a phantom row after an opponent has no cards", async () => {
    await act(async () => {
      renderer = create(createElement(CardBacks, { count: 0 }));
    });
    expect(renderer.toJSON()).toBeNull();
  });
});
