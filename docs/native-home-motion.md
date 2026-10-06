# Native home motion parity

The native home mirrors the web's sticky-overlap effect, not independent
parallax motion of the three logo images.

## Contract

- Navigation sticks at the scroll viewport's top, inside the native safe area.
- The logo pins at `clamp(32, viewportHeight × 0.06, 80)` and releases at the
  bottom of the hero copy, before the footer. Cards scroll above it.
- Progress is `clamp((stageBottom − modeGridTop) / (stageHeight × 0.85), 0, 1)`.
  Measurements use the untransformed stage; shrinking does not change progress.
- Logo opacity is `1 − 0.5 × progress`; scale is `1 − 0.06 × progress`.
- Logo and stationary background blur from sharp to radius 12. Native uses
  crossfaded static image-blur layers at 0/6/12 so scroll updates run on the
  native animation driver, without re-rendering/re-blurring each frame.
- Logo width follows the web's viewport-height sizing, bounded by native gutters.
- Reduced motion keeps the logo in normal flow, sharp, full-opacity and unscaled.
  Setting changes are applied live; navigation remains sticky, as on web.
- Existing non-home `CasinoScreen` layouts and backgrounds are unchanged.

Native bitmap blur is an approximation of CSS Gaussian blur: platform radii,
individual artwork edges and transparent crossfades differ. It is not
pixel-identical. Logo layer alpha accounts for source-over compositing so opaque
lettering follows the intended fade without opacity dips at blur midpoints.
Android groups each logo tier before applying alpha. The opaque backdrop keeps
its base visible to avoid crossfade darkening. No new native module or
development-client rebuild is required for the effect.

## Validation

`src/ui/home-scroll-motion.test.ts` checks geometry against the web bounding-box
formula and checks effect constants against the actual web CSS/hook. Mocked
native component tests cover midpoint/end transforms, reverse scrolling,
containment, layout updates, blur-layer weights, native-driver wiring, a single
accessible logo, reduced-motion changes/query failures/races, and cleanup.

Browser-rendered native previews are useful for layout inspection, but do not
prove iOS/Android blur fidelity or frame rate. Before release, check both platforms:

- Small/large phones and landscape/tablets, with safe areas and large fonts.
- Signed-out and signed-in layouts, including a long room list and keyboard.
- Slow forward/reverse scrolling: sticky onset, cards covering the logo, release
  before the footer, and no logo cropping from native clipped-subview removal.
- Partial overlap (`progress ≈ 0.25/0.75`) for blurred lettering/alpha artifacts.
- Rotation and content changes while scrolled, plus native overscroll/bounce.
- Reduce Motion on at launch and toggled live; VoiceOver/TalkBack; mode/account
  controls remain tappable over the decorative logo.
- Frame rate and image memory on a lower-end Android device.

### Android emulator review — 6 October 2026

Reviewed the running API 36 development client at 1080×2400 / 420 dpi,
using the existing signed-in session without creating/joining rooms or changing
account data. SDK tools were available under `~/Library/Android/sdk`, despite
not being on `PATH`.

- Initial, partial-overlap and deep-overlap captures show progressive blur/fade,
  crisp foreground cards and navigation, and no obvious doubled lettering,
  rectangular compositing seams or logo-edge clipping.
- Changing Android's transition-animation scale to zero while scrolled switched
  the logo to sharp normal-flow artwork and removed backdrop blur. Restoring the
  original scale (`1.0`) restored the effect without restarting the app.
- A separate subagent compared these captures with the production web home and
  approved the sampled visual states. Signed-in native and signed-out web content
  have different scroll extents, so this was not a pixel-matched comparison.
- The floating gear is development-client tooling, not part of the home UI.
  The displayed room-list request error was outside this motion review.

Still outstanding: iOS runtime QA, native rotation/keyboard and screen-reader
checks, long-room-list behavior, and release-device frame-rate/memory profiling.
Static emulator screenshots do not establish animation smoothness. Mocked tests
and browser rotation/hit-testing checks are not substitutes for those checks.
