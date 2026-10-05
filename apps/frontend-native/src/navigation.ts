export type NativeRoute =
  | { name: "home" }
  | { name: "solo" }
  | { name: "pass-setup" }
  | { name: "pass-and-play" }
  | { name: "profile"; editor?: "delete" }
  | { name: "room"; roomId: string };

/** Only our scheme and our public room links may select a native room. */
export function routeFromURL(value: string): NativeRoute | null {
  try {
    if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(value) || value.includes("\\")) return null;
    const url = new URL(value);
    const path =
      url.protocol === "bigtwocrew:"
        ? `${url.host}${url.pathname}`
        : url.protocol === "https:" && url.hostname === "big-two.chiubaca.com"
          ? url.pathname.replace(/^\//, "")
          : "";
    const match = /^room\/([a-z0-9]{1,8})\/?$/i.exec(path);
    return match ? { name: "room", roomId: match[1].toUpperCase() } : null;
  } catch {
    return null;
  }
}
