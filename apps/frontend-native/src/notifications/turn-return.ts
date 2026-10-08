export function notificationTicket(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("ticket" in data)) return null;
  return typeof data.ticket === "string" && /^[A-Za-z0-9_-]{30,500}$/.test(data.ticket)
    ? data.ticket
    : null;
}

export function notificationRoom(result: {
  allowed: boolean;
  target?: string;
  missing?: boolean;
}): string {
  if (!result.allowed)
    throw new Error(
      "Sign in with the account that received this notification, or open your table from the lobby.",
    );
  if (result.missing) throw new Error("This table is no longer available.");
  const match = result.target?.match(/^\/room\/([A-Z0-9]{5})$/);
  if (!match) throw new Error("Could not verify this notification.");
  return match[1];
}
