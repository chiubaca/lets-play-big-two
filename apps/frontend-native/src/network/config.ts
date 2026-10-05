export const NATIVE_SCHEME = "bigtwocrew";
export const NATIVE_ORIGIN = `${NATIVE_SCHEME}://`;

// Expo inlines EXPO_PUBLIC_* only when accessed using this dot notation.
export const BACKEND_URL = (
  process.env.EXPO_PUBLIC_BACKEND_URL ?? "https://big-two-api.chiubaca.com"
).replace(/\/+$/, "");
