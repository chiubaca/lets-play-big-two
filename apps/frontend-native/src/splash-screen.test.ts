import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";
import config from "../app.config";

const requireSplash = createRequire(import.meta.url);
const requirePlugin = createRequire(requireSplash.resolve("expo-splash-screen/package.json"));
const { setSplashImageDrawablesForThemeAsync } = requirePlugin(
  "./plugin/build/withAndroidSplashImages.js",
) as {
  setSplashImageDrawablesForThemeAsync: (
    images: Record<string, string>,
    theme: "light",
    root: string,
    width: number,
  ) => Promise<void>;
};
const requireImageUtils = createRequire(requirePlugin.resolve("@expo/image-utils/package.json"));
const Jimp = requireImageUtils("jimp-compact") as {
  read: (image: Buffer) => Promise<{ bitmap: { width: number; height: number; data: Buffer } }>;
};

it("keeps the complete boot logo inside Android's circular splash mask at every density", async () => {
  const splash = config.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
  )?.[1] as { image: string; imageWidth: number; android?: { imageWidth?: number } };
  const root = await mkdtemp(path.join(tmpdir(), "big-two-splash-"));
  const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
  const image = fileURLToPath(new URL(`../${splash.image}`, import.meta.url));

  try {
    await setSplashImageDrawablesForThemeAsync(
      Object.fromEntries(densities.map((density) => [density, image])),
      "light",
      root,
      splash.android?.imageWidth ?? splash.imageWidth,
    );

    for (const density of densities) {
      const { bitmap } = await Jimp.read(
        await readFile(
          path.join(root, `android/app/src/main/res/drawable-${density}/splashscreen_logo.png`),
        ),
      );
      // Android masks a 288dp icon to a 192dp-diameter circle (no icon background).
      // https://developer.android.com/develop/ui/views/launch/splash-screen
      const radius = bitmap.width / 3;
      let visiblePixels = 0;
      let clippedPixels = 0;
      for (let y = 0; y < bitmap.height; y++) {
        for (let x = 0; x < bitmap.width; x++) {
          if (bitmap.data[(y * bitmap.width + x) * 4 + 3]! < 16) continue;
          visiblePixels++;
          if (Math.hypot(x + 0.5 - bitmap.width / 2, y + 0.5 - bitmap.height / 2) > radius) {
            clippedPixels++;
          }
        }
      }
      expect(visiblePixels).toBeGreaterThan(0);
      expect(clippedPixels, `${density}: logo pixels outside the Android splash mask`).toBe(0);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
