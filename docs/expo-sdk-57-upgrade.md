# Expo SDK 55 → 57 upgrade research

Research checked **2026-10-06** against the pre-upgrade project.

## Implementation verification

- Upgraded to Expo 57.0.27, React Native 0.86.3, React/React DOM and the test renderer 19.2.3; aligned Expo modules and native TypeScript 6.0.3. Other workspace TypeScript consumers stay on 5.x.
- Removed the unsupported StatusBar `backgroundColor` prop and replaced the removed `StyleSheet.absoluteFillObject` with `absoluteFill`.
- Prebuild explicitly preserves native folders with `--no-clean --no-install`; Android/iOS projects were updated in place. The separate `apps/android` project is untouched.
- Passed Expo dependency validation, all 21 Expo Doctor checks, native TypeScript checking, root `vp check`, all 567 tests, and Android/iOS/web bundle exports.
- Android APK compilation remains blocked on this Mac by Java 25: `:expo-modules-core:configureCMakeDebug[arm64-v8a]` fails when Android's prefab error parser encounters a restricted-access warning. Retry with the documented Java 17 prerequisite. No APK installation or native authentication/device smoke test was performed; iOS native compilation was not tested.
- Installation emits a peer warning because Vite+ 0.1.14 declares TypeScript `^5`, while Expo recommends native TypeScript 6.0.3. Both Vite+ checks and the native TypeScript check pass; no unrelated tooling upgrade was made.

## Availability and exact target

**SDK 57 is released**, not an unreleased/beta target: Expo announced it on **June 30, 2026**. The newest published stable SDK 57 package observed is **`expo@57.0.27`**; npm metadata currently points both `sdk-57` and `latest` to that version. Use an explicit SDK 57 range rather than assuming `latest` will remain SDK 57. [SDK 57 announcement][57] [npm metadata][npm]

Read-only metadata queries used (all through Vite+):

```sh
vp info expo dist-tags --json
vp info expo@57 version --json
vp info expo@57.0.27 version --json
vp info expo@57.0.27 devDependencies --json
vp info react-native@0.86.3 engines --json
vp info react-test-renderer@19.2.3 peerDependencies --json
```

## Required versions

| Component         | SDK 55 in this repo                     | SDK 57 target                                                                                |
| ----------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Expo              | `~55.0.31`                              | `~57.0.27` (observed newest SDK 57 patch)                                                    |
| React Native      | `0.83.10`                               | `0.86.3` (Expo 57.0.27 package development dependency; confirm with Expo's dependency check) |
| React / React DOM | `19.2.0`                                | `19.2.3`                                                                                     |
| React Native Web  | `~0.21.0`                               | `0.21.0` family, unchanged                                                                   |
| Node.js           | root engine `>=22.12.0`                 | Expo documents minimum **22.13.x**                                                           |
| iOS / Xcode       | SDK 55 supports iOS 15.1+ / Xcode 26.2+ | **iOS 16.4+ / Xcode 26.4+**                                                                  |
| Android           | Android 7+, compile/target API 36       | unchanged: Android 7+, compile/target API 36                                                 |

Sources: local `apps/frontend-native/package.json` and root `package.json`; [Expo's version/OS compatibility tables][versions]; [Expo package metadata][npm]. The exact React version is **19.2.3**, not merely the release post's shorthand “19.2”.

React Native 0.86.3's published Node engine is `^20.19.4 || ^22.13.0 || ^24.3.0 || >=25.0.0`. This is broader than Expo's documented SDK 57 minimum: prefer a supported Node 22 release **at least 22.13.0**, or Node 24 **at least 24.3.0**, and raise the repo's 22.12 minimum accordingly. Do not interpret the minimum as allowing every intermediate Node major. [RN package metadata][rn-npm] [Expo table][versions]

## Migration changes relevant to this app

- **SDK 56 changes still apply when targeting 57.** Expo recommends upgrading one SDK at a time (55 → 56 → 57); the claim that SDK 57 is intended to be non-breaking is specifically about 56 / RN 0.85 → 57 / RN 0.86, not the entire jump from 55. [Upgrade guide][upgrade] [SDK 56][56] [SDK 57][57]
- **Global fetch changes to `expo/fetch` on native.** `src/network/request.ts` uses global `fetch`, explicit `Cookie`/`Origin` headers, `credentials: "omit"`, and `redirect: "error"`. Exercise sign-in, authenticated requests, rejected redirects, cancellation, and Google browser-return flows on real native builds; mocked tests do not validate the new implementation. Expo documents `EXPO_PUBLIC_USE_RN_FETCH=1` as an opt-out, not a required migration. [SDK 56 breaking changes][56] [SDK 57 fetch reference][fetch]
- **StatusBar prop surface changed.** `App.tsx` passes `backgroundColor` to `expo-status-bar`; SDK 57's documented props no longer include it. Remove/adapt that prop during implementation and check Android edge-to-edge appearance. The current `style="light"` remains supported. [SDK 56 status/navigation changes][56] [SDK 57 StatusBar API][status]
- **Hermes v1 and RN animation backend change in SDK 56.** Test the app's `Animated` scroll/fade/blur scenes. SDK 57.0.9 fixes the Hermes memory regression involving Worklets/Reanimated; 57.0.17 fixes increased development startup time. Target 57.0.27 includes both fixes. Worklets/Reanimated are not direct dependencies here. [SDK 56][56] [SDK 57 known regressions][57]
- **Toolchain/platform bumps:** iOS minimum rises to 16.4, Xcode to 26.4, and Expo's recommended TypeScript becomes 6.0.3. The workspace catalog currently specifies TypeScript `^5`; assess shared consumers before changing that catalog, or intentionally use the documented `expo.install.exclude` escape hatch. `expo-network` is also catalog-pinned to SDK 55 and must be aligned; keep `react-test-renderer` aligned with React (19.2.3's published peer is `^19.2.3`). [SDK 56 tool bumps][56] [renderer metadata][renderer-npm]
- **Prebuild is now clean by default in SDK 57:** it clears and regenerates `android/` and `ios/`; `--no-clean` preserves existing folders for in-place updates. Both native folders exist locally, and the README describes generated projects. Inspect for manual changes before regeneration; never affect the separate `apps/android` app. **New development binaries are required** after upgrading `expo-dev-client`. [SDK 57][57]
- **Xcode 27 / iOS 27 SDK builds:** SDK 57 requires opt-in UIKit scene support using `expo-build-properties`' `ios.enableSceneSupport`, available starting with Expo 57.0.23; this is not necessary merely to remain on Xcode 26.4. [SDK 57 Xcode 27 section][57]
- SDK 56 also changes File/Directory `copy()`/`move()` to async, forks Expo Router away from React Navigation, removes Expo's transitive `@expo/vector-icons` dependency, and changes DOM component WebViews. No direct app dependency/import on these APIs was found, so do not introduce unrelated migrations. [SDK 56 breaking changes][56]

## Official upgrade/check workflow, adapted to Vite+

Expo's release notes prescribe `expo install expo@^57.0.0 --fix` and `expo-doctor@latest` (normally invoked using `npx`); the generic guide also supports installing Expo first, then `expo install --fix`. Checks are `expo install --check` and Expo Doctor. **Do not run unwrapped npm/pnpm/npx commands here.** [SDK 57][57] [Upgrade guide][upgrade] [CLI][cli]

For this repo, run the following from **`apps/frontend-native`**, during the actual upgrade—not as part of this research:

```sh
# Expo recommends first doing the equivalent SDK 56 stage, then SDK 57.
vp add 'expo@~57.0.27' react@19.2.3 react-dom@19.2.3 react-native@0.86.3
CI=1 vp exec expo install --check
vp dlx expo-doctor@latest
```

**The dependency check will initially fail until all SDK packages are aligned.** Use its reported versions (and the installed Expo package's `bundledNativeModules.json`) to update the remaining dependencies/catalogs with `vp add` / `vp install`, then repeat both checks. `CI=1` prevents the check from prompting to install fixes. Expo's `install --fix`, even if launched with `vp exec`, delegates installation to a package manager; under the strict “all package operations through vp” rule, use its recommendations but apply package changes through Vite+ instead. Do not assume every dependency uses the same `57.0.x` patch. [CLI install/validation/package-manager behavior][cli]

After auditing the generated native directories, regenerate CNG projects and rebuild the development clients. For manually maintained native projects, use Expo's native upgrade helper and update CocoaPods instead of discarding native changes. Finally run root `vp check` / `vp test`, the native app's TypeScript check and Metro export, and Android/iOS smoke tests (auth/deep links, persisted games, network flows, motion). Expo explicitly requires rebuilding development clients; a Metro refresh is insufficient. [Upgrade guide][upgrade] [SDK 57][57]

[57]: https://expo.dev/changelog/sdk-57
[56]: https://expo.dev/changelog/sdk-56
[versions]: https://docs.expo.dev/versions/v57.0.0/#each-expo-sdk-version-depends-on-a-react-native-version
[upgrade]: https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/
[cli]: https://docs.expo.dev/more/expo-cli/#install
[fetch]: https://docs.expo.dev/versions/v57.0.0/sdk/expo/#expofetch-api
[status]: https://docs.expo.dev/versions/v57.0.0/sdk/status-bar/
[npm]: https://www.npmjs.com/package/expo/v/57.0.27
[rn-npm]: https://www.npmjs.com/package/react-native/v/0.86.3
[renderer-npm]: https://www.npmjs.com/package/react-test-renderer/v/19.2.3
