CREATE TABLE `accountDeletion` (
  `user_id` text PRIMARY KEY NOT NULL,
  `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
