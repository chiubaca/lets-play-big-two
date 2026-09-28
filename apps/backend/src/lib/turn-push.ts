import { buildPushPayload } from "@block65/webcrypto-web-push";

export type Enrollment = {
  endpoint_id: string;
  session_id: string;
  generation: number;
  enrollment_id: string;
};

export type RegisteredEndpoint = Enrollment & {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export const MAX_TURN_INSTALLS = 8;

const liveEnrollment = `FROM turnNotificationRegistration r
  JOIN turnNotificationPreference p ON p.user_id = r.user_id
    AND p.enabled = 1 AND p.generation = r.generation
  JOIN session s ON s.id = r.session_id AND s.user_id = r.user_id AND s.expires_at > ?
  JOIN user u ON u.id = r.user_id
  WHERE r.user_id = ? AND NOT EXISTS
    (SELECT 1 FROM accountDeletion d WHERE d.user_id = r.user_id)`;

// Snapshot only already-consenting, enrolled, live sessions. Never expand this list on a retry.
export async function turnEnrollments(env: Env, userId: string): Promise<Enrollment[]> {
  const { results } = await env.BIG_TWO_DB.prepare(`
    SELECT r.endpoint_id, r.session_id, r.generation, r.enrollment_id
    ${liveEnrollment}
    ORDER BY r.endpoint_id LIMIT ${MAX_TURN_INSTALLS}
  `)
    .bind(Date.now(), userId)
    .all<Enrollment>();
  return results;
}

export async function registeredEndpoint(
  env: Env,
  userId: string,
  enrollment: Enrollment,
): Promise<RegisteredEndpoint | null> {
  return env.BIG_TWO_DB.prepare(`
    SELECT r.endpoint_id, r.endpoint, r.p256dh, r.auth, r.session_id, r.generation, r.enrollment_id
    ${liveEnrollment} AND r.endpoint_id = ? AND r.session_id = ? AND r.generation = ? AND r.enrollment_id = ?
  `)
    .bind(
      Date.now(),
      userId,
      enrollment.endpoint_id,
      enrollment.session_id,
      enrollment.generation,
      enrollment.enrollment_id,
    )
    .first<RegisteredEndpoint>();
}

export async function sendTurnPush(
  env: Env,
  registration: RegisteredEndpoint,
  notice: { roomId: string; turnId: string; endpointId: string },
  deadline: number,
  stillEligible: () => Promise<boolean>,
): Promise<"sent" | "retired" | "retry"> {
  if (Date.now() >= deadline) return "retired";
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) return "retry";
  // Endpoint is stored only after allowlist validation at enrollment. Never accept a URL from a push.
  const payload = await buildPushPayload(
    {
      data: JSON.stringify(notice),
    },
    {
      endpoint: registration.endpoint,
      expirationTime: null,
      keys: { p256dh: registration.p256dh, auth: registration.auth },
    },
    {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
  );
  if (Date.now() >= deadline || !(await stillEligible()) || Date.now() >= deadline)
    return "retired";
  const response = await fetch(registration.endpoint, {
    ...payload,
    // buildPushPayload substitutes 60 seconds for ttl: 0; use the actual remaining
    // lifetime after encryption and round down to avoid provider queuing past expiry.
    headers: {
      ...payload.headers,
      ttl: String(Math.max(0, Math.floor((deadline - Date.now()) / 1000))),
    },
    signal: AbortSignal.timeout(Math.min(5000, Math.max(1, deadline - Date.now()))),
  });
  if (response.ok) return "sent";
  if (response.status === 404 || response.status === 410) {
    await env.BIG_TWO_DB.prepare(
      "DELETE FROM turnNotificationRegistration WHERE endpoint_id = ? AND session_id = ? AND generation = ? AND enrollment_id = ?",
    )
      .bind(
        registration.endpoint_id,
        registration.session_id,
        registration.generation,
        registration.enrollment_id,
      )
      .run();
    return "retired";
  }
  return response.status === 408 || response.status === 429 || response.status >= 500
    ? "retry"
    : "retired";
}
