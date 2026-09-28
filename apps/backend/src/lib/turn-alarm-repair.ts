// Alarms can fail to schedule after the game commit. A sweep wakes persisted intents,
// never infers a new Turn from a snapshot. Each room only drains bounded work in its own alarm.
export async function repairTurnAlarms(env: Env): Promise<void> {
  let cursor = "";
  while (true) {
    const rows = await env.BIG_TWO_DB.prepare(
      "SELECT id FROM room WHERE id > ? AND status <> 'expiring' ORDER BY id LIMIT 50",
    )
      .bind(cursor)
      .all<{ id: string }>();
    if (!rows.results.length) return;
    for (const { id } of rows.results) {
      try {
        await env.BIG_TWO_ROOM_DURABLE_OBJECT.getByName(id).repairFirstTurn(id);
      } catch (error) {
        console.error("Turn alarm repair failed", id, error);
      }
    }
    cursor = rows.results.at(-1)!.id;
  }
}
