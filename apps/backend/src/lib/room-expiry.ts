// Legacy rows have no creation timestamp. On rollout they have no inferred grace period.
export async function sweepRooms(env: Env): Promise<void> {
  let cursor = "";
  while (true) {
    const rows = await env.BIG_TWO_DB.prepare(
      "SELECT id FROM room WHERE id > ? AND (status = 'expiring' OR created_at IS NULL OR expires_at IS NULL OR expires_at <= ?) ORDER BY id LIMIT 50",
    )
      .bind(cursor, Date.now())
      .all<{ id: string }>();
    if (!rows.results.length) return;
    for (const { id } of rows.results) {
      // One room failing must not prevent later rooms from being considered; the next cron retries it.
      try {
        await env.BIG_TWO_ROOM_DURABLE_OBJECT.getByName(id).reconcileExpiry(id);
      } catch (error) {
        console.error("Room expiry failed", id, error);
      }
    }
    cursor = rows.results.at(-1)!.id;
  }
}
