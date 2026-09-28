ALTER TABLE `turnNotificationRegistration` ADD COLUMN `enrollment_id` text NOT NULL DEFAULT '';
UPDATE `turnNotificationRegistration` SET `enrollment_id` = lower(hex(randomblob(16)));
