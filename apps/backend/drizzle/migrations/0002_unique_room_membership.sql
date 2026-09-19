CREATE UNIQUE INDEX `users_to_rooms_user_room_unique`
ON `usersToRooms` (`user_id`, `room_id`);
