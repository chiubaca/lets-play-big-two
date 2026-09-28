// Only the backend can mint a return ticket. Its URL contains no room or Player identifier.
import type { Enrollment } from "./turn-push";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function key(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`turn-return-v1:${secret}`),
  );
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function mintTurnTicket(
  secret: string,
  roomId: string,
  userId: string,
  enrollment: Enrollment,
): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const content = encoder.encode(JSON.stringify({ roomId, userId, enrollment }));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, await key(secret), content),
  );
  const ticket = new Uint8Array(nonce.length + ciphertext.length);
  ticket.set(nonce);
  ticket.set(ciphertext, nonce.length);
  return base64url(ticket);
}

export async function readTurnTicket(
  secret: string,
  ticket: string,
): Promise<{ roomId: string; userId: string; enrollment: Enrollment } | null> {
  if (!secret || !/^[A-Za-z0-9_-]{30,500}$/.test(ticket)) return null;
  try {
    const bytes = Uint8Array.from(atob(ticket.replace(/-/g, "+").replace(/_/g, "/")), (char) =>
      char.charCodeAt(0),
    );
    const data: unknown = JSON.parse(
      decoder.decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: bytes.slice(0, 12) },
          await key(secret),
          bytes.slice(12),
        ),
      ),
    );
    if (
      !data ||
      typeof data !== "object" ||
      !("roomId" in data) ||
      !("userId" in data) ||
      !("enrollment" in data)
    )
      return null;
    const enrollment = data.enrollment;
    return typeof data.roomId === "string" &&
      /^[A-Z0-9]{5}$/.test(data.roomId) &&
      typeof data.userId === "string" &&
      enrollment !== null &&
      typeof enrollment === "object" &&
      "endpoint_id" in enrollment &&
      typeof enrollment.endpoint_id === "string" &&
      /^[a-f0-9]{64}$/.test(enrollment.endpoint_id) &&
      "session_id" in enrollment &&
      typeof enrollment.session_id === "string" &&
      "generation" in enrollment &&
      typeof enrollment.generation === "number" &&
      Number.isSafeInteger(enrollment.generation) &&
      enrollment.generation >= 0 &&
      "enrollment_id" in enrollment &&
      typeof enrollment.enrollment_id === "string" &&
      /^(?:[a-f0-9]{32}|[a-f0-9-]{36})$/.test(enrollment.enrollment_id)
      ? { roomId: data.roomId, userId: data.userId, enrollment: enrollment as Enrollment }
      : null;
  } catch {
    return null;
  }
}
