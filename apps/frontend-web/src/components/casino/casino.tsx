import { ArrowLeft } from "lucide-react";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import "./casino.css";

export function CasinoBackdrop({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("casino-backdrop", className)} {...props} />;
}

export function CasinoPanel({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cn("casino-panel", className)} {...props}>
      {children}
    </section>
  );
}

export function CasinoWordmark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("casino-wordmark", compact && "is-compact", className)}>
      <span className="casino-wordmark-suit" aria-hidden="true">
        ♠
      </span>
      <span>
        <strong>Big Two</strong>
        {!compact && <small>The house game</small>}
      </span>
    </span>
  );
}

export function CasinoTableMark({
  className,
  subtle = false,
}: {
  className?: string;
  subtle?: boolean;
}) {
  return (
    <div className={cn("table-brand", subtle && "brand-subtle", className)} aria-hidden="true">
      <span className="brand-spade">♠</span>
      <span>
        BIG CARDS
        <br />
        BIGGER FRIENDSHIPS
      </span>
      <div className="brand-rule">◆</div>
    </div>
  );
}

const decorativeCards = [
  { value: "3", suit: "♦", red: true },
  { value: "J", suit: "♣", red: false },
  { value: "K", suit: "♥", red: true },
  { value: "2", suit: "♠", red: false },
];

export function DecorativeCardFan({ className }: { className?: string }) {
  return (
    <div className={cn("decorative-card-fan", className)} aria-hidden="true">
      {decorativeCards.map((card, index) => (
        <span
          className={cn("decorative-playing-card", card.red && "is-red")}
          style={{ "--card-index": index } as CSSProperties}
          key={`${card.value}-${card.suit}`}
        >
          <span>{card.value}</span>
          <i>{card.suit}</i>
          <b>{card.suit}</b>
        </span>
      ))}
    </div>
  );
}

export function CasinoKicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("casino-kicker", className)}>{children}</p>;
}

export function CasinoLobby({
  backLabel,
  children,
  className,
  description,
  footer,
  icon,
  kicker,
  onBack,
  title,
}: {
  backLabel: string;
  children: ReactNode;
  className?: string;
  description: string;
  footer?: ReactNode;
  icon: ReactNode;
  kicker: string;
  onBack: () => void;
  title: string;
}) {
  return (
    <main className={cn("casino-lobby", className)}>
      <CasinoBackdrop />
      <header className="casino-lobby-nav">
        <CasinoWordmark compact />
        <Button variant="lacquer" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {backLabel}
        </Button>
      </header>
      <div className="casino-lobby-content">
        <header className="casino-lobby-heading">
          <span className="casino-lobby-icon" aria-hidden="true">
            {icon}
          </span>
          <CasinoKicker>{kicker}</CasinoKicker>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        {children}
      </div>
      <footer className="casino-lobby-footer">{footer ?? "♠ Big Two · The house game"}</footer>
    </main>
  );
}
