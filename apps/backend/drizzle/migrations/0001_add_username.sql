ALTER TABLE `user` ADD `username` text;

UPDATE `user`
SET `username` = lower(`display_username`)
WHERE `username` IS NULL AND `display_username` IS NOT NULL;

CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);
