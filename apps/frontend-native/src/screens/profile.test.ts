import { createElement, type ComponentProps } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { MembershipCard, ProfileScreen, ProfileView } from "./profile";
import { Sheet } from "../ui/primitives";
import { MembershipCardInspector } from "../ui/membership-card-inspector";
import { membershipInspectionScale } from "../ui/membership-card-motion";
import profileStories, {
  AccountDeletion,
  DeletionFailure,
  EditUsername,
  EmojiPicker,
  InspectMembershipCard,
  LongUsername,
  Member,
  MultilingualUsername,
  SaveFailure,
  SignedOut,
  SlowSave,
  UnbrokenUsername,
} from "../storybook/profile.stories";
import { NativeQueryProvider, createNativeQueryClient } from "../network/query-client";
import { useSession } from "../network/auth-client";
import { notifyManager, onlineManager, type QueryClient } from "@tanstack/react-query";

const network = vi.hoisted(() => ({ updateUser: vi.fn(), deleteUser: vi.fn() }));
const auth = vi.hoisted(() => ({
  isPending: false,
  data: { user: { id: "alex", name: "Alex", email: "alex@example.com" } },
}));
vi.mock("../network/auth-client", () => ({ useSession: vi.fn(() => auth) }));
vi.mock("storybook/actions", () => ({ action: () => vi.fn() }));
vi.mock("../ui/use-reduced-motion", () => ({ useReducedMotion: () => true }));
vi.mock("react-native-reanimated", async () => import("../test/reanimated"));
vi.mock("react-native-worklets", async () => import("../test/worklets"));
vi.mock("react-native-gesture-handler", async () => import("../test/gesture-handler"));
const device = vi.hoisted(() => ({ width: 320, height: 568, fontScale: 1 }));
const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style ?? {}) as Record<string, unknown>);
vi.mock("react-native", () => ({
  AccessibilityInfo: { setAccessibilityFocus: vi.fn() },
  findNodeHandle: () => null,
  Easing: { bezier: () => (value: number) => value },
  Animated: {
    View: "AnimatedView",
    Value: class {
      setValue() {}
      stopAnimation() {}
      interpolate({ outputRange }: { outputRange: unknown[] }) {
        return outputRange.at(-1);
      }
    },
    add: () => ({ interpolate: () => "0deg" }),
  },
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
    absoluteFill: {},
  },
  useWindowDimensions: () => device,
}));
vi.mock("../network", () => ({ authClient: network }));
vi.mock("../network/config", () => ({
  NATIVE_ORIGIN: "bigtwo://",
  BACKEND_URL: "https://api.example.com",
}));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("lucide-react-native", () => ({
  AtSign: "AtSign",
  KeyRound: "KeyRound",
  Mail: "Mail",
  ChevronDown: "ChevronDown",
  Pencil: "Pencil",
  X: "X",
}));
vi.mock("react-native-svg", () => ({
  default: "Svg",
  Path: "Path",
  Circle: "Circle",
  Defs: "Defs",
  Ellipse: "Ellipse",
  FeColorMatrix: "FeColorMatrix",
  Filter: "Filter",
  G: "G",
  Image: "SvgImage",
  Line: "Line",
  LinearGradient: "SvgLinearGradient",
  Mask: "Mask",
  Pattern: "Pattern",
  RadialGradient: "RadialGradient",
  Rect: "Rect",
  Stop: "Stop",
}));
vi.mock("../ui/theme", () => ({ colors: {}, fonts: {}, artwork: {}, membershipArtwork: {} }));

let renderer: ReactTestRenderer;
let client: QueryClient;
function profile(onHome = vi.fn()) {
  return createElement(NativeQueryProvider, {
    client,
    children: createElement(ProfileScreen, { session: auth.data, onHome }),
  });
}
const host = (type: string, label: string) =>
  renderer.root.findAll(
    (node) => node.type === type && node.props.accessibilityLabel === label,
  )[0]!;
const status = () =>
  renderer.root.findAll(
    (node) => String(node.type) === "View" && node.props.testID === "profile-editor-status",
  )[0]!;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.assign(device, { width: 320, height: 568, fontScale: 1 });
  auth.isPending = false;
  client = createNativeQueryClient();
  notifyManager.setScheduler(queueMicrotask);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  client.clear();
  onlineManager.setOnline(true);
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([
  ["name", 1],
  ["name", 2],
  ["emoji", 1],
  ["emoji", 2],
  ["delete", 1],
  ["delete", 2],
] as const)(
  "keeps %s editor actions allocated through errors and recovery at font scale %i",
  async (editor, fontScale) => {
    device.fontScale = fontScale;
    const onHome = vi.fn();
    await act(async () => {
      renderer = create(profile(onHome));
    });
    const open =
      editor === "name"
        ? "Edit username, currently Alex"
        : editor === "emoji"
          ? "Edit profile emoji"
          : "Account & data deletion";
    await act(async () => host("Pressable", open).props.onPress());
    const slot = status();
    const frame = flatten(slot.props.style);
    expect(frame).toMatchObject({ height: 40 * fontScale, flexShrink: 0 });
    const action = host("Pressable", editor === "delete" ? "Delete account" : "Save changes");
    const cancel = host("Pressable", "Cancel");
    const actions = action.parent!;
    const actionFrame = flatten(actions.props.style);
    if (editor === "name") {
      await act(async () => host("TextInput", "Username").props.onChangeText("a"));
      await act(async () => action.props.onPress());
      expect(network.updateUser).not.toHaveBeenCalled();
      expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toBe(
        "Use 3–30 characters for your username.",
      );
      expect(status()).toBe(slot);
      expect(flatten(slot.props.style)).toEqual(frame);
      await act(async () => host("TextInput", "Username").props.onChangeText("Cardsharp"));
    } else if (editor === "emoji") {
      await act(async () => host("Pressable", "Choose 🏆").props.onPress());
    } else {
      await act(async () =>
        host("TextInput", "Type DELETE to confirm account deletion").props.onChangeText("DELETE"),
      );
    }
    const request = editor === "delete" ? network.deleteUser : network.updateUser;
    let resolve!: (result: unknown) => void;
    request.mockImplementation(() => new Promise((done) => (resolve = done)));
    await act(async () => action.props.onPress());
    expect(action.props.accessibilityState.busy).toBe(true);
    expect(cancel.props.disabled).toBe(true);
    const longError = "Could not update your account. Try again. ".repeat(30);
    await act(async () => resolve({ error: { message: longError } }));
    const alert = renderer.root.findByProps({ accessibilityRole: "alert" });
    expect(alert.props.children).toBe(longError);
    expect(alert.props.numberOfLines).toBeUndefined();
    expect(
      slot.findAll((node) => String(node.type) === "ScrollView")[0]!.props.nestedScrollEnabled,
    ).toBe(true);
    expect(status()).toBe(slot);
    expect(flatten(slot.props.style)).toEqual(frame);
    expect(flatten(actions.props.style)).toEqual(actionFrame);
    expect(host("Pressable", "Cancel")).toBe(cancel);
    expect(cancel.props.disabled).toBe(false);
    expect(onHome).not.toHaveBeenCalled();
    request.mockResolvedValue({});
    await act(async () => action.props.onPress());
    expect(renderer.root.findAllByProps({ accessibilityRole: "alert" })).toHaveLength(0);
    expect(status()).toBe(slot);
    expect(flatten(slot.props.style)).toEqual(frame);
  },
);

it("does not move account controls when a profile save succeeds or a new editor clears the notice", async () => {
  device.fontScale = 2;
  await act(async () => {
    renderer = create(profile());
  });
  const notice = renderer.root.findAll(
    (node) => String(node.type) === "View" && node.props.testID === "profile-notice",
  )[0]!;
  expect(notice).toBeDefined();
  expect(flatten(notice.props.style)).toMatchObject({ width: "100%", height: 80, flexShrink: 0 });
  const content = notice.parent!.parent!;
  const order = content.children.slice();
  const deletion = host("Pressable", "Account & data deletion");
  await act(async () => host("Pressable", "Edit profile emoji").props.onPress());
  await act(async () => host("Pressable", "Choose 🏆").props.onPress());
  network.updateUser.mockResolvedValue({});
  await act(async () => host("Pressable", "Save changes").props.onPress());
  const text = notice.findAll((node) => String(node.type) === "Text")[0]!;
  expect(text.props.children).toBe("Profile updated!");
  expect(text.props.accessibilityLiveRegion).toBe("polite");
  expect(content.children).toEqual(order);
  expect(host("Pressable", "Account & data deletion")).toBe(deletion);
  await act(async () => host("Pressable", "Edit profile emoji").props.onPress());
  expect(notice.findAll((node) => String(node.type) === "Text")).toHaveLength(0);
  expect(content.children).toEqual(order);
});

it("keeps profile edits unsaved and does not replay them when submitted offline", async () => {
  await act(async () => {
    renderer = create(profile());
  });
  await act(async () => host("Pressable", "Edit profile emoji").props.onPress());
  await act(async () => host("Pressable", "Choose 🏆").props.onPress());
  onlineManager.setOnline(false);
  await act(async () => host("Pressable", "Save changes").props.onPress());
  expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toContain(
    "offline",
  );
  await act(async () => {
    onlineManager.setOnline(true);
  });
  expect(network.updateUser).not.toHaveBeenCalled();
  expect(host("Pressable", "Save changes").props.disabled).toBe(false);
});

it("blocks account deletion during session confirmation even with DELETE entered", async () => {
  const onHome = vi.fn();
  await act(async () => {
    renderer = create(profile(onHome));
  });
  await act(async () => host("Pressable", "Account & data deletion").props.onPress());
  await act(async () =>
    host("TextInput", "Type DELETE to confirm account deletion").props.onChangeText("DELETE"),
  );
  auth.isPending = true;
  await act(async () => {
    renderer.update(profile(onHome));
  });
  await act(async () => host("Pressable", "Delete account").props.onPress());
  expect(network.deleteUser).not.toHaveBeenCalled();
  expect(onHome).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toContain(
    "confirmed",
  );
});

it("does not navigate a later screen when account deletion completes after leaving the profile", async () => {
  const onHome = vi.fn();
  let confirm!: (result: unknown) => void;
  network.deleteUser.mockImplementation(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      }),
  );
  await act(async () => {
    renderer = create(profile(onHome));
  });
  await act(async () => host("Pressable", "Account & data deletion").props.onPress());
  await act(async () =>
    host("TextInput", "Type DELETE to confirm account deletion").props.onChangeText("DELETE"),
  );
  await act(async () => host("Pressable", "Delete account").props.onPress());
  await act(async () => renderer.unmount());
  await act(async () => confirm({}));
  expect(onHome).not.toHaveBeenCalled();
});

const preview = (args: Partial<ComponentProps<typeof profileStories.component>> = {}) =>
  createElement(profileStories.component, { ...profileStories.args, ...args });

it.each([
  Member,
  EditUsername,
  EmojiPicker,
  InspectMembershipCard,
  LongUsername,
  UnbrokenUsername,
  MultilingualUsername,
  SlowSave,
  SaveFailure,
  AccountDeletion,
  DeletionFailure,
  SignedOut,
])("renders the profile Storybook fixture without reading a real session", async (story) => {
  await act(async () => {
    renderer = create(preview(story.args));
  });
  const props = renderer.root.findByType(ProfileView).props;
  expect(props.session?.user.id ?? null).toBe(
    story.args?.signedIn === false ? null : "storybook-member",
  );
  expect(useSession).not.toHaveBeenCalled();
  expect(network.updateUser).not.toHaveBeenCalled();
  expect(network.deleteUser).not.toHaveBeenCalled();
});

it("saves Storybook profile edits locally and clears drafts when Controls change", async () => {
  vi.useFakeTimers();
  const onSave = vi.fn();
  await act(async () => {
    renderer = create(preview({ editor: "name", delayMs: 400, onSave }));
  });
  await act(async () => host("TextInput", "Username").props.onChangeText("River"));
  await act(async () => host("Pressable", "Save changes").props.onPress());
  expect(host("Pressable", "Save changes").props.accessibilityState.busy).toBe(true);
  expect(host("Pressable", "Cancel").props.disabled).toBe(true);
  expect(onSave).toHaveBeenCalledWith({ name: "River", username: "River", emoji: "🦊" });
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(renderer.root.findAllByType(MembershipCard)[0]!.props.name).toBe("River");
  expect(renderer.root.findAllByType(Sheet)[0]!.props.visible).toBe(false);
  expect(
    renderer.root
      .findByProps({ testID: "profile-notice" })
      .findAll((node) => String(node.type) === "Text")[0]!.props.children,
  ).toBe("Profile updated!");
  await act(async () => {
    renderer.update(preview({ username: "Mei", editor: "emoji", onSave }));
  });
  expect(renderer.root.findAllByType(MembershipCard)[0]!.props.name).toBe("Mei");
  expect(renderer.root.findAllByType(Sheet)[0]!.props.title).toBe("Choose your emoji");
  expect(network.updateUser).not.toHaveBeenCalled();
  expect(useSession).not.toHaveBeenCalled();
});

it("keeps the Storybook username draft after a simulated save failure", async () => {
  vi.useFakeTimers();
  await act(async () => {
    renderer = create(preview({ ...SaveFailure.args, delayMs: 0 }));
  });
  await act(async () => host("TextInput", "Username").props.onChangeText("River"));
  await act(async () => host("Pressable", "Save changes").props.onPress());
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toBe(
    "Couldn’t save your profile. Please try again.",
  );
  expect(host("TextInput", "Username").props.value).toBe("River");
  expect(host("Pressable", "Cancel").props.disabled).toBe(false);
  expect(network.updateUser).not.toHaveBeenCalled();
});

it.each(["success", "error"] as const)(
  "simulates %s account deletion in Storybook without touching a real account",
  async (deleteResult) => {
    vi.useFakeTimers();
    const onHome = vi.fn();
    const onDelete = vi.fn();
    await act(async () => {
      renderer = create(preview({ editor: "delete", deleteResult, delayMs: 0, onHome, onDelete }));
    });
    expect(host("Pressable", "Delete account").props.disabled).toBe(true);
    await act(async () =>
      host("TextInput", "Type DELETE to confirm account deletion").props.onChangeText("DELETE"),
    );
    await act(async () => host("Pressable", "Delete account").props.onPress());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(onDelete).toHaveBeenCalledOnce();
    if (deleteResult === "success") {
      expect(renderer.root.findByType(ProfileView).props.session).toBeNull();
      expect(onHome).toHaveBeenCalledOnce();
    } else {
      expect(renderer.root.findByType(ProfileView).props.session.user.id).toBe("storybook-member");
      expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toContain(
        "couldn’t delete",
      );
      expect(onHome).not.toHaveBeenCalled();
    }
    expect(network.deleteUser).not.toHaveBeenCalled();
    expect(useSession).not.toHaveBeenCalled();
  },
);

it.each([320, 375, 380, 390, 600, 900])(
  "matches profile-card typography and narrow layout at viewport width %i",
  async (width) => {
    device.width = width;
    await act(async () => {
      renderer = create(preview());
    });
    const card = renderer.root.findAllByType(MembershipCard)[0]!;
    const name = card.findAll(
      (node) => String(node.type) === "Text" && node.props.children === "Alex",
    )[0]!;
    const style = flatten(name.props.style);
    expect(style).toMatchObject({
      fontFamily: "FrauncesMedium",
      fontSize: Math.max(22, Math.min(30, width * 0.05)),
      color: "#ffebbf",
    });
    const target = host("Pressable", "Edit username, currently Alex");
    expect(flatten(target.props.style)).toMatchObject({
      alignSelf: "flex-start",
      maxWidth: "100%",
      minHeight: 44,
    });
    const frame = card.findAll(
      (node) => String(node.type) === "AnimatedView" && node.props.onLayout,
    )[0]!;
    expect(flatten(frame.props.style)).toMatchObject({
      paddingHorizontal: width <= 380 ? 22 : 30,
      gap: width <= 380 ? 22 : 26,
    });
  },
);

it.each(["onInspect", "onEditName", "onEditEmoji"] as const)(
  "retains both pencils in uniform inspection and routes %s back without an edit",
  async (action) => {
    await act(async () => {
      renderer = create(preview());
    });
    await act(async () => host("Pressable", "Inspect your membership card").props.onPress());
    const inspector = renderer.root.findByType(MembershipCardInspector);
    expect(inspector.props.visible).toBe(true);
    const cards = renderer.root.findAllByType(MembershipCard);
    const inspected = cards.find((card) => card.props.enlarged)!;
    expect(inspected.props).toMatchObject({ name: "Alex", emoji: "🦊", enlarged: true });
    expect(inspected.findAll((node) => String(node.type) === "Pencil")).toHaveLength(2);
    expect(
      inspected
        .findAll((node) => String(node.type) === "Pressable")
        .map((node) => node.props.accessibilityLabel),
    ).toEqual(["Return to your profile", "Return to your profile", "Return to your profile"]);
    const zoom = renderer.root.findByProps({ testID: "membership-card-zoom-layout" }).props.style;
    expect(zoom.width).toBe(inspector.props.size.width);
    expect(zoom.transform).toEqual([
      { scale: membershipInspectionScale(inspector.props.size, device) },
    ]);
    await act(async () => inspected.props[action]());
    expect(inspector.props.visible).toBe(false);
    expect(renderer.root.findAllByType(Sheet)[0]!.props.visible).toBe(false);
    expect(network.updateUser).not.toHaveBeenCalled();
    expect(network.deleteUser).not.toHaveBeenCalled();
  },
);

it("inspects only saved values after cancelling a username draft", async () => {
  await act(async () => {
    renderer = create(preview({ editor: "name" }));
  });
  await act(async () => host("TextInput", "Username").props.onChangeText("Unsaved River"));
  await act(async () => host("Pressable", "Cancel").props.onPress());
  await act(async () => host("Pressable", "Inspect your membership card").props.onPress());
  const inspected = renderer.root
    .findAllByType(MembershipCard)
    .find((card) => card.props.enlarged)!;
  expect(inspected.props.name).toBe("Alex");
  expect(network.updateUser).not.toHaveBeenCalled();
});

it("does not open inspection or an editor when a holographic drag releases over its button", async () => {
  vi.useFakeTimers();
  await act(async () => {
    renderer = create(preview());
  });
  const card = renderer.root.findAllByType(MembershipCard)[0]!;
  const surface = card.findAll(
    (node) => String(node.type) === "View" && node.props.onTouchStart,
  )[0]!;
  await act(async () => {
    surface.props.onTouchStart({ nativeEvent: { pageX: 100, pageY: 100 } });
    surface.props.onTouchMove({ nativeEvent: { pageX: 180, pageY: 100 } });
    surface.props.onTouchEnd();
    host("Pressable", "Inspect your membership card").props.onPress();
    host("Pressable", "Edit username, currently Alex").props.onPress();
  });
  expect(renderer.root.findByType(MembershipCardInspector).props.visible).toBe(false);
  expect(renderer.root.findAllByType(Sheet)[0]!.props.visible).toBe(false);
  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  await act(async () => host("Pressable", "Inspect your membership card").props.onPress());
  expect(renderer.root.findByType(MembershipCardInspector).props.visible).toBe(true);
  expect(network.updateUser).not.toHaveBeenCalled();
  expect(network.deleteUser).not.toHaveBeenCalled();
});

it("releases hidden preview foil textures during inspection but retains the returning card's finish", async () => {
  await act(async () => {
    renderer = create(preview());
  });
  await act(async () => host("Pressable", "Inspect your membership card").props.onPress());
  await act(async () => renderer.root.findByType(MembershipCardInspector).props.onReady());
  const cards = renderer.root.findAllByType(MembershipCard);
  const original = cards.find((card) => !card.props.enlarged)!;
  const inspected = cards.find((card) => card.props.enlarged)!;
  expect(original.findAllByProps({ testID: "membership-card-foil" })).toHaveLength(0);
  expect(inspected.findAllByProps({ testID: "membership-card-foil" })).toHaveLength(1);
});

it("keeps the preview visible until the modal is ready, then restores it on dismissal", async () => {
  await act(async () => {
    renderer = create(preview());
  });
  await act(async () => host("Pressable", "Inspect your membership card").props.onPress());
  const original = renderer.root
    .findAllByType(MembershipCard)
    .find((card) => !card.props.enlarged)!;
  expect(original.parent!.props.style.opacity).toBe(1);
  expect(original.findAllByProps({ testID: "membership-card-foil" })).toHaveLength(1);
  const inspector = renderer.root.findByType(MembershipCardInspector);
  await act(async () => inspector.props.onReady());
  expect(original.parent!.props.style.opacity).toBe(0);
  expect(original.findAllByProps({ testID: "membership-card-foil" })).toHaveLength(0);
  await act(async () => inspector.props.onClose());
  expect(original.parent!.props.style.opacity).toBe(1);
  expect(original.findAllByProps({ testID: "membership-card-foil" })).toHaveLength(1);
});

it("preserves preview geometry through modal pixel rounding and updates it only when the preview resizes", async () => {
  const size = { width: 383.23809814453125, height: 266.6666564941406 };
  const card = (initialSize: typeof size) =>
    createElement(MembershipCard, { name: "Alex", emoji: "🦊", enlarged: true, initialSize });
  await act(async () => {
    renderer = create(card(size));
  });
  const surface = renderer.root.findByProps({ testID: "profile-membership-card" });
  await act(async () =>
    surface.props.onLayout({
      nativeEvent: { layout: { width: size.width, height: 266.28570556640625 } },
    }),
  );
  expect(
    renderer.root.findAllByProps({ cacheKey: `finish:${size.width}:${size.height}` }),
  ).toHaveLength(2);
  expect(flatten(surface.props.style).height).toBe(size.height);
  const resized = { width: 440, height: 380 };
  await act(async () => renderer.update(card(resized)));
  expect(
    renderer.root.findAllByProps({ cacheKey: `finish:${resized.width}:${resized.height}` }),
  ).toHaveLength(2);
});
