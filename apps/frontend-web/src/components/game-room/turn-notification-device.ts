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
  if (/iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) {
    return {
      available: false,
      reason: window.matchMedia?.("(display-mode: standalone)").matches
        ? "This iOS Home Screen surface is awaiting device verification."
        : "Install this site to your Home Screen to use notifications on iOS. This browser tab cannot enroll.",
    };
  }
  if (
    /Macintosh/.test(agent) &&
    /Safari\//.test(agent) &&
    !/Chrome\/|Chromium\/|Edg\/|Firefox\//.test(agent)
  ) {
    return { available: false, reason: "Safari notifications are awaiting device verification." };
  }
  if (
    !window.isSecureContext ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { available: false, reason: "Web Push is unavailable on this device or browser." };
  }
  if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) {
    return { available: false, reason: "Web Push is not configured for this site yet." };
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
      state: blocked
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
    if (current && !sameKey) await current.unsubscribe();
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
    if (!response.ok) throw new Error("Could not register this device");
    saveEndpointId(await hash(sub.endpoint));
    if (current && !sameKey && current.endpoint !== sub.endpoint) {
      // Rotating a subscription must not leave the previous endpoint enrolled.
      const removed = await honoClient.api["turn-notifications"].device.$delete({
        json: { endpointId: await hash(current.endpoint) },
      });
      if (!removed.ok) throw new Error("Could not retire the previous subscription");
    }
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
