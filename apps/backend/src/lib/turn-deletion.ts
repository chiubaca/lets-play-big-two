// Mark the account ineligible before the slower room-redaction workflow. Keep the marker
// and registration cleanup in one D1 transaction so a concurrent enrollment cannot survive.
export async function revokeTurnsForDeletion(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db
      .prepare("INSERT INTO accountDeletion (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING")
      .bind(userId),
    db.prepare("DELETE FROM turnNotificationRegistration WHERE user_id = ?").bind(userId),
  ]);
}
