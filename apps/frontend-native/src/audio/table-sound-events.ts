export type TableSound = "select" | "deselect" | "play" | "deal" | "turn";

export type TableAudioFrame = {
  identity: string;
  ready: boolean;
  state: string;
  yourTurn: boolean;
  turnKey: string;
  pileLength: number;
  lastPlayKey: string;
  lastPlaySize: number;
};

// Compare confirmed snapshots, never button presses or render counts.
export function tableSoundEvents(
  previous: TableAudioFrame | undefined,
  current: TableAudioFrame,
): TableSound[] {
  if (!previous || previous.identity !== current.identity || !previous.ready || !current.ready)
    return [];

  const sounds: TableSound[] = [];
  const dealt =
    current.state === "ROUND_FIRST_MOVE" &&
    current.pileLength === 0 &&
    (previous.state === "WAITING_FOR_PLAYERS" ||
      previous.state === "GAME_END" ||
      previous.pileLength > 0);
  if (dealt) sounds.push("deal");
  else if (
    current.lastPlaySize > 0 &&
    current.pileLength === previous.pileLength + 1 &&
    current.lastPlayKey !== previous.lastPlayKey
  )
    sounds.push("play");

  if (current.yourTurn && (!previous.yourTurn || previous.turnKey !== current.turnKey))
    sounds.push("turn");
  return sounds;
}
