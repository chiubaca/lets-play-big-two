import { useState } from "react";
import { Smartphone, UserPlus, X } from "lucide-react";
import { CasinoLobby, CasinoPanel } from "~/components/casino/casino";
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
    <CasinoLobby
      backLabel="Offline modes"
      description="Add your players, keep each hand private, and pass the device when the table calls the next name."
      footer="♠ Big Two · One device · Great company"
      icon={<Smartphone />}
      kicker="Shared device · private hands"
      onBack={onBack}
      title="Pass & Play"
    >
      <CasinoPanel className="p-6 sm:p-8">
        <form
          className="space-y-6"
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
            <h2 className="font-display text-2xl text-[var(--casino-gold-bright)]">
              Who’s at the table?
            </h2>
            <span className="font-mono text-[9px] tracking-wider text-[var(--casino-cream-muted)]">
              2–4 PEOPLE
            </span>
          </div>
          <div className="space-y-4">
            {names.map((name, index) => (
              <div key={index}>
                <label
                  htmlFor={`player-${index}`}
                  className="mb-2 block text-xs text-[var(--casino-cream-muted)]"
                >
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
                    className="h-11 rounded-xl border-[var(--casino-gold)]/30 bg-[var(--casino-night-deep)]/70"
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
                      className="h-11 text-[var(--casino-gold)]"
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
                variant="lacquer"
                className="h-11 w-full"
                onClick={() => setNames([...names, ""])}
              >
                <UserPlus className="h-4 w-4" /> Add player
              </Button>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--casino-gold)]/25 bg-black/10 p-4">
                <input
                  type="checkbox"
                  checked={fillWithAI}
                  onChange={(event) => setFillWithAI(event.target.checked)}
                  className="h-4 w-4 accent-[var(--casino-gold)]"
                />
                <span className="text-sm">
                  Fill empty seats with AI{" "}
                  <span className="text-[#a9aa95]">
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
          <p className="text-sm leading-relaxed text-[#a9aa95]">
            {fillWithAI && names.length < 4
              ? "AI plays automatically between your turns."
              : "Play with just your group; unused seats stay empty."}{" "}
            After each play or pass, hands are hidden until the next player is ready.
          </p>
          <Button
            type="submit"
            disabled={!validNames}
            className="h-12 w-full text-lg"
            variant="gold"
            size="lg"
          >
            Deal cards
          </Button>
        </form>
      </CasinoPanel>
    </CasinoLobby>
  );
}
