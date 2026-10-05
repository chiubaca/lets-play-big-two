const { getDefaultConfig } = require("expo/metro-config");

// Expo automatically watches and resolves the pnpm workspace, including shared TS packages.
module.exports = getDefaultConfig(__dirname);
