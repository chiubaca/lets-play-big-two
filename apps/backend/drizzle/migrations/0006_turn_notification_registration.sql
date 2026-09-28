ALTER TABLE `turnNotificationPreference` ADD COLUMN `generation` integer NOT NULL DEFAULT 0;
CREATE TABLE `turnNotificationRegistration` (
  `endpoint_id` text PRIMARY KEY NOT NULL,
  `endpoint` text NOT NULL,
  `p256dh` text NOT NULL,
  `auth` text NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `session_id` text NOT NULL REFERENCES `session`(`id`) ON DELETE CASCADE,
  `generation` integer NOT NULL
);
CREATE INDEX `turn_registration_user_idx` ON `turnNotificationRegistration` (`user_id`);
