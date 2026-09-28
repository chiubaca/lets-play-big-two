import { useEffect, useRef, useState } from "react";

export type TurnNotificationPreference = {
  load: () => Promise<boolean>;
  save: (enabled: boolean) => Promise<boolean>;
};

export function TurnNotificationSettings({
  preference,
}: {
  preference: TurnNotificationPreference;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
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

  async function toggle() {
    if (enabled === null || saving) return;
    ++revision.current;
    saveInProgress.current = true;
    setSaving(true);
    setMessage("Saving your account preference…");
    try {
      const saved = await preference.save(!enabled);
      if (saved !== !enabled) throw new Error("Unexpected saved preference");
      setEnabled(saved);
      setMessage(
        `Turn notifications ${saved ? "on" : "off"} for your account. This device is not enabled.`,
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
          type="button"
          role="switch"
          aria-label="Turn notifications for my account"
          aria-checked={enabled === true}
          disabled={enabled === null || saving}
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
        <strong>Not enabled on this device</strong>
        <p>
          {enabled
            ? "Account consent is saved, but this device has not been set up. No alerts will arrive here yet."
            : "First choose for your account. Setting up each device is a separate step; no permission is requested here."}
        </p>
      </div>
    </section>
  );
}
