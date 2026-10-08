CREATE TABLE `turnPushReceipt` (
  `id` text PRIMARY KEY NOT NULL,
  `endpoint_id` text NOT NULL REFERENCES `turnNotificationRegistration` (`endpoint_id`) ON DELETE CASCADE,
  `enrollment_id` text NOT NULL,
  `check_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);
CREATE INDEX `turn_push_receipt_check_idx` ON `turnPushReceipt` (`check_at`);
