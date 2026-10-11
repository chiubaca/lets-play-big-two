import type { AudioSource } from "expo-audio";
import type { TableSound } from "./table-sound-events";

export const tablePlaySources = [
  require("../../assets/sounds/card-place-1.wav"),
  require("../../assets/sounds/card-place-2.wav"),
  require("../../assets/sounds/card-place-3.wav"),
  require("../../assets/sounds/card-place-4.wav"),
] as const satisfies readonly AudioSource[];

export const tableSounds: Record<TableSound, { source: AudioSource; volume: number }> = {
  select: { source: require("../../assets/sounds/card-select.wav"), volume: 0.22 },
  deselect: { source: require("../../assets/sounds/card-deselect.wav"), volume: 0.18 },
  play: { source: tablePlaySources[0], volume: 0.38 },
  deal: { source: require("../../assets/sounds/card-deal.wav"), volume: 0.28 },
  turn: { source: require("../../assets/sounds/bell2.mp3"), volume: 0.32 },
};
