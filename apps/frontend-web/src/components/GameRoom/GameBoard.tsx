import { useContext } from "react";
import { GameRoomContext } from "./GameRoom.provider";
import { PlayerHand } from "./PlayerHand";
import { CardPile } from "./CardPile";
import { OpponentHand } from "./OpponentHand";
import { Crown, Wifi, WifiOff } from "lucide-react";
import type { BigTwoGameMachineSnapshot, Player } from "@big-two/game-state-machine";

type GameStatus =
  | "WAITING_FOR_PLAYERS"
  | "ROUND_FIRST_MOVE"
  | "NEXT_PLAYER_TURN"
  | "PLAY_NEW_ROUND"
  | "GAME_END";

function getPlayerFromSnapshot(
  snapshot: BigTwoGameMachineSnapshot | null,
  playerId: string,
): Player | undefined {
  return snapshot?.context?.players?.find((p: Player) => p.id === playerId);
}

export function GameBoard() {
  const { gameState, user, isConnected } = useContext(GameRoomContext);

  if (!gameState || !user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin h-8 w-8 border-4 border-[var(--lagoon)] border-t-transparent rounded-full" />
      </div>
    );
  }

  const gameStatus = gameState.value as GameStatus;
  const currentPlayerIndex = gameState.context.currentPlayerIndex;
  const players = gameState.context.players;
  const cardPile = gameState.context.cardPile;
  const lastPlayedCards = cardPile.length > 0 ? cardPile[cardPile.length - 1] : [];

  const myPlayer = getPlayerFromSnapshot(gameState, user.userId);
  const playerHand = myPlayer?.hand || [];
  const isCurrentPlayer = players[currentPlayerIndex]?.id === user.userId;

  const isWaitingForPlayers = gameStatus === "WAITING_FOR_PLAYERS";
  const isGameEnd = gameStatus === "GAME_END";
  const isRoundFirstMove = gameStatus === "ROUND_FIRST_MOVE";
  const isPlayNewRound = gameStatus === "PLAY_NEW_ROUND";

  const canPlay =
    isCurrentPlayer && (isRoundFirstMove || isPlayNewRound || gameStatus === "NEXT_PLAYER_TURN");
  const isHost = players[0]?.id === user.userId;
  const opponents = players.filter((p: Player) => p.id !== user.userId);

  const getCurrentPlayerName = () => {
    return players[currentPlayerIndex]?.name || "Unknown";
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="flex items-center justify-end gap-2 text-sm">
        {isConnected ? (
          <>
            <Wifi className="h-4 w-4 text-green-500" />
            <span className="text-muted-foreground">Connected</span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4 text-red-500" />
            <span className="text-muted-foreground">Reconnecting...</span>
          </>
        )}
      </div>

      {/* Waiting for Players */}
      {isWaitingForPlayers && (
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Waiting for Players</h2>
          <p className="text-muted-foreground">
            {players.length}/4 players joined. {4 - players.length} more needed.
          </p>
          <div className="flex justify-center gap-4">
            {players.map((player: Player, index: number) => (
              <div key={player.id} className="flex items-center gap-2 bg-card rounded-lg px-3 py-2">
                <span className="font-medium">{player.name}</span>
                {index === 0 && <Crown className="h-4 w-4 text-yellow-500" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game End */}
      {isGameEnd && (
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">
            {gameState.context.winner ? `${gameState.context.winner.name} wins!` : "Game Over"}
          </h2>
          <p className="text-muted-foreground">Congratulations!</p>
        </div>
      )}

      {/* Active Game */}
      {!isWaitingForPlayers && !isGameEnd && (
        <>
          {/* Opponents */}
          <div className="grid grid-cols-3 gap-4">
            {opponents.map((opponent: Player) => (
              <OpponentHand
                key={opponent.id}
                playerName={opponent.name}
                cardCount={opponent.hand.length}
                isCurrentPlayer={players[currentPlayerIndex]?.id === opponent.id}
                isHost={players[0]?.id === opponent.id}
              />
            ))}
          </div>

          {/* Center: Card Pile or Turn Indicator */}
          <div className="flex justify-center">
            {lastPlayedCards.length > 0 ? (
              <CardPile cards={lastPlayedCards} />
            ) : (
              <div className="text-center text-muted-foreground">
                <p>
                  {isRoundFirstMove || isPlayNewRound
                    ? "First move of the round"
                    : "Waiting for cards..."}
                </p>
              </div>
            )}
          </div>

          {/* Current Turn Indicator */}
          <div className="text-center">
            <p className="text-lg">
              {isCurrentPlayer ? (
                <span className="font-semibold text-[var(--lagoon)]">Your turn</span>
              ) : (
                <span>
                  <span className="font-medium">{getCurrentPlayerName()}</span>'s turn
                </span>
              )}
            </p>
          </div>

          {/* Player's Hand */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Your Hand</h3>
              {isHost && <Crown className="h-4 w-4 text-yellow-500" />}
            </div>
            <PlayerHand cards={playerHand} canPlay={canPlay} />
          </div>
        </>
      )}
    </div>
  );
}
