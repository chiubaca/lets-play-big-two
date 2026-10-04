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
            setMessage(
              "Could not load notification settings. Close and reopen settings to try again.",
            );
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
          if (
            document.activeElement === deviceButton.current &&
            (result.state === "unavailable" || (result.state === "blocked" && !result.removable))
          )
            returnFocusToSwitch.current = true;
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
            setMessage("Could not check this device. Try again.");
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
    if (
      returnFocusToSwitch.current &&
      (deviceState === "unavailable" || (deviceState === "blocked" && !removable))
    ) {
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
        if (state.state === "unavailable" || (state.state === "blocked" && !state.removable))
          returnFocusToSwitch.current = true;
        setDeviceReason(state.reason ?? "");
        setGeneration(state.generation);
        setDeviceError(false);
        setRetryInspection(false);
        setMessage(
          `Notifications on this device: ${state.state === "ready" ? "ready" : state.state === "blocked" ? "blocked" : state.state === "unavailable" ? "unavailable" : "not enabled"}.`,
        );
      } catch {
        setMessage("Could not check this device. Try again.");
      } finally {
        deviceActionInProgress.current = false;
        setDeviceBusy(false);
        deviceButton.current?.focus();
      }
      return;
    }
    setDeviceBusy(true);
    setMessage(
      action === "enable"
        ? "Setting up notifications…"
        : "Turning off notifications on this device…",
    );
    try {
      if (action === "enable") await preference.device.enable(generation);
      else await preference.device.remove();
      const state = await preference.device.inspect();
      setDeviceState(state.state);
      setRemovable(state.removable ?? false);
      if (state.state === "unavailable" || (state.state === "blocked" && !state.removable))
        returnFocusToSwitch.current = true;
      setDeviceReason(state.reason ?? "");
      setGeneration(state.generation);
      setDeviceError(false);
      setRetryInspection(false);
      setMessage(
        action === "enable"
          ? state.state === "ready"
            ? "Notifications are ready on this device."
            : "Could not confirm setup. Close and reopen settings to check this device."
          : "Notifications are off on this device. Your account setting is unchanged.",
      );
    } catch {
      if (
        action === "enable" &&
        typeof Notification !== "undefined" &&
        Notification.permission === "denied"
      ) {
        setDeviceState("blocked");
        returnFocusToSwitch.current = true;
        setMessage(
          "Notifications are blocked. Allow them in your browser settings, then try again.",
        );
      } else {
        if (action === "enable") setDeviceState("not-enabled");
        setDeviceError(true);
        setRetryInspection(false);
        setMessage(
          action === "enable"
            ? "Could not set up notifications on this device. Try again."
            : "Could not confirm that notifications are off on this device. Try turning them off again.",
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
    setMessage("Saving…");
    try {
      const saved = await preference.save(!enabled);
      if (saved !== !enabled) throw new Error("Unexpected saved preference");
      setEnabled(saved);
      setMessage(
        saved
          ? "Turn notifications are on for your account. Enable them on this device to receive alerts."
          : "Turn notifications are off for your account and all your devices.",
      );
    } catch {
      setEnabled(null);
      setMessage(
        "Could not confirm your changes. Close and reopen settings to check whether notifications are on.",
      );
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }

  const deviceEnabled = deviceState === "ready" || (deviceState === "blocked" && removable);
  const showDeviceRetry = deviceError && !deviceEnabled;

  return (
    <section className="turn-notification-settings" aria-label="Turn notification settings">
      <div className="turn-notification-row">
        <div>
          <strong>Turn notifications</strong>
          <p id="turn-notification-description">
            Get notified when it’s your turn in an online room you aren’t viewing. Turn this on for
            your account, then enable each device you want to receive alerts on.
          </p>
        </div>
        <button
          ref={accountSwitch}
          type="button"
          role="switch"
          aria-label="Turn notifications for my account"
          aria-describedby="turn-notification-description"
          aria-checked={enabled === true}
          disabled={enabled === null || saving || deviceBusy}
          onClick={() => void toggle()}
          className="table-setting-switch"
        />
      </div>
      <p role="status" aria-live="polite" className="turn-notification-feedback">
        {message ||
          (enabled === null
            ? "Loading notification settings…"
            : `Turn notifications are ${enabled ? "on" : "off"} for your account.`)}
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
                ? "This device is set up to receive alerts. Some notifications may not arrive."
                : deviceState === "blocked"
                  ? "Allow notifications in your browser settings, then return here to check again."
                  : "Enable notifications on this device to receive alerts. Your browser may ask for permission.")
            : "Turn on notifications for your account first, then enable them on this device. Turning on the account setting won’t ask for browser permission."}
        </p>
        {enabled &&
          preference.device &&
          (deviceState === "ready" ||
            deviceState === "not-enabled" ||
            (deviceState === "blocked" && removable)) && (
            <button
              ref={deviceButton}
              type="button"
              className={
                showDeviceRetry
                  ? "table-small-button turn-notification-device-button"
                  : "table-setting-switch turn-notification-device-switch"
              }
              role={showDeviceRetry ? "button" : "switch"}
              aria-label={
                deviceEnabled
                  ? "Turn off on this device"
                  : deviceError
                    ? "Retry device setup"
                    : "Enable on this device"
              }
              aria-checked={showDeviceRetry ? undefined : deviceEnabled}
              disabled={saving}
              aria-disabled={deviceBusy || checkingDevice}
              onClick={() =>
                void changeDevice(deviceEnabled ? "remove" : retryInspection ? "retry" : "enable")
              }
            >
              {showDeviceRetry ? "Retry device setup" : null}
            </button>
          )}
      </div>
    </section>
  );
}
