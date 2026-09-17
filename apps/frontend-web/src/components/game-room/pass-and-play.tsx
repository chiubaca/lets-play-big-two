import { useState } from "react";
import { ArrowLeft, Smartphone, UserPlus, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { GameRoom } from "./game-room";
import { isGameTurnState } from "./game-room-session";
import { useOfflineGame, type OfflinePlayer } from "./use-offline-game";

export function PassAndPlay({ onBack }: { onBack: () => void }) {
  const [names, setNames] = useState(["", ""]);
  const [fillWithAI, setFillWithAI] = useState(false);
  const [players, setPlayers] = useState<OfflinePlayer[]>([]);
  const game = useOfflineGame();
  const trimmedNames = names.map((name) => name.trim());
  const duplicateNames =
    new Set(trimmedNames.map((name) => name.toLowerCase())).size !== names.length;
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
    <main className="min-h-svh bg-felt px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-xl">
        <Button variant="ghost" onClick={onBack} className="mb-8 text-gold">
          <ArrowLeft className="h-4 w-4" /> Back to offline modes
        </Button>
        <header className="mb-8 text-center">
          <span className="text-5xl text-gold" aria-hidden="true">
            ♠
          </span>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-gold">
            One device. Great company.
          </p>
          <h1 className="mt-3 font-display text-4xl text-gold">Pass &amp; Play</h1>
          <p className="mt-3 text-muted-foreground">Take a seat. Keep your cards to yourself.</p>
        </header>
        <form
          className="space-y-6 rounded-2xl border border-gold/30 bg-card/80 p-6 sm:p-8"
          onSubmit={(event) => {
            event.preventDefault();
            if (!validNames) return;
            const seats: OfflinePlayer[] = trimmedNames.map((name, index) => ({
              id: `local-${index}`,
              name,
            }));
            if (fillWithAI) {
              while (seats.length < 4) {
                seats.push({
                  id: `bot-${seats.length}`,
                  name: `AI ${seats.length + 1}`,
                  isBot: true,
                });
              }
            }
            setPlayers(seats);
            game.start(seats);
          }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl text-gold">Who’s at the table?</h2>
            <span className="text-xs text-muted-foreground">2–4 people</span>
          </div>
          <div className="space-y-4">
            {names.map((name, index) => (
              <div key={index}>
                <label htmlFor={`player-${index}`} className="mb-2 block text-sm text-gold">
                  Player {index + 1}
                </label>
                <div className="flex gap-2">
                  <Input
                    id={`player-${index}`}
                    value={name}
                    required
                    maxLength={24}
                    autoComplete="off"
                    placeholder="Enter a name"
                    className="border-gold/30"
                    onChange={(event) =>
                      setNames(
                        names.map((value, seat) => (seat === index ? event.target.value : value)),
                      )
                    }
                  />
                  {index >= 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove player ${index + 1}`}
                      onClick={() => setNames(names.filter((_, seat) => seat !== index))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {names.length < 4 && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full border-gold/30"
                onClick={() => setNames([...names, ""])}
              >
                <UserPlus className="h-4 w-4" /> Add player
              </Button>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gold/20 p-4">
                <input
                  type="checkbox"
                  checked={fillWithAI}
                  onChange={(event) => setFillWithAI(event.target.checked)}
                  className="h-4 w-4 accent-gold"
                />
                <span className="text-sm">
                  Fill empty seats with AI{" "}
                  <span className="text-muted-foreground">
                    ({4 - names.length} {names.length === 3 ? "bot" : "bots"})
                  </span>
                </span>
              </label>
            </>
          )}
          {duplicateNames && trimmedNames.every(Boolean) && (
            <p role="alert" className="text-sm text-destructive">
              Use a different name for each player.
            </p>
          )}
          <p className="text-sm leading-relaxed text-muted-foreground">
            {fillWithAI && names.length < 4
              ? "AI plays automatically between your turns."
              : "Play with just your group; unused seats stay empty."}{" "}
            After each play or pass, hands are hidden until the next player is ready.
          </p>
          <Button
            type="submit"
            disabled={!validNames}
            className="w-full bg-gold-gradient font-display text-lg text-primary-foreground"
            size="lg"
          >
            Deal cards
          </Button>
        </form>
      </div>
    </main>
  );
}
