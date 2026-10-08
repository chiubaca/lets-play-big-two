import { useEffect, useState } from "react";
import { Linking, Switch, View } from "react-native";
import { useForeground } from "../network/use-foreground";
import { Button, ErrorMessage, Label, styles } from "../ui/primitives";
import { colors } from "../ui/theme";
import type { DeviceState, TurnDevice } from "./turn-device";

export function TurnNotificationSettings({ device }: { device: TurnDevice }) {
  const foreground = useForeground();
  const [settings, setSettings] = useState<{ enabled: boolean; device: DeviceState } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!foreground) return;
    let current = true;
    setSettings(null);
    void Promise.all([device.preference(), device.inspect()])
      .then(([preference, inspected]) => {
        if (current) setSettings({ enabled: preference.enabled, device: inspected });
      })
      .catch(() => {
        if (current) setError("Could not load notification settings. Try again.");
      });
    return () => {
      current = false;
    };
  }, [device, foreground, revision]);

  async function change(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save notification settings.");
    } finally {
      // Never optimistically report Ready after an uncertain mutation.
      setSettings(null);
      setBusy(false);
      setRevision((value) => value + 1);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Label>Turn notifications</Label>
          <Label style={{ color: colors.muted, fontSize: 12 }}>
            Your account setting applies to all online rooms and devices.
          </Label>
        </View>
        <Switch
          accessibilityLabel="Turn notifications for my account"
          value={settings?.enabled ?? false}
          disabled={!settings || busy || !foreground}
          onValueChange={(enabled) => void change(() => device.setPreference(enabled))}
          trackColor={{ true: colors.goldDark }}
        />
      </View>
      <Label accessibilityLiveRegion="polite" style={{ color: colors.muted }}>
        {!settings
          ? "Checking notification settings…"
          : !settings.enabled
            ? "Off for your account and all your devices."
            : settings.device.state === "ready"
              ? "This device is set up to receive alerts. Delivery is best effort."
              : settings.device.state === "unavailable"
                ? settings.device.reason
                : settings.device.state === "blocked"
                  ? "Notifications are blocked in system settings."
                  : "Enable this device to receive alerts. Your phone may ask for permission."}
      </Label>
      {settings?.enabled && settings.device.state !== "unavailable" && (
        <>
          {settings.device.state !== "ready" && settings.device.state !== "blocked" && (
            <Button
              title="Enable notifications on this device"
              disabled={busy || !foreground}
              onPress={() => void change(() => device.enable(settings.device.generation))}
            />
          )}
          {settings.device.state === "blocked" && (
            <Button
              title="Open system settings"
              onPress={() =>
                void Linking.openSettings().catch(() => setError("Could not open system settings."))
              }
            />
          )}
          {settings.device.removable && (
            <Button
              title="Turn off notifications on this device"
              disabled={busy || !foreground}
              onPress={() => void change(() => device.remove())}
            />
          )}
        </>
      )}
      <ErrorMessage message={error} />
      {error && (
        <Button
          title="Check notification settings again"
          disabled={busy}
          onPress={() => {
            setError(null);
            setRevision((value) => value + 1);
          }}
        />
      )}
    </View>
  );
}
