import { createElement, type ReactElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Button, ErrorMessage, Field, Label, Sheet } from "./primitives";

const device = vi.hoisted(() => ({ OS: "android", width: 393, height: 852, fontScale: 1 }));
const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style ?? {}) as Record<string, unknown>);

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Image: "Image",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  Platform: device,
  StyleSheet: {
    create: (styles: unknown) => styles,
    flatten: (style: unknown) => flatten(style),
    absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  },
  useWindowDimensions: () => device,
}));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
// The theme loads native image assets with require, which Node cannot decode.
vi.mock("./theme", () => ({
  artwork: {},
  colors: { panel: "#071b10", gold: "#f4ce78", goldDark: "#a5681f", cream: "#f9e8b9" },
  fonts: { body: "Inter", display: "Fraunces", mono: "IBMPlexMono" },
}));

let renderer: ReactTestRenderer;
const hosts = (type: string) => renderer.root.findAll((node) => node.type === type);
const ancestors = (node: ReactTestInstance, until?: ReactTestInstance) => {
  const result: ReactTestInstance[] = [];
  for (let parent = node.parent; parent && parent !== until; parent = parent.parent) {
    result.push(parent);
  }
  return result;
};
const render = async (element: ReactElement) => {
  await act(async () => {
    renderer = create(element);
  });
};
const update = async (element: ReactElement) => {
  await act(async () => renderer.update(element));
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(device, { OS: "android", width: 393, height: 852, fontScale: 1 });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});

describe("native busy button", () => {
  it.each(["label", "icon"])("retains the %s's intrinsic geometry while loading", async (kind) => {
    const props = {
      title: "Create a multiplayer room",
      onPress: vi.fn(),
      style: { alignSelf: "flex-start" as const },
      labelStyle: { fontSize: 26, lineHeight: 38 },
      icon:
        kind === "icon"
          ? createElement("TestIcon", { style: { width: 64, height: 56 } })
          : undefined,
    };
    await render(createElement(Button, props));
    const original = hosts(kind === "icon" ? "TestIcon" : "Text")[0]!;
    const originalStyle = flatten(original.props.style);
    const button = hosts("Pressable")[0]!;
    const originalFrame = flatten(button.props.style({ pressed: false }));

    await update(createElement(Button, { ...props, busy: true }));
    expect(hosts(kind === "icon" ? "TestIcon" : "Text")[0]).toBe(original);
    expect(flatten(original.props.style)).toEqual(originalStyle);
    expect(flatten(button.props.style({ pressed: false }))).toEqual({
      ...originalFrame,
      opacity: 0.45,
    });
    const contentParents = ancestors(original, button);
    expect(contentParents.some((node) => flatten(node.props.style).opacity === 0)).toBe(true);
    for (const node of [original, ...contentParents]) {
      expect(flatten(node.props.style).position).not.toBe("absolute");
      expect(flatten(node.props.style).display).not.toBe("none");
    }
    const spinner = hosts("ActivityIndicator")[0]!;
    expect(
      ancestors(spinner, button).some((node) => flatten(node.props.style).position === "absolute"),
    ).toBe(true);
    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(button.props.accessibilityLabel).toBe(props.title);
    expect(hosts("Pressable")).toHaveLength(1);
    expect(
      contentParents.some((node) => node.props.importantForAccessibility === "no-hide-descendants"),
    ).toBe(true);
    expect(
      ancestors(spinner, button).some((node) => node.props.accessibilityElementsHidden === true),
    ).toBe(true);

    await update(createElement(Button, props));
    expect(hosts(kind === "icon" ? "TestIcon" : "Text")[0]).toBe(original);
    expect(
      ancestors(original, button).some((node) => flatten(node.props.style).opacity === 0),
    ).toBe(false);
    expect(hosts("ActivityIndicator")).toHaveLength(0);
    expect(button.props.disabled).toBe(false);
  });
});

describe("native menu sheet", () => {
  it.each(["android", "ios"])("uses only one keyboard avoidance mechanism on %s", async (OS) => {
    device.OS = OS;
    await render(
      createElement(Sheet, {
        title: "Members’ table",
        visible: true,
        onClose: vi.fn(),
        children: createElement(Field, { placeholder: "Email address" }),
      }),
    );
    const keyboard = hosts("KeyboardAvoidingView")[0]!;
    // Android's native modal resizes for the IME; do not subtract its height again.
    expect(keyboard.props.enabled).toBe(OS === "ios");
    expect(keyboard.props.behavior).toBe(OS === "ios" ? "padding" : undefined);
    expect(hosts("ScrollView")[0]!.props.automaticallyAdjustKeyboardInsets).toBe(false);
    expect(hosts("TextInput")).toHaveLength(1);
  });

  it.each([
    [320, 568, 1],
    [393, 852, 1],
    [852, 393, 1],
    [320, 568, 2],
  ])(
    "keeps a bounded frame and pinned header across menu states at %i × %i, font scale %i",
    async (width, height, fontScale) => {
      Object.assign(device, { width, height, fontScale });
      const onClose = vi.fn();
      const sheet = (children: ReactElement[]) =>
        createElement(Sheet, {
          title: "Table menu",
          visible: true,
          onClose,
          children,
        });
      const action = (busy = false) =>
        createElement(Button, {
          key: "action",
          title: "Leave table",
          busy,
          onPress: vi.fn(),
        });
      await render(sheet([action()]));
      const safe = hosts("SafeAreaView")[0]!;
      const panel = hosts("LinearGradient")[0]!;
      const scroll = hosts("ScrollView")[0]!;
      const heading = hosts("Text").find((node) => node.props.children === "Table menu")!;
      const header = ancestors(heading).find((node) => String(node.type) === "View")!;
      const frame = flatten(safe.props.style);

      // Percentage sizing follows the available modal viewport (including native resize),
      // rather than either a short menu or a long validation/confirmation message.
      expect(frame.width).toBe("100%");
      expect(Number(frame.maxWidth)).toBeGreaterThan(0);
      expect(typeof frame.height).toBe("string");
      expect(String(frame.height)).toMatch(/^\d+(\.\d+)?%$/);
      expect(parseFloat(String(frame.height))).toBeGreaterThan(0);
      expect(parseFloat(String(frame.height))).toBeLessThanOrEqual(100);
      expect(Number(frame.maxHeight)).toBeGreaterThan(0);
      expect(flatten(panel.props.style).flex).toBe(1);
      expect(flatten(header.props.style).flexShrink).toBe(0);
      expect(ancestors(header)).not.toContain(scroll);
      expect(flatten(scroll.props.style)).toMatchObject({ flex: 1, minHeight: 0 });
      expect(scroll.props.scrollEnabled).not.toBe(false);
      expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
      expect(heading.props.numberOfLines).toBeUndefined();
      const close = hosts("Pressable").find(
        (node) => node.props.accessibilityLabel === "Close Table menu",
      )!;
      expect(flatten(close.props.style({ pressed: false })).flexShrink).toBe(0);
      expect(flatten(close.props.style({ pressed: false })).minHeight).toBeGreaterThanOrEqual(44);

      const layoutBefore = [safe, panel, header, scroll].map((node) => flatten(node.props.style));
      for (const children of [
        [action(true)],
        [
          action(),
          createElement(ErrorMessage, { key: "error", message: "Unable to leave. Try again." }),
        ],
        Array.from({ length: 24 }, (_, index) =>
          createElement(Label, { key: index, children: `Confirmation detail ${index}` }),
        ),
        [action()],
      ]) {
        await update(sheet(children));
        expect([safe, panel, header, scroll].map((node) => flatten(node.props.style))).toEqual(
          layoutBefore,
        );
        expect(hosts("SafeAreaView")[0]).toBe(safe);
        expect(hosts("ScrollView")[0]).toBe(scroll);
      }
      close.props.onPress();
      expect(onClose).toHaveBeenCalledOnce();
      hosts("Modal")[0]!.props.onRequestClose();
      expect(onClose).toHaveBeenCalledTimes(2);
    },
  );
});
