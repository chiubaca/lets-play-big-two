CREATE TABLE `turnNotificationPreference` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `enabled` integer NOT NULL DEFAULT 0
);
