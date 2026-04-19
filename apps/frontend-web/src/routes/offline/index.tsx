import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Users, Bot, Sparkles } from "lucide-react";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/offline/")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-felt">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gold/20 bg-background/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-gold text-2xl">♠</span>
          <span className="font-display text-xl text-gold tracking-wide">Big Two</span>
        </div>
        <Button
          variant="ghost"
          className="text-foreground/80 transition-all hover:bg-gold/10 hover:text-gold"
          onClick={() => navigate({ to: "/" })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </header>

      {/* Main Content */}
      <div className="mx-auto max-w-2xl px-4 pb-8 pt-16">
        <div className="space-y-8 text-center">
          {/* Title */}
          <div className="space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-gradient shadow-gold-glow">
              <Bot className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="font-display text-4xl text-gold text-shadow-gold">Solo Mode</h1>
            <p className="text-lg text-muted-foreground">
              Practice against AI opponents on a single device
            </p>
          </div>

          {/* Info Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gold/20 bg-card/50 p-6 backdrop-blur-sm">
              <Users className="mx-auto mb-3 h-8 w-8 text-gold" />
              <h3 className="mb-2 font-display text-xl text-gold">4 Players</h3>
              <p className="text-sm text-muted-foreground">
                You versus 3 AI opponents with realistic playing strategies
              </p>
            </div>

            <div className="rounded-2xl border border-gold/20 bg-card/50 p-6 backdrop-blur-sm">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-gold" />
              <h3 className="mb-2 font-display text-xl text-gold">No Account</h3>
              <p className="text-sm text-muted-foreground">
                Jump right in without signing in or creating an account
              </p>
            </div>
          </div>

          {/* Start Button */}
          <div className="pt-4">
            <Button
              size="lg"
              className="bg-gold-gradient px-12 font-display text-lg text-primary-foreground transition-all hover:shadow-gold-glow"
              onClick={() => {
                alert("Offline mode coming soon!");
              }}
            >
              Start Solo Game
            </Button>
          </div>

          {/* Coming Soon Notice */}
          <div className="rounded-xl border border-gold/20 bg-card/30 p-6 backdrop-blur-sm">
            <p className="text-muted-foreground">
              <span className="font-medium text-gold">Coming Soon:</span> Full offline multiplayer
              mode for playing with friends on the same device, pass-and-play style.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-gold/10 bg-background/80 px-6 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-center text-xs text-muted-foreground/60">
          <span>♠ Big Two — Perfect your strategy against AI</span>
        </div>
      </footer>
    </main>
  );
}
