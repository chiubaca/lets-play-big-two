import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bot, ChevronDown, Smartphone, UserRound } from "lucide-react";
import { CasinoBackdrop, CasinoPanel } from "~/components/casino/casino";
import { useScrollOverlap } from "~/components/use-scroll-overlap";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { GameRoom } from "./game-room";
import { isGameTurnState } from "./game-room-session";
import { useOfflineGame, type OfflinePlayer } from "./use-offline-game";
import "./pass-and-play.css";

export function PassAndPlay({ onBack }: { onBack: () => void }) {
  const [seatCount, setSeatCount] = useState(4);
  const [names, setNames] = useState(["You", "Player 2", "Player 3", "Player 4"]);
  const [seatTypes, setSeatTypes] = useState<("human" | "bot")[]>(["human", "human", "bot", "bot"]);
  const [players, setPlayers] = useState<OfflinePlayer[]>([]);
  const game = useOfflineGame();
  const pageRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useScrollOverlap(pageRef, headingRef, panelRef, !game.gameState);
  const humanNames = names.slice(0, seatCount).filter((_, index) => seatTypes[index] === "human");
  const trimmedNames = humanNames.map((name) => name.trim());
  const duplicateNames =
    new Set(trimmedNames.map((name) => name.toLowerCase())).size !== trimmedNames.length;
  const validNames = trimmedNames.every(Boolean) && !duplicateNames;

  if (game.gameState) {
    const current = game.gameState.context.players[game.gameState.context.currentPlayerIndex];
    const playing = isGameTurnState(game.gameState.value);
    const handoff = playing && !game.isBotTurn && game.readyPlayerId !== current?.id;
    const visible = playing && !game.isBotTurn && !handoff;
    return (
      <>
        <GameRoom
          gameState={game.gameState}
          send={game.send}
          tableLabel="Pass & Play"
          thinkingPlayerId={game.thinkingPlayerId}
          user={current ?? players[0]}
          sharedDevice
          hideHand={!visible}
        />
        <Dialog open={handoff}>
          <DialogContent
            showCloseButton={false}
            className="table-dialog text-center"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <Smartphone className="mx-auto h-10 w-10 text-gold" aria-hidden="true" />
            <DialogTitle className="font-display text-3xl">Hand to {current?.name}</DialogTitle>
            <DialogDescription>
              Cards are hidden. Pass the device, then press Ready when it’s yours.
            </DialogDescription>
            <button className="table-small-button" onClick={game.ready}>
              Ready
            </button>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <main className="pass-setup" ref={pageRef}>
      <CasinoBackdrop />
      <nav className="pass-setup-nav" aria-label="Go back">
        <button type="button" className="pass-setup-back" aria-label="Back home" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </button>
      </nav>
      <div className="pass-setup-content">
        <header className="pass-setup-heading" ref={headingRef}>
          <h1>
            <img src="/title-pass-and-play.png" alt="Pass and Play" />
          </h1>
        </header>
        <CasinoPanel className="pass-setup-panel" ref={panelRef}>
          <form
            className="pass-setup-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!validNames) return;
              const seats: OfflinePlayer[] = names
                .slice(0, seatCount)
                .map((name, index) =>
                  seatTypes[index] === "bot"
                    ? { id: `bot-${index}`, name: `AI ${index + 1}`, isBot: true }
                    : { id: `local-${index}`, name: name.trim() },
                );
              setPlayers(seats);
              game.start(seats);
            }}
          >
            <fieldset className="pass-setup-count">
              <legend>Number of players</legend>
              <div className="pass-setup-count-options">
                {[2, 3, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={seatCount === count}
                    onClick={() => setSeatCount(count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="pass-setup-seats">
              <h2>
                Fill with bots <span>(optional)</span>
              </h2>
              {names.slice(0, seatCount).map((name, index) => (
                <div className="pass-setup-seat" key={index}>
                  <span className="pass-setup-avatar" aria-hidden="true">
                    {seatTypes[index] === "human" ? <UserRound /> : <Bot />}
                  </span>
                  <div className="pass-setup-seat-name">
                    <label htmlFor={`player-${index}`}>Player {index + 1}</label>
                    {seatTypes[index] === "human" ? (
                      <input
                        id={`player-${index}`}
                        value={name}
                        maxLength={24}
                        autoComplete="off"
                        placeholder="Enter a name"
                        onChange={(event) =>
                          setNames(
                            names.map((value, seat) =>
                              seat === index ? event.target.value : value,
                            ),
                          )
                        }
                      />
                    ) : (
                      <span>AI {index + 1}</span>
                    )}
                  </div>
                  <div className="pass-setup-select">
                    <select
                      aria-label={`Player ${index + 1} type`}
                      value={seatTypes[index]}
                      onChange={(event) =>
                        setSeatTypes(
                          seatTypes.map((type, seat) =>
                            seat === index ? (event.target.value as "human" | "bot") : type,
                          ),
                        )
                      }
                    >
                      <option value="human">Human</option>
                      {index !== 0 && <option value="bot">Bot</option>}
                    </select>
                    <ChevronDown aria-hidden="true" />
                  </div>
                </div>
              ))}
              {duplicateNames && trimmedNames.every(Boolean) && (
                <p className="pass-setup-error" role="alert">
                  Use a different name for each player.
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={!validNames}
              className="pass-setup-start"
              variant="gold"
            >
              Start game <ArrowRight aria-hidden="true" />
            </Button>
          </form>
        </CasinoPanel>
      </div>
    </main>
  );
}
