ALTER TABLE `room` ADD COLUMN `created_at` integer;
ALTER TABLE `room` ADD COLUMN `expires_at` integer;
ALTER TABLE `room` ADD COLUMN `empty_since` integer;
ALTER TABLE `room` ADD COLUMN `visited` integer NOT NULL DEFAULT 0;
CREATE TABLE `retiredRoomCode` (`id` text PRIMARY KEY NOT NULL);
CREATE TRIGGER `room_code_not_retired` BEFORE INSERT ON `room`
WHEN EXISTS (SELECT 1 FROM `retiredRoomCode` WHERE `id` = NEW.`id`)
BEGIN SELECT RAISE(IGNORE); END;
CREATE INDEX `room_expiry_idx` ON `room` (`expires_at`);
