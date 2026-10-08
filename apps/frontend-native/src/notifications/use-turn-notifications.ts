import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { authClient, type NativeSession } from "../network/auth-client";
import { useForeground } from "../network/use-foreground";
import { nativeTurnDevice, notificationRequest, pushPlatform } from "./native-push";
import { notificationRoom, notificationTicket } from "./turn-return";

const hidden = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
};

export function useTurnNotifications(
  session: NativeSession | null,
  pending: boolean,
  activeRoom: string | undefined,
  onRoom: (roomId: string) => void,
) {
  const foreground = useForeground();
  const sessionId = session?.session.id;
  const identity = useRef({ sessionId, pending, activeRoom });
  identity.current = { sessionId, pending, activeRoom };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const device = useMemo(
    () =>
      sessionId && !pending && Platform.OS !== "web"
        ? nativeTurnDevice(
            authClient.getCookie() ?? "",
            () =>
              mounted.current &&
              identity.current.sessionId === sessionId &&
              !identity.current.pending,
          )
        : null,
    [sessionId, pending],
  );

  const [ticket, setTicket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lastResponse = useRef<string | null>(null);
  const previousSession = useRef(sessionId);

  useEffect(() => {
    if (Platform.OS === "web") return;
    function receive(response: Notifications.NotificationResponse | null) {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
        return;
      const id = response.notification.request.identifier;
      if (lastResponse.current === id) return;
      lastResponse.current = id;
      const next = notificationTicket(response.notification.request.content.data);
      if (!next) return;
      setError(null);
      setTicket(next);
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }
    let current = true;
    let receivedLive = false;
    const listener = Notifications.addNotificationResponseReceivedListener((response) => {
      receivedLive = true;
      receive(response);
    });
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (current && !receivedLive) receive(response);
      })
      .catch(() => {});
    return () => {
      current = false;
      listener.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || pending) return;
    if (previousSession.current && previousSession.current !== sessionId) {
      void pushPlatform.dismiss().catch(() => {});
    }
    previousSession.current = sessionId;
  }, [sessionId, pending]);

  useEffect(() => {
    if (!device || !foreground) return;
    // Rotate only an already-live enrollment; these checks never ask for permission.
    void device.refreshToken().catch(() => {});
    const listener = Notifications.addPushTokenListener(() => {
      void device.refreshToken().catch(() => {});
    });
    return () => listener.remove();
  }, [device, foreground]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const request = notificationRequest(authClient.getCookie() ?? "");
    Notifications.setNotificationHandler({
      async handleNotification(notification) {
        const data = notification.request.content.data ?? {};
        if (
          !sessionId ||
          pending ||
          identity.current.sessionId !== sessionId ||
          identity.current.pending ||
          !notificationTicket(data) ||
          typeof data.roomId !== "string" ||
          !/^[A-Z0-9]{5}$/.test(data.roomId) ||
          identity.current.activeRoom === data.roomId ||
          typeof data.turnId !== "string" ||
          !/^[a-f0-9-]{36}$/.test(data.turnId) ||
          typeof data.endpointId !== "string" ||
          !/^[a-f0-9]{64}$/.test(data.endpointId)
        )
          return hidden;
        // React Native's AbortSignal polyfill does not provide AbortSignal.timeout.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        try {
          const result = await request<{ eligible: boolean }>(
            `/api/turn-notifications/check?roomId=${data.roomId}&turnId=${data.turnId}&endpointId=${data.endpointId}`,
            { signal: controller.signal },
          );
          const show =
            result.eligible &&
            identity.current.sessionId === sessionId &&
            !identity.current.pending &&
            identity.current.activeRoom !== data.roomId;
          return { ...hidden, shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show };
        } catch {
          return hidden;
        } finally {
          clearTimeout(timer);
        }
      },
    });
    return () => Notifications.setNotificationHandler(null);
  }, [sessionId, pending]);

  useEffect(() => {
    if (!ticket || !sessionId || pending || !foreground) return;
    let current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const request = notificationRequest(authClient.getCookie() ?? "");
    setError(null);
    void request<{ allowed: boolean; target?: string; missing?: boolean }>(
      `/api/turn-notifications/return?ticket=${encodeURIComponent(ticket)}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!current || identity.current.sessionId !== sessionId || identity.current.pending)
          return;
        const roomId = notificationRoom(result);
        setTicket(null);
        onRoom(roomId);
      })
      .catch((cause) => {
        if (current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not verify this notification. Try again.",
          );
      })
      .finally(() => clearTimeout(timer));
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [ticket, sessionId, pending, foreground, onRoom, attempt]);

  const close = useCallback(() => {
    setTicket(null);
    setError(null);
  }, []);
  return {
    device,
    returning: !!ticket,
    error,
    retry: () => setAttempt((value) => value + 1),
    close,
  };
}
