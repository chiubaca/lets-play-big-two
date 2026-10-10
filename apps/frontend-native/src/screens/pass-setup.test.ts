import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PassSetupScreen, type PassSetupScreenProps } from "./pass-setup";

const device = vi.hoisted(() => ({ width: 393, height: 852, fontScale: 1 }));
const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style ?? {}) as Record<string, unknown>);

vi.mock("react-native", () => {
  class AnimationNode {
    interpolate() {
      return new AnimationNode();
    }
  }
  return {
    ActivityIndicator: "ActivityIndicator",
    Image: "Image",
    KeyboardAvoidingView: "KeyboardAvoidingView",
    Modal: "Modal",
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    Text: "Text",
    TextInput: "TextInput",
    View: "View",
    Platform: { OS: "android" },
    StyleSheet: {
      create: (styles: unknown) => styles,
      flatten: (style: unknown) => flatten(style),
      absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
    },
    useWindowDimensions: () => device,
    Animated: {
      Value: AnimationNode,
      View: "AnimatedView",
      ScrollView: "ScrollView",
      add: () => new AnimationNode(),
      subtract: () => new AnimationNode(),
      multiply: () => new AnimationNode(),
      divide: () => new AnimationNode(),
      event: (_mapping: unknown, options: unknown) => Object.assign(vi.fn(), { options }),
    },
  };
});
vi.mock("../ui/brand", () => ({ Brand: "Brand" }));
vi.mock("../ui/use-reduced-motion", () => ({ useReducedMotion: () => false }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("lucide-react-native", () => ({ Bot: "Bot", UserRound: "UserRound" }));
vi.mock("../ui/theme", () => ({
  artwork: { pass: "pass-title", portrait: "portrait-background" },
  colors: { panel: "#071b10", gold: "#f4ce78", cream: "#f9e8b9", muted: "#aaa" },
  fonts: { body: "Inter", strong: "InterSemiBold", display: "Fraunces" },
}));

let renderer: ReactTestRenderer;
let props: PassSetupScreenProps;
const hosts = (type: string) => renderer.root.findAll((node) => node.type === type);
const button = (label: string) =>
  hosts("Pressable").find((node) => node.props.accessibilityLabel === label)!;
const field = (seat: number) =>
  hosts("TextInput").find((node) => node.props.accessibilityLabel === `Player ${seat} name`)!;
const ancestors = (node: ReactTestInstance) => {
  const result: ReactTestInstance[] = [];
  for (let parent = node.parent; parent; parent = parent.parent) result.push(parent);
  return result;
};
const mount = async (overrides: Partial<PassSetupScreenProps> = {}) => {
  props = { onHome: vi.fn(), onStart: vi.fn(), ...overrides };
  await act(async () => {
    renderer = create(createElement(PassSetupScreen, props));
  });
};
const update = async (overrides: Partial<PassSetupScreenProps>) => {
  props = { ...props, ...overrides };
  await act(async () => renderer.update(createElement(PassSetupScreen, props)));
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(device, { width: 393, height: 852, fontScale: 1 });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});

describe("pass-and-play setup transitions", () => {
  it("keeps Home outside the parallax scroll view with pass-and-play artwork", async () => {
    await mount();
    const scroll = hosts("ScrollView")[0]!;
    expect(scroll.props.onScroll.options).toEqual({ useNativeDriver: true });
    const nav = renderer.root.findByProps({ testID: "home-nav-overlay" });
    expect(ancestors(button("‹ Home"))).not.toContain(scroll);
    expect(nav.findAll((node) => node === button("‹ Home"))).toHaveLength(1);
    expect(flatten(nav.props.style).zIndex).toBeGreaterThan(1);
    await act(async () => button("‹ Home").props.onPress());
    expect(props.onHome).toHaveBeenCalledOnce();
    expect(renderer.root.findAllByProps({ accessibilityLabel: "Pass and Play" })).toHaveLength(1);
    const titleLayers = hosts("Image").filter((node) => node.props.source === "pass-title");
    expect(titleLayers.map((node) => node.props.blurRadius)).toEqual([0, 6, 12]);
    expect(titleLayers.every((node) => node.props.accessible === false)).toBe(true);
    expect(titleLayers[0]!.props.style.width).toBe(361);
    expect(
      hosts("Image").filter((node) => node.props.source === "portrait-background"),
    ).toHaveLength(3);
  });

  it("reserves Resume before the saved game arrives without inserting ahead of Start", async () => {
    await mount();
    const start = button("Start game →");
    const resume = button("Resume saved game");
    expect(resume).toBeDefined();
    expect(resume.props.accessibilityState.disabled).toBe(true);
    const siblings = start.parent!.parent!.children;
    const onResume = vi.fn();
    await update({ onResume });
    expect(button("Start game →")).toBe(start);
    expect(button("Resume saved game")).toBe(resume);
    expect(start.parent!.parent!.children).toEqual(siblings);
    expect(resume.props.accessibilityState.disabled).toBe(false);
    await act(async () => resume.props.onPress());
    expect(onResume).toHaveBeenCalledOnce();
    await update({ onResume: undefined });
    expect(button("Resume saved game")).toBe(resume);
    expect(resume.props.accessibilityState.disabled).toBe(true);
  });

  it.each([
    [320, 568, 1],
    [393, 852, 1],
    [320, 568, 2],
  ])(
    "keeps the name allocation when a Human becomes a Bot at %i × %i, font scale %i",
    async (width, height, fontScale) => {
      Object.assign(device, { width, height, fontScale });
      await mount();
      const name = field(2);
      const before = [name, ...ancestors(name)].map((node) => flatten(node.props.style));
      await act(async () => name.props.onChangeText("Alex"));
      await act(async () => button("Choose player 2 type, currently human").props.onPress());
      await act(async () => button("Bot").props.onPress());
      expect(field(2)).toBe(name);
      expect(name.props.editable).toBe(false);
      expect(name.props.value).toBe("AI 2");
      expect([name, ...ancestors(name)].map((node) => flatten(node.props.style))).toEqual(before);
      await act(async () => button("Choose player 2 type, currently bot").props.onPress());
      await act(async () => button("Human").props.onPress());
      expect(field(2)).toBe(name);
      expect(name.props.editable).toBe(true);
      expect(name.props.value).toBe("Alex");
    },
  );

  it("keeps validation text allocated so errors do not move the hint or Start", async () => {
    await mount();
    const hint = hosts("Text").find((node) =>
      String(node.props.children).startsWith("Cards stay hidden"),
    )!;
    const start = button("Start game →");
    const initialText = hosts("Text");
    const duplicate = initialText.find(
      (node) => node.props.children === "Use a different name for each player.",
    );
    const missing = initialText.find(
      (node) => node.props.children === "Enter a name for each human player.",
    );
    expect(duplicate).toBeDefined();
    expect(missing).toBeDefined();
    for (const [name, notice] of [
      ["", missing!],
      ["You", duplicate!],
      ["Alex", null],
    ] as const) {
      await act(async () => field(2).props.onChangeText(name));
      expect(hosts("Text")).toEqual(initialText);
      expect(hosts("Text").find((node) => node.props.children === hint.props.children)).toBe(hint);
      expect(button("Start game →")).toBe(start);
      expect(start.props.disabled).toBe(notice !== null);
      for (const error of [duplicate!, missing!]) {
        expect(flatten(error.props.style).opacity).toBe(error === notice ? 1 : 0);
        expect(flatten(error.props.style).position).not.toBe("absolute");
        expect(flatten(error.props.style).display).not.toBe("none");
        expect(error.props.accessibilityElementsHidden).toBe(error !== notice);
        expect(error.props.accessibilityLiveRegion).toBe(error === notice ? "polite" : "none");
      }
    }
  });

  it("waits for saved configuration before mounting the editor and never overwrites edits", async () => {
    await mount({ loading: true });
    expect(hosts("TextInput")).toHaveLength(0);
    expect(button("Start game →")).toBeUndefined();
    expect(button("‹ Home")).toBeDefined();
    await update({
      loading: false,
      initialConfig: {
        players: [
          { name: "Saved host", isBot: false },
          { name: "AI 2", isBot: true },
        ],
      },
    });
    expect(hosts("TextInput")).toHaveLength(2);
    expect(field(1).props.value).toBe("Saved host");
    expect(field(2).props.editable).toBe(false);
    const name = field(1);
    await act(async () => name.props.onChangeText("Edited host"));
    await update({
      initialConfig: {
        players: [
          { name: "Late config", isBot: false },
          { name: "Other", isBot: false },
        ],
      },
    });
    expect(field(1)).toBe(name);
    expect(name.props.value).toBe("Edited host");
    expect(field(2).props.editable).toBe(false);
    await act(async () => button("Start game →").props.onPress());
    expect(props.onStart).toHaveBeenCalledWith({
      players: [
        { name: "Edited host", isBot: false },
        { name: "AI 2", isBot: true },
      ],
    });
  });

  it.each([
    [320, 568, 1],
    [393, 852, 2],
  ])(
    "allows seats to grow and scroll instead of squeezing names at %i × %i, font scale %i",
    async (width, height, fontScale) => {
      Object.assign(device, { width, height, fontScale });
      await mount();
      const type = button("Choose player 2 type, currently human");
      const seat = ancestors(field(2)).find(
        (node) =>
          String(node.type) === "View" && node.findAll((child) => child === type).length > 0,
      )!;
      expect(flatten(seat.props.style).flexDirection).toBe("column");
      expect(hosts("ScrollView")[0]!.props.scrollEnabled).not.toBe(false);
      expect(hosts("ScrollView")[0]!.props.keyboardShouldPersistTaps).toBe("handled");
      expect(flatten(field(2).props.style).minHeight).toBeGreaterThanOrEqual(44);
      for (const node of [field(2), ...ancestors(field(2))]) {
        expect(flatten(node.props.style).height).toBeUndefined();
        expect(flatten(node.props.style).maxHeight).toBeUndefined();
        expect(flatten(node.props.style).position).not.toBe("absolute");
      }
      for (const text of hosts("Text")) {
        expect(text.props.allowFontScaling).not.toBe(false);
        expect(text.props.numberOfLines).toBeUndefined();
      }
    },
  );
});
