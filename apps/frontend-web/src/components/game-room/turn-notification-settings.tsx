import { useEffect, useRef, useState } from "react";
import type { DeviceState, TurnNotificationDevice } from "./turn-notification-device";

export type TurnNotificationPreference = {
  load: () => Promise<boolean>;
  save: (enabled: boolean) => Promise<boolean>;
  device?: TurnNotificationDevice;
};

export function TurnNotificationSettings({
  preference,
}: {
  preference: TurnNotificationPreference;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deviceState, setDeviceState] = useState<DeviceState>("not-enabled");
  const [removable, setRemovable] = useState(false);
  const [deviceReason, setDeviceReason] = useState("");
  const [deviceError, setDeviceError] = useState(false);
  const [retryInspection, setRetryInspection] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [checkingDevice, setCheckingDevice] = useState(false);
  const deviceRevision = useRef(0);
  const deviceActionInProgress = useRef(false);
  const deviceButton = useRef<HTMLButtonElement>(null);
  const accountSwitch = useRef<HTMLButtonElement>(null);
  const returnFocusToSwitch = useRef(false);
  const revision = useRef(0);
  const saveInProgress = useRef(false);

  useEffect(() => {
    let active = true;
    function refresh() {
      if (saveInProgress.current) return;
      const currentRevision = ++revision.current;
      preference.load().then(
        (value) => {
          if (active && currentRevision === revision.current) {
            setEnabled(value);
            setMessage("");
          }
        },
        () => {
          if (active && currentRevision === revision.current) {
            setEnabled(null);
            setMessage("Could not load your preference. Close and reopen settings to retry.");
          }
        },
      );
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, [preference]);

  useEffect(() => {
    if (!enabled || !preference.device) {
      ++deviceRevision.current;
      setDeviceState("not-enabled");
      setRemovable(false);
      setCheckingDevice(false);
      return;
    }
    let active = true;
    function refreshDevice() {
      if (deviceActionInProgress.current) return;
      const current = ++deviceRevision.current;
      setCheckingDevice(true);
      preference.device!.inspect().then(
        (result) => {
          if (!active || current !== deviceRevision.current) return;
          setCheckingDevice(false);
          setDeviceState(result.state);
          setRemovable(result.removable ?? false);
          setDeviceReason(result.reason ?? "");
          setGeneration(result.generation);
          setDeviceError(false);
          setRetryInspection(false);
        },
        () => {
          if (active && current === deviceRevision.current) {
            setCheckingDevice(false);
            setDeviceState("not-enabled");
            setDeviceError(true);
            setRetryInspection(true);
            setMessage("Could not check this device. Retry to check again.");
          }
        },
      );
    }
    refreshDevice();
    window.addEventListener("focus", refreshDevice);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshDevice);
    };
  }, [enabled, preference]);

  useEffect(() => {
    if (returnFocusToSwitch.current && deviceState === "blocked" && !removable) {
      accountSwitch.current?.focus();
      returnFocusToSwitch.current = false;
    }
  }, [deviceState, removable]);

  async function changeDevice(action: "enable" | "remove" | "retry") {
    if (!preference.device || deviceBusy || checkingDevice) return;
    deviceActionInProgress.current = true;
    if (action === "retry") {
      setDeviceBusy(true);
      setMessage("Checking this device…");
      try {
        const state = await preference.device.inspect();
        setDeviceState(state.state);
        setRemovable(state.removable ?? false);
        setDeviceReason(state.reason ?? "");
        setGeneration(state.generation);
        setDeviceError(false);
        setRetryInspection(false);
        setMessage(
          `This device: ${state.state === "ready" ? "Ready" : state.state === "blocked" ? "Blocked" : state.state === "unavailable" ? "Unavailable" : "Not enabled"}.`,
        );
      } catch {
        setMessage("Could not check this device. Retry to check again.");
      } finally {
        deviceActionInProgress.current = false;
        setDeviceBusy(false);
        deviceButton.current?.focus();
      }
      return;
    }
    setDeviceBusy(true);
    setMessage(action === "enable" ? "Setting up this device…" : "Removing this device…");
    try {
      if (action === "enable") await preference.device.enable(generation);
      else await preference.device.remove();
      const state = await preference.device.inspect();
      setDeviceState(state.state);
      setRemovable(state.removable ?? false);
      if (state.state === "blocked" && !state.removable) returnFocusToSwitch.current = true;
      setDeviceReason(state.reason ?? "");
      setGeneration(state.generation);
      setDeviceError(false);
      setRetryInspection(false);
      setMessage(
        action === "enable" && state.state === "ready"
          ? "This device is Ready. Delivery is not guaranteed."
          : "This device was removed. Your account preference is unchanged.",
      );
    } catch {
      if (
        action === "enable" &&
        typeof Notification !== "undefined" &&
        Notification.permission === "denied"
      ) {
        setDeviceState("blocked");
        returnFocusToSwitch.current = true;
        setMessage("Notifications are Blocked. Change browser permission to try again.");
      } else {
        if (action === "enable") setDeviceState("not-enabled");
        setDeviceError(true);
        setRetryInspection(false);
        setMessage(
          action === "enable"
            ? "Could not set up this device. Retry to try again."
            : "Could not confirm device removal. Try removing it again.",
        );
      }
    } finally {
      deviceActionInProgress.current = false;
      setDeviceBusy(false);
      deviceButton.current?.focus();
    }
  }

  async function toggle() {
    if (enabled === null || saving || deviceBusy) return;
    ++revision.current;
    saveInProgress.current = true;
    setSaving(true);
    setMessage("Saving your account preference…");
    try {
      const saved = await preference.save(!enabled);
      if (saved !== !enabled) throw new Error("Unexpected saved preference");
      setEnabled(saved);
      setMessage(
        `Turn notifications ${saved ? "on" : "off"} for your account. ${saved ? "Set up this device separately." : "All device enrollments were removed."}`,
      );
    } catch {
      setEnabled(null);
      setMessage(
        "Could not confirm the save. Close and reopen settings to check your account preference.",
      );
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="turn-notification-settings" aria-label="Turn notification settings">
      <div className="turn-notification-row">
        <div>
          <strong>Turn notifications</strong>
          <p>
            For your turns in online rooms you aren’t actively viewing. Applies across your account.
          </p>
        </div>
        <button
          ref={accountSwitch}
          type="button"
          role="switch"
          aria-label="Turn notifications for my account"
          aria-checked={enabled === true}
          disabled={enabled === null || saving || deviceBusy}
          onClick={() => void toggle()}
          className="turn-notification-switch"
        >
          {enabled === null
            ? message.startsWith("Could not")
              ? "Unknown"
              : "Loading"
            : enabled
              ? "On"
              : "Off"}
        </button>
      </div>
      <p role="status" aria-live="polite" className="turn-notification-feedback">
        {message ||
          (enabled === null
            ? "Loading account preference…"
            : `Account preference: ${enabled ? "On" : "Off"}`)}
      </p>
      <div className="turn-notification-device" aria-label="This device">
        <strong>
          {deviceState === "ready"
            ? "Ready on this device"
            : deviceState === "blocked"
              ? "Blocked on this device"
              : deviceState === "unavailable"
                ? "Unavailable on this device"
                : "Not enabled on this device"}
        </strong>
        <p>
          {enabled
            ? deviceReason ||
              (deviceState === "ready"
                ? "Setup completed; delivery is not guaranteed."
                : deviceState === "blocked"
                  ? "Allow notifications in your browser settings before retrying. No permission prompt will open here."
                  : "Account consent is saved, but this device has not been set up. No alerts will arrive here yet.")
            : "First choose for your account. Setting up each device is a separate step; no permission is requested here."}
        </p>
        {enabled &&
          preference.device &&
          (deviceState === "ready" ||
            deviceState === "not-enabled" ||
            (deviceState === "blocked" && removable)) && (
            <button
              ref={deviceButton}
              type="button"
              className="table-small-button turn-notification-device-button"
              disabled={saving}
              aria-disabled={deviceBusy || checkingDevice}
              onClick={() =>
                void changeDevice(
                  deviceState === "ready" || (deviceState === "blocked" && removable)
                    ? "remove"
                    : retryInspection
                      ? "retry"
                      : "enable",
                )
              }
            >
              {deviceState === "ready" || (deviceState === "blocked" && removable)
                ? "Remove this device"
                : deviceError
                  ? "Retry device setup"
                  : "Enable on this device"}
            </button>
          )}
      </div>
    </section>
  );
}
