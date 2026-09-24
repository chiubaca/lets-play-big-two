import { customAlphabet } from "nanoid";

export const createRoomCode = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 5);
