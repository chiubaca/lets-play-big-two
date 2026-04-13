import { useState } from "react";
import { twMerge } from "tailwind-merge";
import type { BigTwoGameMachineSnapshot, Card } from "@big-two/game-state-machine";
import { detectHandType } from "@big-two/game-state-machine";

import { Confetti } from "../confetti";
import { PlayingCard } from "./components/playing-card";
import { makePlayerOrder } from "./helpers/make-player-order";
import { useQuery } from "@tanstack/react-query";
import { honoClient } from "~/libs/hono-client";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";

export const GameRoom = ({
  roomId,
  user,
}: {
  roomId: string;
  user: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    email: string;
    emailVerified: boolean;
    name: string;
    image?: string | null | undefined;
  };
}) => {
  const { data: gameState } = useQuery<BigTwoGameMachineSnapshot>({
    queryKey: ["gameState", roomId],
    queryFn: () => {
      throw new Error("not used");
    },
    enabled: false,
  });

  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [guardMessage] = useState<{ key: string; message: string } | undefined>(undefined);

  const handType = detectHandType(selectedCards);
  const isValidPlay = Boolean(handType);
  const selectedCardsToPlayText =
    selectedCards.length > 0 ? (handType ? `Play ${handType}` : "Not valid") : "Pick some cards";

  if (!gameState || !user) {
    return <div className="flex h-svh items-center justify-center">Loading...</div>;
  }

  const currentPlayerIdTurn = gameState.context.players[gameState.context.currentPlayerIndex]?.id;
  const isCurrentPlayerTurn = currentPlayerIdTurn === user.id;

  const thisPlayerIndex = gameState.context.players.findIndex((player) => player.id === user.id);
  const isThisPlayerInRoom = gameState.context.players.some((p) => p.id === user.id);

  const creatorId = gameState.context.players[0]?.id;
  const isThisPlayerTheCreator = creatorId === user.id;

  const [bottomPlayerIdx, leftPlayerIdx, topPlayerIdx, rightPlayerIdx] =
    makePlayerOrder(thisPlayerIndex);

  const leftPlayer = gameState.context.players[leftPlayerIdx] || null;
  const isLeftPlayerFocused = leftPlayerIdx === gameState.context.currentPlayerIndex;

  const topPlayer = gameState.context.players[topPlayerIdx] || null;
  const isTopPlayerFocused = topPlayerIdx === gameState.context.currentPlayerIndex;

  const rightPlayer = gameState.context.players[rightPlayerIdx] || null;
  const isRightPlayerFocused = rightPlayerIdx === gameState.context.currentPlayerIndex;

  const lastHandPlayed = gameState.context.cardPile.at(-1);

  const isCurrentPlayerFocused =
    gameState.context.currentPlayerIndex === bottomPlayerIdx &&
    (gameState.value === "NEXT_PLAYER_TURN" ||
      gameState.value === "ROUND_FIRST_MOVE" ||
      gameState.value === "PLAY_NEW_ROUND");

  const hasPlayerWon = gameState.value === "GAME_END" && gameState.context.winner?.id === user.id;

  const toggleSelectedCard = (card: Card) => {
    const isCardSelected = selectedCards.some(
      (selectedCard) => selectedCard.suit === card.suit && selectedCard.value === card.value,
    );
    if (isCardSelected) {
      setSelectedCards(
        selectedCards.filter(
          (selectedCard) => selectedCard.suit !== card.suit || selectedCard.value !== card.value,
        ),
      );
    } else {
      setSelectedCards([...selectedCards, card]);
    }
  };

  const handleJoinGame = async () => {
    await honoClient.api.room.action[":roomId"].$post({
      json: { type: "JOIN_GAME", playerId: user.id, playerName: user.name },
      param: { roomId },
    });
  };

  const handleStartGame = async () => {
    await honoClient.api.room.action[":roomId"].$post({
      json: { type: "START_GAME" },
      param: { roomId },
    });
  };

  const handlePlayCards = async () => {
    if (gameState.value === "ROUND_FIRST_MOVE") {
      await honoClient.api.room.action[":roomId"].$post({
        json: {
          type: "PLAY_FIRST_MOVE",
          cards: selectedCards,
        },
        param: { roomId },
      });
      setSelectedCards([]);
      return;
    }

    if (gameState.value === "NEXT_PLAYER_TURN") {
      await honoClient.api.room.action[":roomId"].$post({
        json: {
          type: "PLAY_CARDS",
          cards: selectedCards,
        },
        param: { roomId },
      });
      setSelectedCards([]);
      return;
    }

    if (gameState.value === "PLAY_NEW_ROUND") {
      await honoClient.api.room.action[":roomId"].$post({
        json: {
          type: "PLAY_NEW_ROUND_FIRST_MOVE",
          cards: selectedCards,
        },
        param: { roomId },
      });
      setSelectedCards([]);
      return;
    }

    alert("CLIENT ERROR: Unhandled state - " + gameState.value);
  };

  const handlePassTurn = async () => {
    await honoClient.api.room.action[":roomId"].$post({
      json: { type: "PASS_TURN", playerId: user.id },
      param: { roomId },
    });
  };

  const handleResetGame = async () => {
    return 1;
  };

  return (
    <>
      <main className="game-room flex h-svh flex-col justify-between">
        <nav className="flex items-center justify-between border-b border-border/30 bg-background/90 px-4 py-3 backdrop-blur-sm">
          <Button
            variant="ghost"
            className="border border-transparent text-foreground transition-all hover:border-border hover:bg-accent"
            asChild
          >
            <a href="/">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="mr-1 h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              <span className="font-heading">Home</span>
            </a>
          </Button>
          <div className="flex items-center gap-3">
            {!isThisPlayerInRoom && (
              <Button
                disabled={gameState.value !== "WAITING_FOR_PLAYERS"}
                className={twMerge([
                  "font-medium transition-all",
                  gameState.value !== "WAITING_FOR_PLAYERS" && "cursor-not-allowed opacity-50",
                ])}
                onClick={handleJoinGame}
              >
                {gameState.value === "WAITING_FOR_PLAYERS" ? "Join Table" : "Game in Progress"}
              </Button>
            )}

            {isThisPlayerTheCreator && (
              <Button variant="destructive" size="sm" onClick={handleResetGame}>
                New Game
              </Button>
            )}
          </div>
        </nav>

        <div className="flex flex-1 items-center justify-center p-4">
          <div className="table">
            <div className="played-cards-center">
              {gameState.value === "WAITING_FOR_PLAYERS" && (
                <div>
                  {isThisPlayerTheCreator ? (
                    <Button
                      size="lg"
                      className="font-heading px-8 text-lg"
                      onClick={handleStartGame}
                    >
                      Deal Cards
                    </Button>
                  ) : (
                    <div className="flex flex-col items-center p-5 text-center">
                      <p className="mb-4 font-heading text-xl text-muted-foreground">
                        Waiting for host
                      </p>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  )}
                </div>
              )}
              {lastHandPlayed && (
                <div className="flex flex-wrap justify-center gap-1">
                  {lastHandPlayed.map((card) => {
                    return <PlayingCard key={`${card.suit}${card.value}`} card={card} />;
                  })}
                </div>
              )}
            </div>

            {/* TOP PLAYER */}
            <div
              className={twMerge([
                "top-player-position min-h-14 rounded-xl border p-2 backdrop-blur-sm",
                isTopPlayerFocused
                  ? "border-primary/50 bg-primary/20"
                  : "border-border/10 bg-card/30",
              ])}
            >
              <div className="relative ml-2 flex">
                {isTopPlayerFocused && (
                  <Badge className="absolute -right-5 -top-5 border-0 bg-primary text-primary-foreground">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  </Badge>
                )}
                {topPlayer?.hand.slice(0, 13).map((_card, idx) => {
                  return <div key={idx} className="card-back -ml-2 h-10 w-8 rounded-sm" />;
                })}
                {topPlayer && topPlayer.hand.length > 13 && (
                  <span className="absolute grid h-full w-full items-center justify-center">
                    <Badge
                      variant="secondary"
                      className="border border-border/30 bg-card/50 py-2 text-xs backdrop-blur-sm"
                    >
                      {topPlayer.hand.length}
                    </Badge>
                  </span>
                )}
              </div>
              {topPlayer?.name && (
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs font-medium text-muted-foreground">
                  {gameState.context.players[topPlayerIdx].name}
                </span>
              )}
            </div>

            {/* LEFT PLAYER */}
            <div
              className={twMerge([
                "left-player-position flex min-h-36 min-w-12 flex-col rounded-xl border p-2 pb-8 backdrop-blur-sm",
                isLeftPlayerFocused
                  ? "border-primary/50 bg-primary/20"
                  : "border-border/10 bg-card/30",
              ])}
            >
              <div className="relative flex flex-col">
                {isLeftPlayerFocused && (
                  <Badge className="absolute -right-5 -top-5 border-0 bg-primary text-primary-foreground">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  </Badge>
                )}
                {leftPlayer?.hand.slice(0, 13).map((_card, idx) => {
                  return <div key={idx} className="card-back -mb-6 h-8 w-10 rounded-sm" />;
                })}
                {leftPlayer && leftPlayer.hand.length > 13 && (
                  <span className="absolute grid h-full w-full items-center justify-center">
                    <Badge
                      variant="secondary"
                      className="border border-border/30 bg-card/50 py-2 text-xs backdrop-blur-sm"
                    >
                      {leftPlayer.hand.length}
                    </Badge>
                  </span>
                )}
              </div>
              {leftPlayer?.name && (
                <span className="absolute -bottom-4 z-10 pt-28 text-xs font-medium text-muted-foreground">
                  {gameState.context.players[leftPlayerIdx].name}
                </span>
              )}
            </div>

            {/* RIGHT PLAYER */}
            <div
              className={twMerge([
                "right-player-position flex min-h-36 min-w-12 flex-col rounded-xl border p-2 pb-8 backdrop-blur-sm",
                isRightPlayerFocused
                  ? "border-primary/50 bg-primary/20"
                  : "border-border/10 bg-card/30",
              ])}
            >
              <div className="relative flex flex-col">
                {rightPlayerIdx === gameState.context.currentPlayerIndex && (
                  <Badge className="absolute -left-5 -top-5 border-0 bg-primary text-primary-foreground">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  </Badge>
                )}

                {rightPlayer?.hand.slice(0, 13).map((_card, idx) => {
                  return <div key={idx} className="card-back -mb-6 h-8 w-10 rounded-sm" />;
                })}
                {rightPlayer && rightPlayer.hand.length > 13 && (
                  <span className="absolute grid h-full w-full items-center justify-center">
                    <Badge
                      variant="secondary"
                      className="border border-border/30 bg-card/50 py-2 text-xs backdrop-blur-sm"
                    >
                      {rightPlayer.hand.length}
                    </Badge>
                  </span>
                )}
              </div>
              {rightPlayer?.name && (
                <span className="absolute -bottom-4 z-10 pt-28 text-xs font-medium text-muted-foreground">
                  {rightPlayer.name}
                </span>
              )}
            </div>

            {/* CURRENT PLAYER */}
            <div className="current-player mt-10 flex flex-col items-center">
              {isCurrentPlayerFocused && (
                <Badge className="mb-2 border-0 bg-primary px-4 py-1 font-medium text-primary-foreground">
                  {gameState.value === "PLAY_NEW_ROUND" ? "You won that round" : "Your turn"}
                </Badge>
              )}
              {gameState.context.players[thisPlayerIndex] ? (
                <div className="w-full">
                  <div
                    className={twMerge([
                      "m-4 grid min-h-40 grid-rows-2 justify-items-center gap-1 overflow-x-auto rounded-xl border p-4",
                      isCurrentPlayerFocused
                        ? "border-primary/50 bg-primary/20"
                        : "border-border/10 bg-card/30",
                    ])}
                  >
                    {gameState.context.players[thisPlayerIndex].hand.map((card, index) => {
                      const totalCards = gameState.context.players[thisPlayerIndex].hand.length;
                      const cardsPerRow = Math.ceil(totalCards / 2);
                      const row = index < cardsPerRow ? 0 : 1;
                      return (
                        <PlayingCard
                          key={card.suit + card.value}
                          className="mb-2 shrink-0 cursor-pointer transition-transform hover:-translate-y-2"
                          style={{ gridRow: row + 1, gridColumn: "auto" }}
                          card={card}
                          onSelect={() => toggleSelectedCard(card)}
                          selected={selectedCards.some(
                            (selectedCard) =>
                              selectedCard.suit === card.suit && selectedCard.value === card.value,
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="m-4 grid min-h-40 w-11/12 rounded-xl border border-border/10 bg-card/30" />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center border-t border-border/30 bg-background/80 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-center gap-3">
            <Button
              className={twMerge([
                "px-8 font-heading transition-all",
                !isCurrentPlayerTurn && "cursor-not-allowed opacity-40",
              ])}
              disabled={!isCurrentPlayerTurn || !isValidPlay}
              onClick={handlePlayCards}
            >
              {selectedCardsToPlayText}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={twMerge([
                "px-6 transition-all",
                isCurrentPlayerTurn
                  ? "border-border/30 text-foreground hover:border-border/50 hover:bg-accent"
                  : "cursor-not-allowed border-transparent text-muted-foreground",
              ])}
              disabled={
                !isCurrentPlayerTurn ||
                gameState.value === "ROUND_FIRST_MOVE" ||
                gameState.value === "PLAY_NEW_ROUND" ||
                gameState.value === "WAITING_FOR_PLAYERS"
              }
              onClick={handlePassTurn}
            >
              Pass
            </Button>
          </div>
        </div>
      </main>

      {/* toast notification */}
      {guardMessage && (
        <div
          key={guardMessage.key}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
        >
          <div className="rounded-lg bg-destructive/90 px-4 py-2 font-medium text-destructive-foreground backdrop-blur-sm">
            {guardMessage.message}
          </div>
        </div>
      )}

      {gameState.value === "GAME_END" && (
        <Dialog open>
          <DialogContent className="max-w-md border-border/30 bg-card text-card-foreground">
            <div className="flex flex-col items-center justify-center gap-6 py-4">
              {hasPlayerWon && <Confetti />}
              <DialogTitle className="font-heading text-5xl bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                {hasPlayerWon ? "Victory" : "Defeat"}
              </DialogTitle>
              {!hasPlayerWon && (
                <p className="text-lg text-muted-foreground">Better luck next time</p>
              )}

              {isThisPlayerTheCreator ? (
                <Button size="lg" className="font-heading text-lg" onClick={handleResetGame}>
                  New Game
                </Button>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-muted-foreground">Waiting for new game</p>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <Button variant="outline" asChild>
                    <a href="/">Return Home</a>
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <style>{`
        .game-room {
          background: linear-gradient(180deg, #0a0a0f 0%, #16213e 100%);
          height: 100vh;
          overflow: hidden;
        }

        .table {
          min-height: 70vh;
          max-width: 850px;
          width: 100%;
          border: 3px solid oklch(0.527 0.154 150.069);
          
          display: grid;
          background: linear-gradient(135deg, #0d4d2b 0%, #0a3d22 50%, #0d4d2b 100%);
          box-shadow: 
            inset 0 0 100px rgba(0, 0, 0, 0.5),
            0 0 30px rgba(13, 77, 43, 0.3),
            0 0 60px rgba(0, 0, 0, 0.5);
          justify-items: center;
          align-items: end;
          margin: 0 auto;
          grid-template-areas: 
            "     .            player-top           .      "
            "player-left      table-center    player-right "
            "current-player  current-player  current-player";
          position: relative;
        }

        .table::before {
          content: '';
          position: absolute;
          inset: 8px;
          border: 1px solid oklch(0.527 0.154 150.069 / 30%);
          pointer-events: none;
        }

        .current-player {
          grid-area: current-player;
          width: 100%;
          overflow: hidden;
        }

        .card-back {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 1px solid oklch(0.527 0.154 150.069);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          position: relative;
          overflow: hidden;
        }

        .card-back::before {
          content: '';
          position: absolute;
          inset: 3px;
          background: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 2px,
            oklch(0.527 0.154 150.069 / 15%) 2px,
            oklch(0.527 0.154 150.069 / 15%) 4px
          );
          border-radius: 2px;
        }

        .played-cards-center {
          position: absolute;
          border-radius: 12px;
          top: 25%;
          left: 50%;
          transform: translateX(-50%);
          min-width: 180px;
          min-height: 180px;
          display: grid;
          align-items: center;
          justify-items: center;
          padding: 2px;
          background: rgba(0, 0, 0, 0.2);
          backdrop-filter: blur(4px);
        }

        .top-player-position {
          position: absolute;
          top: 1.5rem;
          left: 50%;
          transform: translateX(-50%);
          width: 40%;
          backdrop-filter: blur(8px);
        }

        .bottom-player-position {
          position: absolute;
          bottom: 1rem;
          left: 50%;
          transform: translateX(-50%);
        }

        .left-player-position {
          position: absolute;
          left: 1.5rem;
          top: 40%;
          transform: translateY(-50%);
          backdrop-filter: blur(8px);
        }

        .right-player-position {
          position: absolute;
          right: 1.5rem;
          top: 40%;
          transform: translateY(-50%);
          backdrop-filter: blur(8px);
        }

        @media (max-width: 640px) {
          .table {
            border-radius: 24px;
            min-height: 65vh;
          }
          .table::before {
            border-radius: 18px;
          }
          .top-player-position,
          .bottom-player-position {
            width: 60%;
          }
        }
      `}</style>
    </>
  );
};
