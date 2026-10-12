export const NATIVE_SCHEME =
  process.env.EXPO_PUBLIC_APP_VARIANT === "development" ? "bigtwocrew-dev" : "bigtwocrew";
export const NATIVE_ORIGIN = `${NATIVE_SCHEME}://`;

// Expo inlines EXPO_PUBLIC_* only when accessed using this dot notation.
export const BACKEND_URL = (
  process.env.EXPO_PUBLIC_BACKEND_URL ?? "https://big-two-api.chiubaca.com"
).replace(/\/+$/, "");
