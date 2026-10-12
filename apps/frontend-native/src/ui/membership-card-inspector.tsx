import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  findNodeHandle,
  useWindowDimensions,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CasinoBackdrop, Label } from "./primitives";
import { colors } from "./theme";
import {
  membershipCardReturn,
  membershipInspectionScale,
  type MembershipCardBounds,
  type MembershipCardPresentation,
} from "./membership-card-motion";
import { useReducedMotion } from "./use-reduced-motion";

export function MembershipCardInspector({
  visible,
  size,
  measureAnchor,
  onClose,
  onRestoreFocus,
  onReady,
  renderCard,
}: {
  visible: boolean;
  size: { width: number; height: number };
  measureAnchor: (done: (bounds: MembershipCardBounds | null) => void) => void;
  onClose: () => void;
  onRestoreFocus: () => void;
  onReady?: () => void;
  renderCard: (
    close: () => void,
    interactive: boolean,
    presentation: MembershipCardPresentation,
  ) => ReactNode;
}) {
  const viewport = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [hintHeight, setHintHeight] = useState(40 * viewport.fontScale);
  const closeTop = Math.max(32, insets.top + 12);
  const bottomPadding = Math.max(16, insets.bottom) + 12;
  const reservedHeight = Math.max(
    160,
    2 * (Math.min(hintHeight, viewport.height * 0.25) + 24 + bottomPadding),
    2 * (closeTop + 60),
  );
  const zoom = membershipInspectionScale(size, viewport, reservedHeight);
  const stage = useRef<View>(null);
  const closeButton = useRef<View>(null);
  const progress = useSharedValue(1);
  const ready = useSharedValue(false);
  const returnProgress = useSharedValue(0);
  const destination = useSharedValue({ x: 0, y: 0, scale: 1 });
  const [closing, setClosing] = useState(false);
  const warmFrame = useRef<number | null>(null);
  const shown = useRef(false);
  const laidOut = useRef(false);
  const backdropLoaded = useRef(false);
  const started = useRef(false);
  const focusFrame = useRef<number | null>(null);
  const alive = useRef(true);
  const closingRef = useRef(false);
  const generation = useRef(0);
  const pendingFocus = useRef(false);
  const dismissed = useRef(false);
  const current = useRef({
    visible,
    reducedMotion,
    onClose,
    onRestoreFocus,
    onReady,
    measureAnchor,
  });
  current.current = { visible, reducedMotion, onClose, onRestoreFocus, onReady, measureAnchor };

  const cancelWarmup = useCallback(() => {
    if (warmFrame.current !== null) cancelAnimationFrame(warmFrame.current);
    warmFrame.current = null;
  }, []);
  const cancelMotion = useCallback(() => {
    cancelAnimation(progress);
    cancelAnimation(returnProgress);
  }, [progress, returnProgress]);

  const prepareOpening = useCallback(() => {
    if (
      !alive.current ||
      !current.current.visible ||
      closingRef.current ||
      !shown.current ||
      !laidOut.current ||
      !backdropLoaded.current ||
      started.current ||
      warmFrame.current !== null
    )
      return;
    const epoch = generation.current;
    // Let the native modal lay out and rasterize BOTH faces before turning them.
    // The nearly transparent warm-up is drawn (opacity 0 would skip GPU uploads).
    warmFrame.current = requestAnimationFrame(() => {
      warmFrame.current = requestAnimationFrame(() => {
        warmFrame.current = null;
        if (
          !alive.current ||
          !current.current.visible ||
          closingRef.current ||
          generation.current !== epoch
        )
          return;
        started.current = true;
        current.current.onReady?.();
        scheduleOnUI((reduced: boolean) => {
          "worklet";
          progress.value = reduced ? 1 : 0;
          ready.value = true;
          if (!reduced) {
            progress.value = withTiming(1, {
              duration: 850,
              easing: Easing.bezier(0.22, 1, 0.36, 1),
            });
          }
        }, current.current.reducedMotion);
      });
    });
  }, [progress, ready]);

  const restoreFocus = useCallback(() => {
    if (!alive.current || current.current.visible || !pendingFocus.current) return;
    pendingFocus.current = false;
    current.current.onRestoreFocus();
  }, []);

  useLayoutEffect(() => {
    generation.current += 1;
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = null;
    if (visible) {
      pendingFocus.current = false;
      dismissed.current = false;
      cancelWarmup();
      cancelMotion();
      progress.value = 1;
      ready.value = false;
      returnProgress.value = 0;
      shown.current = false;
      laidOut.current = false;
      backdropLoaded.current = false;
      started.current = false;
      setClosing(false);
      closingRef.current = false;
    } else if (pendingFocus.current && Platform.OS === "android") {
      // Android removes the native modal on this commit; iOS restores via onDismiss.
      const epoch = generation.current;
      focusFrame.current = requestAnimationFrame(() => {
        focusFrame.current = requestAnimationFrame(() => {
          focusFrame.current = null;
          if (generation.current === epoch) restoreFocus();
        });
      });
    }
    return () => {
      cancelWarmup();
      cancelMotion();
    };
  }, [visible, progress, ready, returnProgress, restoreFocus, cancelWarmup, cancelMotion]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelWarmup();
      cancelMotion();
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    };
  }, [cancelWarmup, cancelMotion]);
  const finish = useCallback((epoch: number) => {
    if (
      !alive.current ||
      !current.current.visible ||
      dismissed.current ||
      generation.current !== epoch
    )
      return;
    dismissed.current = true;
    pendingFocus.current = true;
    current.current.onClose();
  }, []);
  const close = () => {
    if (closingRef.current || !visible) return;
    closingRef.current = true;
    cancelWarmup();
    setClosing(true);
    const epoch = generation.current;
    if (reducedMotion || !started.current || !stage.current) {
      finish(epoch);
      return;
    }
    stage.current.measureInWindow((x, y, width, height) => {
      if (!alive.current || !current.current.visible || generation.current !== epoch) return;
      current.current.measureAnchor((anchor) => {
        if (!alive.current || !current.current.visible || generation.current !== epoch) return;
        const next = anchor && membershipCardReturn(anchor, { x, y, width, height });
        if (!next || current.current.reducedMotion) {
          finish(epoch);
          return;
        }
        scheduleOnUI(
          (target: { x: number; y: number; scale: number }, token: number) => {
            "worklet";
            destination.value = target;
            cancelAnimation(progress);
            const settle = { duration: 650, easing: Easing.bezier(0.22, 1, 0.36, 1) };
            // An early close continues from the current turn, never a reset to 0deg.
            progress.value = withTiming(1, settle);
            returnProgress.value = withTiming(1, settle, (finished) => {
              if (finished) scheduleOnRN(finish, token);
            });
          },
          next,
          epoch,
        );
      });
    });
  };
  useEffect(() => {
    if (reducedMotion) {
      cancelMotion();
      progress.value = 1;
      if (closing) finish(generation.current);
    }
  }, [closing, reducedMotion, finish, cancelMotion, progress]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: ready.value ? Math.min(1, progress.value / 0.35) * (1 - returnProgress.value) : 0.001,
  }));
  const stageStyle = useAnimatedStyle(() => ({
    opacity: ready.value ? 1 : 0.001,
    transform: [
      { translateX: destination.value.x * returnProgress.value },
      { translateY: destination.value.y * returnProgress.value },
      { scale: 1 + (destination.value.scale - 1) * returnProgress.value },
    ],
  }));
  return (
    <Modal
      visible={visible}
      hardwareAccelerated
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={close}
      onDismiss={restoreFocus}
      onShow={() => {
        shown.current = true;
        prepareOpening();
        const node = findNodeHandle(closeButton.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }}
    >
      <View style={styles.overlay} accessibilityViewIsModal onAccessibilityEscape={close}>
        <Animated.View
          testID="membership-card-backdrop"
          renderToHardwareTextureAndroid
          shouldRasterizeIOS
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        >
          <CasinoBackdrop
            blurRadius={18}
            onLoadEnd={() => {
              backdropLoaded.current = true;
              prepareOpening();
            }}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#030e0988" }]} />
        </Animated.View>
        <Label accessibilityRole="header" style={styles.hiddenTitle}>
          Your membership card
        </Label>
        <Animated.View
          pointerEvents={closing ? "none" : "auto"}
          style={[styles.closePosition, { top: closeTop }, backdropStyle]}
        >
          <Pressable
            ref={closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close your membership card"
            onPress={close}
            style={styles.close}
          >
            <X size={20} color={colors.muted} />
          </Pressable>
        </Animated.View>
        <Animated.View
          ref={stage}
          collapsable={false}
          testID="membership-card-zoom"
          onLayout={() => {
            laidOut.current = true;
            prepareOpening();
          }}
          style={[
            {
              width: size.width * zoom,
              height: size.height * zoom,
            },
            stageStyle,
          ]}
        >
          <View
            testID="membership-card-zoom-layout"
            style={{ width: size.width, transformOrigin: "top left", transform: [{ scale: zoom }] }}
          >
            {renderCard(close, visible && !closing, { progress, ready })}
          </View>
        </Animated.View>
        <Animated.View
          onLayout={({ nativeEvent: { layout } }) => {
            if (layout.height !== hintHeight) setHintHeight(layout.height);
          }}
          style={[
            styles.hint,
            {
              top: viewport.height / 2 + (size.height * zoom) / 2 + 24,
              maxHeight: viewport.height * 0.25,
            },
            backdropStyle,
          ]}
        >
          <ScrollView nestedScrollEnabled>
            <Label style={styles.hintText}>
              Move across the card to catch the light. Close to return to your profile.
            </Label>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center" },
  backdrop: { backgroundColor: "#030e09" },
  hiddenTitle: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    color: "transparent",
  },
  closePosition: { position: "absolute", right: 16, width: 44, height: 44, zIndex: 3 },
  close: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 22,
    backgroundColor: "#071b1088",
  },
  hint: { position: "absolute", maxWidth: 340, paddingHorizontal: 24 },
  hintText: { fontSize: 12, lineHeight: 20, textAlign: "center", color: colors.muted },
});
