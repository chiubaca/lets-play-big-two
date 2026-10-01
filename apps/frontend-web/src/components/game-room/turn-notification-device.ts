import { honoClient } from "~/libs/hono-client";

export type DeviceState = "not-enabled" | "ready" | "blocked" | "unavailable";

export type TurnNotificationDevice = {
  inspect: () => Promise<{
    state: DeviceState;
    generation: number;
    reason?: string;
    removable?: boolean;
  }>;
  enable: (generation: number) => Promise<void>;
  remove: () => Promise<void>;
};

const storedEndpointId = "big-two-turn-device-id";
const androidTwaSession = "big-two-android-twa-notifications";

function androidWrapperCapability(): { available: boolean; reason?: string } {
  if (!/Android/.test(navigator.userAgent)) return { available: true };
  const referrer = document.referrer;
  let wrapper = referrer.startsWith("android-app://");
  let supported = false;
  try {
    const previous = sessionStorage.getItem(androidTwaSession);
    wrapper ||= previous !== null;
    // Only this regenerated wrapper launches with the capability marker. The old Play build
    // must not inherit a browser subscription's Ready state through its Custom Tab.
    if (
      referrer.startsWith("android-app://com.chiubaca.bigtwocrew/") &&
      new URL(location.href).searchParams.get("twa-notifications") === "2"
    ) {
      sessionStorage.setItem(androidTwaSession, "2");
      supported = true;
    } else {
      supported = previous === "2";
    }
  } catch {
    // No persistent evidence of a capable wrapper: fail closed for app referrers.
  }
  if (wrapper && (!supported || window.matchMedia?.("(display-mode: browser)").matches)) {
    return {
      available: false,
      reason:
        "Notifications aren’t available in this app right now. Update the app and reopen it from its icon. If this continues, check that supported links open in the app in Android settings.",
    };
  }
  return { available: true };
}

// Capture the launcher URL before the router navigates away from /.
export function recordAndroidWrapperLaunch() {
  androidWrapperCapability();
}

function savedEndpointId() {
  try {
    return localStorage.getItem(storedEndpointId) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveEndpointId(id: string | null) {
  try {
    if (id) localStorage.setItem(storedEndpointId, id);
    else localStorage.removeItem(storedEndpointId);
  } catch {
    /* Browser storage may be disabled; the subscription remains accessible while permission lasts. */
  }
}

function vapidKey() {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
  return Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), (char) =>
    char.charCodeAt(0),
  );
}

function matchesKey(current: PushSubscription) {
  const key = current.options.applicationServerKey;
  const expected = vapidKey();
  return Boolean(
    key &&
    key.byteLength === expected.length &&
    new Uint8Array(key).every((byte, index) => byte === expected[index]),
  );
}

async function accessibleSubscription() {
  try {
    return (await subscription()).current;
  } catch {
    return null;
  }
}

function capability(): { available: boolean; reason?: string } {
  const agent = navigator.userAgent;
  const wrapper = androidWrapperCapability();
  if (!wrapper.available) return wrapper;
  if (/iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) {
    return {
      available: false,
      reason: window.matchMedia?.("(display-mode: standalone)").matches
        ? "Notifications aren’t supported in the iOS app yet."
        : "Notifications aren’t supported in iOS browser tabs. Home Screen app support is also not available yet.",
    };
  }
  if (
    /Macintosh/.test(agent) &&
    /Safari\//.test(agent) &&
    !/Chrome\/|Chromium\/|Edg\/|Firefox\//.test(agent)
  ) {
    return { available: false, reason: "Notifications aren’t supported in Safari yet." };
  }
  if (
    !window.isSecureContext ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return {
      available: false,
      reason: "Notifications aren’t supported on this device or browser.",
    };
  }
  if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) {
    return { available: false, reason: "Notifications aren’t available on this site yet." };
  }
  return { available: true };
}

async function subscription(register = false) {
  const worker =
    (await navigator.serviceWorker.getRegistration("/")) ??
    (register ? await navigator.serviceWorker.register("/service-worker.js") : null);
  return { worker, current: worker ? await worker.pushManager.getSubscription() : null };
}

async function hash(endpoint: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const turnNotificationDevice: TurnNotificationDevice = {
  async inspect() {
    const support = capability();
    if (!support.available) return { state: "unavailable", generation: 0, reason: support.reason };
    const blocked = Notification.permission === "denied";
    const current = blocked ? await accessibleSubscription() : (await subscription()).current;
    const id = current ? await hash(current.endpoint) : savedEndpointId();
    const response = await honoClient.api["turn-notifications"].device.$get({
      query: { endpointId: id },
    });
    if (!response.ok) throw new Error("Could not check this device");
    const { registered, generation } = await response.json();
    return {
      state:
        blocked || (registered && Notification.permission !== "granted")
          ? "blocked"
          : Notification.permission === "granted" && current && matchesKey(current) && registered
            ? "ready"
            : "not-enabled",
      generation,
      removable: Boolean(registered),
    };
  },
  async enable(generation) {
    if (!capability().available) throw new Error("This device is unavailable");
    if (Notification.permission === "denied")
      throw new Error("Notifications are blocked in browser settings");
    // Keep the permission request directly inside the explicit button action.
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted")
      throw new Error("Notifications are blocked or permission was not granted");
    const { worker, current } = await subscription(true);
    if (!worker) throw new Error("Service worker unavailable");
    const applicationServerKey = vapidKey();
    const sameKey = current && matchesKey(current);
    if (current && !sameKey) {
      // Retire the old registration before replacing the browser subscription, even if replacement fails.
      const removed = await honoClient.api["turn-notifications"].device.$delete({
        json: { endpointId: await hash(current.endpoint) },
      });
      if (!removed.ok) throw new Error("Could not retire the previous subscription");
      await current.unsubscribe();
    }
    const sub =
      current && sameKey
        ? current
        : await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    const data = sub.toJSON();
    if (!data.endpoint || !data.keys?.p256dh || !data.keys.auth)
      throw new Error("Incomplete subscription");
    const response = await honoClient.api["turn-notifications"].device.$post({
      json: {
        endpoint: data.endpoint,
        keys: { p256dh: data.keys.p256dh, auth: data.keys.auth },
        generation,
      },
    });
    if (!response.ok) {
      if (response.status === 409) {
        const result = await response.json();
        throw new Error(result.error);
      }
      throw new Error("Could not register this device");
    }
    saveEndpointId(await hash(sub.endpoint));
  },
  async remove() {
    const current = await accessibleSubscription();
    const id = current ? await hash(current.endpoint) : savedEndpointId();
    if (!id) throw new Error("No device registration to remove");
    const response = await honoClient.api["turn-notifications"].device.$delete({
      json: { endpointId: id },
    });
    if (!response.ok) throw new Error("Could not remove this device");
    saveEndpointId(null);
    if (current) {
      try {
        await current.unsubscribe();
      } catch {
        /* Server removal is authoritative even if the browser has already revoked the subscription. */
      }
    }
  },
};

export async function forgetTurnNotificationInstall() {
  saveEndpointId(null);
  const current = await accessibleSubscription();
  try {
    await current?.unsubscribe();
  } catch {
    /* The originating session still gates delivery if unsubscribe fails. */
  }
  try {
    const worker = await navigator.serviceWorker.getRegistration("/");
    const notices = await worker?.getNotifications();
    for (const notice of notices ?? []) {
      if (/^[A-Z0-9]{5}:[a-f0-9-]{36}$/.test(notice.tag)) notice.close();
    }
  } catch {
    /* The return gate remains identity-checked even if an old alert stays visible. */
  }
}
