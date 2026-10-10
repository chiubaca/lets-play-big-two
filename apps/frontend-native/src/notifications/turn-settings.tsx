import { useEffect, useRef, useState } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Linking, Switch, View } from "react-native";
import { useForeground } from "../network/use-foreground";
import { Button, ErrorMessage, Label, styles } from "../ui/primitives";
import { colors } from "../ui/theme";
import type { TurnDevice } from "./turn-device";
import { queryKeys, useQueryAccess } from "../network/query-client";

type SettingsAction =
  | { type: "preference"; enabled: boolean }
  | { type: "enable"; generation: number }
  | { type: "remove" };

export function TurnNotificationSettings({ device }: { device: TurnDevice }) {
  const foreground = useForeground();
  const access = useQueryAccess();
  const client = useQueryClient();
  const enabled = foreground && access.authenticated;
  const active = useRef(enabled);
  active.current = enabled;
  const preferenceKey = queryKeys.turnPreference(access.scope);
  const deviceKey = queryKeys.turnDevice(access.scope, access.sessionId);
  const preference = useQuery({
    queryKey: preferenceKey,
    enabled,
    queryFn: ({ signal }) => {
      access.assertCurrent();
      return device.preference(signal);
    },
  });
  const inspection = useQuery({
    queryKey: deviceKey,
    enabled,
    gcTime: 0,
    queryFn: ({ signal }) => {
      access.assertCurrent();
      return device.inspect(signal);
    },
  });
  const [error, setError] = useState<string | null>(null);
  const loadError = preference.error || inspection.error;
  useEffect(() => {
    if (!enabled) {
      void client.cancelQueries({ queryKey: queryKeys.turnPreference(access.scope) });
      void client.cancelQueries({ queryKey: queryKeys.turnDevice(access.scope, access.sessionId) });
    }
  }, [client, enabled, access.scope, access.sessionId]);
  const refresh = async () => {
    if (!active.current || !access.isCurrent()) return;
    await Promise.all([
      client.invalidateQueries({ queryKey: preferenceKey }),
      client.invalidateQueries({ queryKey: deviceKey }),
    ]);
  };

  const mutationKey = [...access.scope, "turn-notifications", "change", access.sessionId];
  const changeMutation = useMutation({
    mutationKey,
    mutationFn: async (action: SettingsAction) => {
      access.assertCurrent();
      if (!active.current) throw new Error("Open the app to change notification settings.");
      if (action.type === "preference") await device.setPreference(action.enabled);
      else if (action.type === "enable") await device.enable(action.generation);
      else await device.remove();
    },
    // Reinspect even after an uncertain failure. Never optimistically show Ready.
    onSettled: refresh,
  });
  const busy = useIsMutating({ mutationKey, exact: true }) > 0;
  const checking = preference.fetchStatus !== "idle" || inspection.fetchStatus !== "idle";
  const settings =
    !busy && !checking && !loadError && preference.data && inspection.data
      ? { enabled: preference.data.enabled, device: inspection.data }
      : null;
  const message =
    error ??
    changeMutation.error?.message ??
    (loadError ? "Could not load notification settings. Try again." : null);
  async function change(action: SettingsAction) {
    setError(null);
    try {
      await changeMutation.mutateAsync(action);
    } catch {
      /* The mutation retains its error after authoritative reinspection. */
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
          disabled={!settings || busy || !enabled}
          onValueChange={(enabled) => void change({ type: "preference", enabled })}
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
              disabled={busy || !enabled}
              onPress={() =>
                void change({ type: "enable", generation: settings.device.generation })
              }
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
              disabled={busy || !enabled}
              onPress={() => void change({ type: "remove" })}
            />
          )}
        </>
      )}
      <ErrorMessage message={message} />
      {message && (
        <Button
          title="Check notification settings again"
          disabled={busy}
          onPress={() => {
            setError(null);
            changeMutation.reset();
            void refresh();
          }}
        />
      )}
    </View>
  );
}
