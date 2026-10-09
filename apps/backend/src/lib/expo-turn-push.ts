import { z } from "zod";
import { mintTurnTicket } from "./turn-ticket";
import type { RegisteredEndpoint } from "./turn-push";

export const expoTokenSchema = z
  .string()
  .max(256)
  .regex(/^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/);

// A namespaced address, not a fetchable URL. Both transports share enrollment/revocation.
export const expoEndpoint = (token: string) => `expo:${token}`;

const receiptSchema = z.object({
  status: z.enum(["ok", "error"]),
  id: z.string().max(128).optional(),
  details: z.object({ error: z.string() }).optional(),
});

function headers(env: Env) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
  };
}

async function providerJSON(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty push response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65_536) {
      await reader.cancel();
      throw new Error("Push response too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // JSON parse errors can quote provider payloads; never propagate those into cron logs.
    throw new Error("Invalid push response");
  }
}

export async function retireExpoEnrollment(
  env: Env,
  enrollment: Pick<RegisteredEndpoint, "endpoint_id" | "enrollment_id">,
) {
  await env.BIG_TWO_DB.prepare(
    "DELETE FROM turnNotificationRegistration WHERE endpoint_id = ? AND enrollment_id = ?",
  )
    .bind(enrollment.endpoint_id, enrollment.enrollment_id)
    .run();
}

export async function sendExpoTurnPush(
  env: Env,
  registration: RegisteredEndpoint,
  notice: { roomId: string; turnId: string; endpointId: string },
  deadline: number,
  stillEligible: () => Promise<boolean>,
): Promise<"sent" | "retired" | "retry"> {
  const token = expoTokenSchema.safeParse(registration.endpoint.slice(5));
  if (!token.success) return "retired";
  // Reuse the existing return-ticket secret; native delivery does not need Web Push encryption.
  if (!env.VAPID_PRIVATE_KEY) return "retry";
  const owner = await env.BIG_TWO_DB.prepare(
    "SELECT user_id FROM turnNotificationRegistration WHERE endpoint_id = ? AND enrollment_id = ?",
  )
    .bind(registration.endpoint_id, registration.enrollment_id)
    .first<{ user_id: string }>();
  if (!owner) return "retired";
  const ticket = await mintTurnTicket(env.VAPID_PRIVATE_KEY, notice.roomId, owner.user_id, {
    endpoint_id: registration.endpoint_id,
    session_id: registration.session_id,
    generation: registration.generation,
    enrollment_id: registration.enrollment_id,
  });
  if (Date.now() >= deadline || !(await stillEligible()) || Date.now() >= deadline)
    return "retired";
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: headers(env),
    // Workers rejects "error"; manual redirects fail closed below without forwarding credentials.
    redirect: "manual",
    signal: AbortSignal.timeout(Math.min(5000, Math.max(1, deadline - Date.now()))),
    body: JSON.stringify({
      to: token.data,
      title: "Big Two Crew",
      body: "It’s your turn. Open your table to play.",
      data: { ...notice, ticket },
      channelId: "turns",
      sound: "default",
      priority: "high",
      ttl: Math.max(0, Math.floor((deadline - Date.now()) / 1000)),
      collapseId: `${notice.roomId}:${notice.turnId}`,
      tag: `${notice.roomId}:${notice.turnId}`,
    }),
  });
  if (!response.ok)
    return response.status === 408 || response.status === 429 || response.status >= 500
      ? "retry"
      : "retired";
  const parsed = z.object({ data: receiptSchema }).safeParse(await providerJSON(response));
  if (!parsed.success) return "retry";
  const result = parsed.data.data;
  if (result.status === "error") {
    if (result.details?.error === "DeviceNotRegistered")
      await retireExpoEnrollment(env, registration);
    return result.details?.error === "MessageRateExceeded" ? "retry" : "retired";
  }
  if (!result.id) return "retry";
  await env.BIG_TWO_DB.prepare(`INSERT INTO turnPushReceipt (id, endpoint_id, enrollment_id, check_at, expires_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(
      result.id,
      registration.endpoint_id,
      registration.enrollment_id,
      Date.now() + 15 * 60_000,
      Date.now() + 24 * 60 * 60_000,
    )
    .run();
  return "sent";
}

// Existing minute cron checks accepted pushes, even after their Turn has ended.
export async function checkExpoTurnReceipts(env: Env): Promise<void> {
  await env.BIG_TWO_DB.prepare("DELETE FROM turnPushReceipt WHERE expires_at <= ?")
    .bind(Date.now())
    .run();
  const { results } = await env.BIG_TWO_DB.prepare(
    "SELECT id, endpoint_id, enrollment_id FROM turnPushReceipt WHERE check_at <= ? ORDER BY check_at LIMIT 100",
  )
    .bind(Date.now())
    .all<{ id: string; endpoint_id: string; enrollment_id: string }>();
  if (!results.length) return;
  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: headers(env),
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ ids: results.map(({ id }) => id) }),
  });
  if (!response.ok) return;
  const parsed = z
    .object({ data: z.record(z.string(), receiptSchema) })
    .safeParse(await providerJSON(response));
  if (!parsed.success) return;
  for (const row of results) {
    const receipt = parsed.data.data[row.id];
    if (!receipt) {
      await env.BIG_TWO_DB.prepare("UPDATE turnPushReceipt SET check_at = ? WHERE id = ?")
        .bind(Date.now() + 15 * 60_000, row.id)
        .run();
      continue;
    }
    if (receipt.details?.error === "DeviceNotRegistered") await retireExpoEnrollment(env, row);
    else if (receipt.status === "error") {
      // Only a fixed error code is logged, never a token, ticket or provider message.
      const code = [
        "InvalidCredentials",
        "MismatchSenderId",
        "MessageTooBig",
        "MessageRateExceeded",
      ].includes(receipt.details?.error ?? "")
        ? receipt.details!.error
        : "ProviderError";
      console.error(JSON.stringify({ message: "Expo turn push receipt failed", code }));
    }
    await env.BIG_TWO_DB.prepare("DELETE FROM turnPushReceipt WHERE id = ?").bind(row.id).run();
  }
}
