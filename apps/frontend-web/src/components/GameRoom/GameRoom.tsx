import { useState } from "react";
import { twMerge } from "tailwind-merge";
import type { BigTwoGameMachineSnapshot, Card } from "@big-two/game-state-machine";
import { detectHandType } from "@big-two/game-state-machine";

import { Confetti } from "../Confetti";
import { PlayingCard } from "./components/PlayingCard";
import { makePlayerOrder } from "./helpers/makePlayerOrder";
// import { GameRoomContext } from "./GameRoom.provider";
// import type { GameEvent } from "@big-two/game-state-machine";
import { useQuery } from "@tanstack/react-query";
import { honoClient } from "~/libs/hono-client";

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
    }, // WebSocket-only
    enabled: false, // never fetch via HTTP
  });

  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [guardMessage] = useState<{ key: string; message: string } | undefined>(undefined);

  const handType = detectHandType(selectedCards);
  const isValidPlay = Boolean(handType);
  const selectedCardsToPlayText =
    selectedCards.length > 0 ? (handType ? `Play ${handType}` : "Not valid") : "Pick some cards";

  if (!gameState || !user) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
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
      return await honoClient.api.room.action[":roomId"].$post({
        json: {
          type: "PLAY_FIRST_MOVE",
          cards: selectedCards,
        },
        param: { roomId },
      });
    }

    if (gameState?.value === "NEXT_PLAYER_TURN") {
      return await honoClient.api.room.action[":roomId"].$post({
        json: {
          type: "PLAY_CARDS",
          cards: selectedCards,
        },
        param: { roomId },
      });
    }
  };

  const handlePassTurn = async () => {
    // await sendGameAction({ type: "PASS_TURN", playerId: user.userId });
    return 1;
  };

  const handleResetGame = async () => {
    // await sendGameAction({ type: "RESET_GAME" });
    return 1;
  };

  return (
    <>
      <main className="game-room flex h-svh flex-col justify-between">
        <nav className="flex items-center justify-between border-b border-[var(--casino-emerald)]/30 bg-[var(--casino-black)]/90 px-4 py-3 backdrop-blur-sm">
          <a
            className="btn btn-ghost border border-transparent text-[var(--casino-cream)] transition-all hover:border-[var(--casino-emerald)]/30 hover:bg-[var(--casino-emerald)]/10 hover:text-[var(--casino-emeraldLight)]"
            href="/"
          >
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
            <span className="font-display">Home</span>
          </a>
          <div className="flex items-center gap-3">
            {!isThisPlayerInRoom && (
              <button
                className={twMerge([
                  "btn border-none font-medium text-[var(--casino-cream)] transition-all hover:bg-[var(--casino-emeraldLight)] hover:shadow-[0_0_20px_rgba(26,122,66,0.4)]",
                  gameState.value !== "WAITING_FOR_PLAYERS" && "cursor-not-allowed opacity-50",
                ])}
                style={{
                  backgroundColor:
                    gameState.value === "WAITING_FOR_PLAYERS" ? "var(--casino-emerald)" : undefined,
                }}
                type="button"
                onClick={handleJoinGame}
                disabled={gameState.value !== "WAITING_FOR_PLAYERS"}
              >
                {gameState.value === "WAITING_FOR_PLAYERS" ? "Join Table" : "Game in Progress"}
              </button>
            )}

            {isThisPlayerTheCreator && (
              <button
                className="btn btn-sm border-none text-[var(--casino-cream)] hover:bg-[var(--casino-cardRed)]"
                style={{ backgroundColor: "rgba(168, 36, 47, 0.8)" }}
                type="button"
                onClick={handleResetGame}
              >
                New Game
              </button>
            )}
          </div>
        </nav>

        <div className="flex flex-1 items-center justify-center p-4">
          <div className="table">
            <div className="played-cards-center">
              {gameState.value === "WAITING_FOR_PLAYERS" && (
                <div>
                  {isThisPlayerTheCreator ? (
                    <button
                      className="btn border-none px-8 font-display text-lg text-[var(--casino-cream)] hover:bg-[var(--casino-emeraldLight)] hover:shadow-[0_0_30px_rgba(46,204,113,0.5)]"
                      style={{ backgroundColor: "var(--casino-emerald)" }}
                      type="button"
                      onClick={handleStartGame}
                    >
                      Deal Cards
                    </button>
                  ) : (
                    <div className="flex flex-col items-center p-5 text-center">
                      <p className="mb-4 font-display text-xl text-[var(--casino-cream)]/70">
                        Waiting for host
                      </p>
                      <span className="loading loading-dots loading-lg text-[var(--casino-emeraldLight)]" />
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
                  ? "border-[var(--casino-emeraldLight)]/50 bg-[var(--casino-emeraldLight)]/20"
                  : "border-[var(--casino-emerald)]/10 bg-[var(--casino-black)]/30",
              ])}
            >
              <div className="relative ml-2 flex">
                {isTopPlayerFocused && (
                  <div className="badge badge-sm absolute -right-5 -top-5 border-none bg-[var(--casino-emeraldLight)] text-[var(--casino-black)]">
                    <span className="loading loading-dots loading-sm" />
                  </div>
                )}
                {topPlayer?.hand.slice(0, 13).map((_card, idx) => {
                  return <div key={idx} className="card-back -ml-2 h-10 w-8 rounded-sm" />;
                })}
                {topPlayer && topPlayer.hand.length > 13 && (
                  <span className="absolute grid h-full w-full items-center justify-center">
                    <span className="badge badge-sm border border-[var(--casino-emerald)]/30 bg-[var(--casino-black)]/50 py-2 text-xs text-[var(--casino-cream)] backdrop-blur-sm">
                      {topPlayer.hand.length}
                    </span>
                  </span>
                )}
              </div>
              {topPlayer?.name && (
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs font-medium text-[var(--casino-cream)]/50">
                  {gameState.context.players[topPlayerIdx].name}
                </span>
              )}
            </div>

            {/* LEFT PLAYER */}
            <div
              className={twMerge([
                "left-player-position flex min-h-36 min-w-12 flex-col rounded-xl border p-2 pb-8 backdrop-blur-sm",
                isLeftPlayerFocused
                  ? "border-[var(--casino-emeraldLight)]/50 bg-[var(--casino-emeraldLight)]/20"
                  : "border-[var(--casino-emerald)]/10 bg-[var(--casino-black)]/30",
              ])}
            >
              <div className="relative flex flex-col">
                {isLeftPlayerFocused && (
                  <div className="badge badge-sm absolute -right-5 -top-5 border-none bg-[var(--casino-emeraldLight)] text-[var(--casino-black)]">
                    <span className="loading loading-dots loading-sm" />
                  </div>
                )}
                {leftPlayer?.hand.slice(0, 13).map((_card, idx) => {
                  return <div key={idx} className="card-back -mb-6 h-8 w-10 rounded-sm" />;
                })}
                {leftPlayer && leftPlayer.hand.length > 13 && (
                  <span className="absolute grid h-full w-full items-center justify-center">
                    <span className="badge badge-sm border border-[var(--casino-emerald)]/30 bg-[var(--casino-black)]/50 py-2 text-xs text-[var(--casino-cream)] backdrop-blur-sm">
                      {leftPlayer.hand.length}
                    </span>
                  </span>
                )}
              </div>
              {leftPlayer?.name && (
                <span className="absolute -bottom-4 z-10 pt-28 text-xs font-medium text-[var(--casino-cream)]/50">
                  {gameState.context.players[leftPlayerIdx].name}
                </span>
              )}
            </div>

            {/* RIGHT PLAYER */}
            <div
              className={twMerge([
                "right-player-position flex min-h-36 min-w-12 flex-col rounded-xl border p-2 pb-8 backdrop-blur-sm",
                isRightPlayerFocused
                  ? "border-[var(--casino-emeraldLight)]/50 bg-[var(--casino-emeraldLight)]/20"
                  : "border-[var(--casino-emerald)]/10 bg-[var(--casino-black)]/30",
              ])}
            >
              <div className="relative flex flex-col">
                {rightPlayerIdx === gameState.context.currentPlayerIndex && (
                  <div className="badge badge-sm absolute -left-5 -top-5 border-none bg-[var(--casino-emeraldLight)] text-[var(--casino-black)]">
                    <span className="loading loading-dots loading-sm" />
                  </div>
                )}

                {rightPlayer?.hand.slice(0, 13).map((_card, idx) => {
                  return <div key={idx} className="card-back -mb-6 h-8 w-10 rounded-sm" />;
                })}
                {rightPlayer && rightPlayer.hand.length > 13 && (
                  <span className="absolute grid h-full w-full items-center justify-center">
                    <span className="badge badge-sm border border-[var(--casino-emerald)]/30 bg-[var(--casino-black)]/50 py-2 text-xs text-[var(--casino-cream)] backdrop-blur-sm">
                      {rightPlayer.hand.length}
                    </span>
                  </span>
                )}
              </div>
              {rightPlayer?.name && (
                <span className="absolute -bottom-4 z-10 pt-28 text-xs font-medium text-[var(--casino-cream)]/50">
                  {rightPlayer.name}
                </span>
              )}
            </div>

            {/* CURRENT PLAYER */}
            <div className="current-player mt-10 flex flex-col items-center">
              {isCurrentPlayerFocused && (
                <span className="badge mb-2 border-none bg-[var(--casino-emeraldLight)] px-4 py-1 font-medium text-[var(--casino-black)]">
                  {gameState.value === "PLAY_NEW_ROUND" ? "You won that round" : "Your turn"}
                </span>
              )}
              {gameState.context.players[thisPlayerIndex] ? (
                <div className="w-full">
                  <div
                    className={twMerge([
                      "m-4 grid min-h-40 grid-rows-2 justify-items-center gap-1 overflow-x-auto rounded-xl border p-4",
                      isCurrentPlayerFocused
                        ? "border-[var(--casino-emeraldLight)]/50 bg-[var(--casino-emeraldLight)]/20"
                        : "border-[var(--casino-emerald)]/10 bg-[var(--casino-black)]/30",
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
                <div className="m-4 grid min-h-40 w-11/12 rounded-xl border border-[var(--casino-emerald)]/10 bg-[var(--casino-black)]/30" />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center border-t border-[var(--casino-emerald)]/30 bg-[var(--casino-black)]/80 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-center gap-3">
            <button
              className={twMerge([
                "btn border-none px-8 font-display transition-all",
                isCurrentPlayerTurn
                  ? "text-[var(--casino-cream)] hover:bg-[var(--casino-emeraldLight)] hover:shadow-[0_0_20px_rgba(26,122,66,0.4)]"
                  : "cursor-not-allowed text-[var(--casino-cream)]/40",
              ])}
              style={{
                backgroundColor: isCurrentPlayerTurn
                  ? "var(--casino-emerald)"
                  : "var(--casino-charcoal)",
              }}
              type="button"
              disabled={!isCurrentPlayerTurn || !isValidPlay}
              onClick={handlePlayCards}
            >
              {selectedCardsToPlayText}
            </button>
            <button
              disabled={
                !isCurrentPlayerTurn ||
                gameState.value === "ROUND_FIRST_MOVE" ||
                gameState.value === "PLAY_NEW_ROUND" ||
                gameState.value === "WAITING_FOR_PLAYERS"
              }
              type="button"
              className={twMerge([
                "btn btn-sm px-6 transition-all",
                isCurrentPlayerTurn
                  ? "border border-[var(--casino-emerald)]/30 text-[var(--casino-cream)] hover:border-[var(--casino-emerald)]/50 hover:bg-[var(--casino-charcoal)]/80"
                  : "cursor-not-allowed border-transparent text-[var(--casino-cream)]/30",
              ])}
              style={{
                backgroundColor: isCurrentPlayerTurn
                  ? "var(--casino-charcoal)"
                  : "rgba(26, 26, 46, 0.5)",
              }}
              onClick={handlePassTurn}
            >
              Pass
            </button>
          </div>
        </div>
      </main>

      {/* toast notification */}
      {guardMessage && (
        <div
          key={guardMessage.key}
          className="toast toast-center toast-middle pointer-events-none z-50 animate-fade-out"
        >
          <div
            className="border-none bg-[var(--casino-cardRed)]/90 text-[var(--casino-cream)] backdrop-blur-sm"
            style={{ backgroundColor: "rgba(168, 36, 47, 0.9)" }}
          >
            <span className="font-medium">{guardMessage.message}</span>
          </div>
        </div>
      )}

      {gameState.value === "GAME_END" && (
        <dialog open id="game_end_modal" className="modal backdrop-blur-sm">
          <div className="modal-box max-w-md border border-[var(--casino-emerald)]/30 bg-[var(--casino-charcoal)] text-[var(--casino-cream)]">
            <div className="flex flex-col items-center justify-center gap-6 py-4">
              {hasPlayerWon && <Confetti />}
              <h3 className="font-display text-5xl text-emerald-gradient">
                {hasPlayerWon ? "Victory" : "Defeat"}
              </h3>
              {!hasPlayerWon && (
                <p className="text-lg text-[var(--casino-cream)]/60">Better luck next time</p>
              )}

              {isThisPlayerTheCreator ? (
                <button
                  className="btn btn-wide border-none font-display text-lg text-[var(--casino-cream)] hover:bg-[var(--casino-emeraldLight)] hover:shadow-[0_0_30px_rgba(46,204,113,0.5)]"
                  style={{ backgroundColor: "var(--casino-emerald)" }}
                  type="button"
                  onClick={handleResetGame}
                >
                  New Game
                </button>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-[var(--casino-cream)]/50">Waiting for new game</p>
                  <span className="loading loading-dots loading-lg text-[var(--casino-emeraldLight)]" />
                  <a
                    className="btn btn-ghost border border-[var(--casino-emerald)]/30 text-[var(--casino-emeraldLight)] hover:bg-[var(--casino-emerald)]/10"
                    href="/"
                  >
                    Return Home
                  </a>
                </div>
              )}
            </div>
          </div>
        </dialog>
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
          border: 3px solid #1a7a42;
          
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
          border: 1px solid rgba(26, 122, 66, 0.3);
          pointer-events: none;
        }

        .current-player {
          grid-area: current-player;
          width: 100%;
          overflow: hidden;
        }

        .card-back {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 1px solid #1a7a42;
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
            rgba(26, 122, 66, 0.15) 2px,
            rgba(26, 122, 66, 0.15) 4px
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
