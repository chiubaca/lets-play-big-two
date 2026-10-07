import { useRef, useState, type ReactNode } from "react";
import {
  Animated,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutRectangle,
} from "react-native";
import { Brand } from "./brand";
import { HomeBlurLayers } from "./home-blur-layers";
import {
  HOME_SCROLL_EFFECTS,
  homeLogoWidth,
  homeScrollMotion,
  homeStickyTop,
} from "./home-scroll-motion";
import { CasinoBackdrop, CasinoScreen } from "./primitives";
import { useReducedMotion } from "./use-reduced-motion";

const emptyLayout = { x: 0, y: 0, width: 0, height: 0 };

export function HomeScrollScene({
  nav,
  children,
  footer,
  overlays,
}: {
  nav: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  overlays: ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [copy, setCopy] = useState<LayoutRectangle>(emptyLayout);
  const [stage, setStage] = useState<LayoutRectangle>(emptyLayout);
  const [foreground, setForeground] = useState<LayoutRectangle>(emptyLayout);
  const logoWidth = homeLogoWidth(width, height);
  const motion = homeScrollMotion({
    stageY: copy.y + stage.y,
    stageHeight: stage.height,
    foregroundY: copy.y + foreground.y,
    containerBottom: copy.y + copy.height,
    stickyTop: homeStickyTop(height),
  });
  const translateY = scrollY.interpolate({
    inputRange: [motion.pinStart, Math.max(motion.pinStart + 1, motion.pinEnd)],
    outputRange: [0, motion.maxTranslate],
    extrapolate: "clamp",
  });
  const overlap = scrollY.interpolate({
    inputRange: [motion.overlapStart, motion.overlapEnd],
    outputRange: [0, motion.maxOverlap],
    extrapolate: "clamp",
  });

  return (
    <CasinoScreen
      backdrop={
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {reducedMotion ? (
            <CasinoBackdrop overscan={20} />
          ) : (
            <HomeBlurLayers overlap={overlap} opaque>
              {(blurRadius) => <CasinoBackdrop overscan={20} blurRadius={blurRadius} />}
            </HomeBlurLayers>
          )}
        </View>
      }
    >
      <View style={styles.viewport}>
        <Animated.ScrollView
          contentContainerStyle={styles.scroll}
          stickyHeaderIndices={[0]}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          removeClippedSubviews={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: true,
          })}
        >
          <View testID="home-nav-overlay" pointerEvents="box-none" style={styles.nav}>
            {nav}
          </View>
          <View
            testID="home-copy"
            style={styles.copy}
            onLayout={(event) => setCopy(event.nativeEvent.layout)}
          >
            <View
              testID="home-logo-stage"
              style={styles.stage}
              onLayout={(event) => setStage(event.nativeEvent.layout)}
            >
              <Animated.View
                testID="home-logo-pin"
                pointerEvents="none"
                style={reducedMotion ? undefined : { transform: [{ translateY }] }}
              >
                <Animated.View
                  testID="home-logo"
                  accessible
                  accessibilityRole="header"
                  accessibilityLabel="Big Two Crew"
                  style={
                    reducedMotion
                      ? undefined
                      : {
                          transform: [
                            {
                              scale: overlap.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 1 - HOME_SCROLL_EFFECTS.shrink],
                              }),
                            },
                          ],
                        }
                  }
                >
                  {reducedMotion ? (
                    <Brand width={logoWidth} accessible={false} />
                  ) : (
                    <HomeBlurLayers overlap={overlap}>
                      {(blurRadius) => (
                        <Brand width={logoWidth} blurRadius={blurRadius} accessible={false} />
                      )}
                    </HomeBlurLayers>
                  )}
                </Animated.View>
              </Animated.View>
            </View>
            <View
              testID="home-mode-foreground"
              style={styles.foreground}
              onLayout={(event) => setForeground(event.nativeEvent.layout)}
            >
              {children}
            </View>
          </View>
          <View style={styles.footer}>{footer}</View>
        </Animated.ScrollView>
      </View>
      {overlays}
    </CasinoScreen>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  scroll: { flexGrow: 1, padding: 14, alignItems: "center" },
  nav: { width: "100%", alignItems: "center", zIndex: 5 },
  copy: { width: "100%", alignItems: "center", marginTop: 16 },
  stage: { alignItems: "center", marginTop: 17, marginBottom: 4, zIndex: 0 },
  foreground: { width: "100%", alignItems: "center", marginTop: 16, zIndex: 1 },
  footer: { width: "100%", alignItems: "center", marginTop: 16, zIndex: 2 },
});
