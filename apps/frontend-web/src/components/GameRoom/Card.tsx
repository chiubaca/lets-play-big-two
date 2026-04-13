import type { Card as CardType } from "@big-two/game-core";
import { cn } from "~/lib/utils";

interface CardProps {
  card: CardType;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

const SUIT_SYMBOLS: Record<string, string> = {
  DIAMOND: "♦",
  CLUB: "♣",
  HEART: "♥",
  SPADE: "♠",
};

const SUIT_COLORS: Record<string, string> = {
  DIAMOND: "text-destructive",
  CLUB: "text-foreground",
  HEART: "text-destructive",
  SPADE: "text-foreground",
};

export function Card({ card, selected, onClick, disabled, className }: CardProps) {
  const symbol = SUIT_SYMBOLS[card.suit];
  const colorClass = SUIT_COLORS[card.suit];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex flex-col items-center justify-between rounded-lg border-2 bg-card p-1 shadow-md transition-all",
        "w-16 h-24 sm:w-20 sm:h-28",
        selected && "border-primary ring-2 ring-primary -translate-y-2",
        !selected && "border-border hover:border-primary hover:-translate-y-1",
        disabled && "opacity-50 cursor-not-allowed",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <span className={cn("text-lg font-bold", colorClass)}>{card.value}</span>
      <span className={cn("text-2xl sm:text-3xl", colorClass)}>{symbol}</span>
      <span className={cn("text-lg font-bold", colorClass)}>{card.value}</span>
    </button>
  );
}

export function CardBack({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border-2 border-border bg-gradient-to-br from-muted to-muted-foreground/20",
        "w-16 h-24 sm:w-20 sm:h-28",
        className,
      )}
    >
      <span className="text-muted-foreground text-2xl">🃏</span>
    </div>
  );
}
