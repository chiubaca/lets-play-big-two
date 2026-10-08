import type { createRequest } from "../network/request";

export type DeviceState = {
  state: "ready" | "not-enabled" | "blocked" | "unavailable";
  generation: number;
  removable?: boolean;
  reason?: string;
};

export type DeviceInstall = { endpointId: string; token: string };
export type PushPlatform = {
  unavailable: () => string | undefined;
  permission: (request: boolean) => Promise<{ allowed: boolean; canAskAgain: boolean }>;
  token: () => Promise<string>;
  hash: (address: string) => Promise<string>;
  read: () => Promise<DeviceInstall | null>;
  save: (install: DeviceInstall | null) => Promise<void>;
  dismiss: () => Promise<void>;
};

// Request is bound to the originating cookie, never a later account's cookie.
export function createTurnDevice(
  request: ReturnType<typeof createRequest>,
  platform: PushPlatform,
  current: () => boolean,
) {
  const assertCurrent = () => {
    if (!current()) throw new Error("Your session changed. Reopen settings to try again.");
  };
  const status = (endpointId?: string) => {
    assertCurrent();
    return request<{ registered: boolean; generation: number }>(
      `/api/turn-notifications/device${endpointId ? `?endpointId=${endpointId}` : ""}`,
    );
  };
  const removeId = (endpointId: string) => {
    assertCurrent();
    return request("/api/turn-notifications/device", { method: "DELETE", json: { endpointId } });
  };
  async function enroll(generation: number, token: string, previous: DeviceInstall | null) {
    assertCurrent();
    const endpointId = await platform.hash(`expo:${token}`);
    if (previous && previous.endpointId !== endpointId) await removeId(previous.endpointId);
    assertCurrent();
    // Keep removal evidence before enrolling. A storage failure must not create
    // an install that this app cannot later inspect or turn off.
    await platform.save({ endpointId, token });
    assertCurrent();
    await request("/api/turn-notifications/device", {
      method: "POST",
      json: { transport: "expo", token, generation },
    });
    assertCurrent();
  }
  return {
    async preference() {
      assertCurrent();
      return request<{ enabled: boolean }>("/api/turn-notifications/preference");
    },
    async setPreference(enabled: boolean) {
      assertCurrent();
      const result = await request<{ enabled: boolean }>("/api/turn-notifications/preference", {
        method: "PUT",
        json: { enabled },
      });
      if (!result.enabled) await platform.dismiss();
      return result;
    },
    async inspect(): Promise<DeviceState> {
      const reason = platform.unavailable();
      if (reason) return { state: "unavailable", generation: 0, reason };
      const install = await platform.read();
      const permission = await platform.permission(false);
      const server = await status(install?.endpointId);
      const matchingToken =
        permission.allowed && install && server.registered
          ? (await platform.token()) === install.token
          : false;
      return {
        state: matchingToken
          ? "ready"
          : !permission.allowed && !permission.canAskAgain
            ? "blocked"
            : "not-enabled",
        generation: server.generation,
        removable: server.registered,
      };
    },
    async enable(generation: number) {
      assertCurrent();
      const reason = platform.unavailable();
      if (reason) throw new Error(reason);
      // Called only by an explicit device action, not the account switch or inspection.
      const permission = await platform.permission(true);
      if (!permission.allowed)
        throw new Error("Allow notifications in system settings, then try again.");
      const previous = await platform.read();
      await enroll(generation, await platform.token(), previous);
    },
    async remove() {
      const install = await platform.read();
      if (!install) throw new Error("No device registration to remove.");
      await removeId(install.endpointId);
      assertCurrent();
      await platform.save(null);
      await platform.dismiss();
    },
    async refreshToken() {
      if (platform.unavailable()) return;
      const previous = await platform.read();
      if (!previous) return;
      const server = await status(previous.endpointId);
      // Never revive an enrollment after consent-off, device removal, or session replacement.
      if (!server.registered || !(await platform.permission(false)).allowed) return;
      const token = await platform.token();
      // Expo normally keeps its token stable while updating the native FCM/APNs mapping.
      // If the Expo address itself changed, retire it and require explicit device consent
      // rather than risking an automatic re-enrollment racing device-off on another view.
      if (token !== previous.token) await removeId(previous.endpointId);
    },
  };
}

export type TurnDevice = ReturnType<typeof createTurnDevice>;
