// Alarms can fail to schedule after the game commit. A sweep wakes persisted intents,
// never infers a new Turn from a snapshot. Each room only drains bounded work in its own alarm.
export async function repairTurnAlarms(env: Env): Promise<void> {
  // Persist the cursor so a large room set cannot starve rooms after the first page.
  const cursor = await env.BIG_TWO_DB.prepare(
    "SELECT after_room_id FROM turnAlarmRepairCursor WHERE id = 1",
  ).first<{ after_room_id: string }>();
  const rows = await env.BIG_TWO_DB.prepare(
    "SELECT id FROM room WHERE id > ? AND status <> 'expiring' ORDER BY id LIMIT 40",
  )
    .bind(cursor?.after_room_id ?? "")
    .all<{ id: string }>();
  for (const { id } of rows.results) {
    try {
      await env.BIG_TWO_ROOM_DURABLE_OBJECT.getByName(id).repairTurn(id);
    } catch (error) {
      console.error("Turn alarm repair failed", id, error);
    }
  }
  const next = rows.results.length === 40 ? rows.results.at(-1)!.id : "";
  await env.BIG_TWO_DB.prepare("UPDATE turnAlarmRepairCursor SET after_room_id = ? WHERE id = 1")
    .bind(next)
    .run();
}
