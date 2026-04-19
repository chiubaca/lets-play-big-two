import { useState } from "react";
import { twMerge } from "tailwind-merge";
import type { BigTwoGameMachineSnapshot, Card } from "@big-two/game-state-machine";
import { detectHandType } from "@big-two/game-state-machine";

import { Confetti } from "../confetti";
import { Card as CardComponent } from "./card";
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
    return (
      <div className="flex h-svh items-center justify-center bg-felt">
        <div className="animate-pulse font-display text-2xl text-gold">Loading...</div>
      </div>
    );
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
    await honoClient.api.room.action[":roomId"].$post({
      json: { type: "RESET_GAME" },
      param: { roomId },
    });
    setSelectedCards([]);
    return;
  };

  return (
    <>
      <main className="game-room flex h-svh flex-col justify-between bg-felt">
        {/* Navigation Bar */}
        <nav className="flex items-center justify-between border-b border-gold/20 bg-background/80 px-4 py-3 backdrop-blur-md">
          <Button
            variant="ghost"
            className="text-foreground/80 transition-all hover:bg-gold/10 hover:text-gold"
            asChild
          >
            <a href="/" className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
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
              <span className="font-display text-lg">Leave</span>
            </a>
          </Button>

          {/* Room Info */}
          <div className="hidden items-center gap-6 sm:flex">
            <span className="font-display tracking-wide text-gold">♠ Big Two</span>
            <span className="text-xs text-muted-foreground">Room: {roomId}</span>
          </div>

          <div className="flex items-center gap-3">
            {!isThisPlayerInRoom && (
              <Button
                disabled={gameState.value !== "WAITING_FOR_PLAYERS"}
                className={twMerge([
                  "font-display transition-all",
                  gameState.value !== "WAITING_FOR_PLAYERS" && "cursor-not-allowed opacity-50",
                ])}
                onClick={handleJoinGame}
              >
                {gameState.value === "WAITING_FOR_PLAYERS" ? "Join Table" : "Game in Progress"}
              </Button>
            )}

            {isThisPlayerTheCreator && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetGame}
                className="border-destructive/50 text-destructive hover:bg-destructive/10"
              >
                New Game
              </Button>
            )}
          </div>
        </nav>

        {/* Game Table Area */}
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="table-area">
            {/* Played Cards Center */}
            <div className="played-cards-center">
              {gameState.value === "WAITING_FOR_PLAYERS" && (
                <div>
                  {isThisPlayerTheCreator ? (
                    <Button
                      size="lg"
                      className="bg-gold-gradient px-10 font-display text-lg text-primary-foreground transition-all hover:shadow-gold-glow"
                      onClick={handleStartGame}
                    >
                      Deal Cards
                    </Button>
                  ) : (
                    <div className="flex flex-col items-center p-5 text-center">
                      <p className="mb-4 font-display text-xl text-gold/80">Waiting for host</p>
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                    </div>
                  )}
                </div>
              )}
              {lastHandPlayed && (
                <div className="flex flex-wrap justify-center gap-2">
                  {lastHandPlayed.map((card) => {
                    return (
                      <CardComponent
                        key={`${card.suit}${card.value}`}
                        card={card}
                        className="animate-deal"
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* TOP PLAYER */}
            <div
              className={twMerge([
                "top-player-position min-h-14 rounded-xl border p-2 backdrop-blur-sm",
                isTopPlayerFocused ? "border-gold/50 bg-gold/20" : "border-gold/10 bg-card/30",
              ])}
            >
              <div className="relative ml-2 flex">
                {isTopPlayerFocused && (
                  <Badge className="absolute -right-5 -top-5 border-0 bg-gold-gradient text-primary-foreground">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  </Badge>
                )}
                {topPlayer?.hand.slice(0, 13).map((_card, idx) => {
                  return (
                    <div
                      key={idx}
                      className="card-back mini-card-fluid -ml-[clamp(0.25rem,0.5vw,0.5rem)] rounded-sm"
                    />
                  );
                })}
                {topPlayer && topPlayer.hand.length > 13 && (
                  <span className="absolute grid h-full w-full items-center justify-center">
                    <Badge
                      variant="secondary"
                      className="border border-gold/30 bg-card/50 py-2 text-xs text-gold backdrop-blur-sm"
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
                isLeftPlayerFocused ? "border-gold/50 bg-gold/20" : "border-gold/10 bg-card/30",
              ])}
            >
              <div className="relative flex flex-col">
                {isLeftPlayerFocused && (
                  <Badge className="absolute -right-5 -top-5 border-0 bg-gold-gradient text-primary-foreground">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  </Badge>
                )}
                {leftPlayer?.hand.slice(0, 13).map((_card, idx) => {
                  return (
                    <div
                      key={idx}
                      className="card-back mini-card-fluid -mb-[clamp(0.375rem,1vw,1.5rem)] rounded-sm rotate-90 -mt-2"
                    />
                  );
                })}
                {leftPlayer && leftPlayer.hand.length > 13 && (
                  <span className="absolute grid h-full w-full items-center justify-center">
                    <Badge
                      variant="secondary"
                      className="border border-gold/30 bg-card/50 py-2 text-xs text-gold backdrop-blur-sm"
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
                isRightPlayerFocused ? "border-gold/50 bg-gold/20" : "border-gold/10 bg-card/30",
              ])}
            >
              <div className="relative flex flex-col">
                {rightPlayerIdx === gameState.context.currentPlayerIndex && (
                  <Badge className="absolute -left-5 -top-5 border-0 bg-gold-gradient text-primary-foreground">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  </Badge>
                )}

                {rightPlayer?.hand.slice(0, 13).map((_card, idx) => {
                  return (
                    <div
                      key={idx}
                      className="card-back mini-card-fluid -mb-[clamp(0.375rem,1vw,1.5rem)] rounded-sm rotate-90 -mt-2"
                    />
                  );
                })}
                {rightPlayer && rightPlayer.hand.length > 13 && (
                  <span className="absolute grid h-full w-full items-center justify-center">
                    <Badge
                      variant="secondary"
                      className="border border-gold/30 bg-card/50 py-2 text-xs text-gold backdrop-blur-sm"
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
            <div className="current-player mt-[clamp(0.5rem,3vw,2.5rem)] flex flex-col items-center">
              {isCurrentPlayerFocused && (
                <Badge className="mb-[clamp(0.25rem,1vw,0.75rem)] border-0 bg-gold-gradient px-[clamp(0.5rem,2vw,1rem)] py-[clamp(0.25rem,0.5vw,0.5rem)] font-display text-[clamp(0.625rem,1.5vw,0.875rem)] text-primary-foreground">
                  {gameState.value === "PLAY_NEW_ROUND" ? "You won that round" : "Your turn"}
                </Badge>
              )}
              {gameState.context.players[thisPlayerIndex] ? (
                <div className="w-full">
                  <div
                    className={twMerge([
                      "mx-[clamp(0.25rem,2vw,1rem)] my-[clamp(0.25rem,1.5vw,1rem)] grid min-h-[clamp(6rem,25vw,10rem)] grid-rows-2 justify-items-center gap-[clamp(0.125rem,0.5vw,0.5rem)] overflow-x-auto rounded-[clamp(0.5rem,2vw,1rem)] border p-[clamp(0.25rem,2vw,1rem)]",
                      isCurrentPlayerFocused
                        ? "border-gold/50 bg-gold/10 "
                        : "border-gold/20 bg-card/40",
                    ])}
                  >
                    {gameState.context.players[thisPlayerIndex].hand.map((card, index) => {
                      const totalCards = gameState.context.players[thisPlayerIndex].hand.length;
                      const cardsPerRow = Math.ceil(totalCards / 2);
                      const row = index < cardsPerRow ? 0 : 1;
                      return (
                        <CardComponent
                          key={card.suit + card.value}
                          className="shrink-0 cursor-pointer transition-all hover:-translate-y-1 md:hover:-translate-y-2"
                          style={{ gridRow: row + 1, gridColumn: "auto" }}
                          card={card}
                          onClick={() => toggleSelectedCard(card)}
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
                <div className="mx-[clamp(0.25rem,2vw,1rem)] my-[clamp(0.25rem,1.5vw,1rem)] grid min-h-[clamp(6rem,25vw,10rem)] w-11/12 rounded-[clamp(0.5rem,2vw,1rem)] border border-gold/20 bg-card/40" />
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center justify-center border-t border-gold/20 bg-background/80 p-[clamp(0.5rem,2vw,1.5rem)] backdrop-blur-md">
          {/* Player info */}
          <div className="mb-[clamp(0.25rem,1.5vw,1rem)] flex items-center gap-[clamp(0.375rem,1vw,0.75rem)]">
            <div className="flex h-[clamp(1.75rem,3vw,2.5rem)] w-[clamp(1.75rem,3vw,2.5rem)] items-center justify-center rounded-full bg-gold-gradient shadow-gold-glow">
              <span className="font-display text-[clamp(0.75rem,1.5vw,1.125rem)] text-primary-foreground">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="text-center">
              <span className="text-[clamp(0.625rem,1.25vw,0.875rem)] font-medium text-gold">
                You
              </span>
              <span className="ml-[clamp(0.125rem,0.5vw,0.5rem)] text-[clamp(0.5rem,1vw,0.75rem)] text-muted-foreground">
                {gameState.context.players[thisPlayerIndex]?.hand.length || 0} cards
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-[clamp(0.375rem,1.5vw,0.75rem)]">
            <Button
              variant="outline"
              size="lg"
              className={twMerge([
                "border-gold/30 px-[clamp(0.75rem,3vw,2rem)] py-[clamp(0.375rem,1.5vw,0.75rem)] text-[clamp(0.625rem,1.5vw,1rem)] font-display transition-all",
                isCurrentPlayerTurn
                  ? "text-foreground hover:border-gold/60 hover:bg-gold/10"
                  : "cursor-not-allowed border-transparent text-muted-foreground opacity-50",
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
            <Button
              size="lg"
              className={twMerge([
                "bg-gold-gradient px-[clamp(0.75rem,4vw,2.5rem)] py-[clamp(0.375rem,1.5vw,0.75rem)] text-[clamp(0.625rem,1.5vw,1rem)] font-display text-primary-foreground transition-all hover:shadow-gold-glow",
                (!isCurrentPlayerTurn || !isValidPlay) && "cursor-not-allowed opacity-50",
              ])}
              disabled={!isCurrentPlayerTurn || !isValidPlay}
              onClick={handlePlayCards}
            >
              {selectedCardsToPlayText}
            </Button>
          </div>
        </div>
      </main>

      {/* Toast notification */}
      {guardMessage && (
        <div
          key={guardMessage.key}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
        >
          <div className="rounded-lg bg-destructive/90 px-6 py-3 font-display text-lg text-destructive-foreground shadow-lg backdrop-blur-sm">
            {guardMessage.message}
          </div>
        </div>
      )}

      {/* Game End Dialog */}
      {gameState.value === "GAME_END" && (
        <Dialog open>
          <DialogContent className="max-w-md border-gold/30 bg-card/95 backdrop-blur-xl">
            <div className="flex flex-col items-center justify-center gap-6 py-6">
              {hasPlayerWon && <Confetti />}
              <DialogTitle
                className={twMerge([
                  "font-display text-5xl bg-gradient-to-r from-gold via-gold-bright to-gold bg-clip-text text-transparent",
                  !hasPlayerWon && "text-muted-foreground",
                ])}
              >
                {hasPlayerWon ? "Victory" : "Defeat"}
              </DialogTitle>
              {!hasPlayerWon && (
                <p className="font-display text-lg italic text-muted-foreground">
                  Better luck next time
                </p>
              )}

              {isThisPlayerTheCreator ? (
                <Button
                  size="lg"
                  className="bg-gold-gradient px-10 font-display text-lg text-primary-foreground hover:shadow-gold-glow"
                  onClick={handleResetGame}
                >
                  New Game
                </Button>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-muted-foreground">Waiting for new game</p>
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                  <Button variant="outline" asChild className="border-gold/30">
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
          height: 100vh;
          overflow: hidden;
        }

        .table-area {
          min-height: clamp(65vh, 75vh, 85vh);
          max-width: min(900px, 95vw);
          width: 100%;
          border-radius: clamp(12px, 3vw, 24px);
          display: grid;
          background: radial-gradient(ellipse at center, hsl(152 48% 18% / 0.8) 0%, hsl(155 55% 11% / 0.9) 70%, hsl(150 40% 6% / 0.95) 100%);
          justify-items: center;
          align-items: end;
          margin: 0 auto;
          grid-template-areas:
            "     .            player-top           .      "
            "player-left      table-center    player-right "
            "current-player  current-player  current-player";
          position: relative;
          padding: clamp(0.25rem, 2vw, 1rem);
        }

        .current-player {
          grid-area: current-player;
          width: 100%;
          overflow: hidden;
        }

        .played-cards-center {
          position: absolute;
          border-radius: clamp(8px, 2vw, 16px);
          top: clamp(30%, 35%, 40%);
          left: 50%;
          transform: translate(-50%, -50%);
          min-width: clamp(120px, 30vw, 200px);
          min-height: clamp(100px, 25vw, 150px);
          display: grid;
          align-items: center;
          justify-items: center;
          padding: clamp(0.5rem, 2vw, 1rem);
        }

        .top-player-position {
          position: absolute;
          top: clamp(0.25rem, 1.5vw, 1rem);
          left: 50%;
          transform: translateX(-50%);
          width: auto;
          min-width: clamp(120px, 35vw, 200px);
        }

        .left-player-position {
          position: absolute;
          left: clamp(0.25rem, 1.5vw, 1rem);
          top: 40%;
          transform: translateY(-50%);
        }

        .right-player-position {
          position: absolute;
          right: clamp(0.25rem, 1.5vw, 1rem);
          top: 40%;
          transform: translateY(-50%);
        }
      `}</style>
    </>
  );
};
