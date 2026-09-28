CREATE TABLE `turnAlarmRepairCursor` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `after_room_id` text NOT NULL DEFAULT ''
);
INSERT INTO `turnAlarmRepairCursor` (`id`, `after_room_id`) VALUES (1, '');
