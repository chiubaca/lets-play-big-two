const { getDefaultConfig } = require("expo/metro-config");
const { withStorybook } = require("@storybook/react-native/withStorybook");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
if (process.env.STORYBOOK_ENABLED === "true") {
  // Settings previews must not read/write the installed app's saved preferences.
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === "@react-native-async-storage/async-storage") {
      return { type: "sourceFile", filePath: path.resolve(__dirname, ".rnstorybook/storage.ts") };
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

// Expo automatically watches and resolves the pnpm workspace, including shared TS packages.
// Entry-point swapping keeps Storybook (and its fixtures) out of normal app bundles.
module.exports = withStorybook(config, {
  configPath: path.resolve(__dirname, ".rnstorybook"),
  docTools: false,
});
