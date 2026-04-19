import type { Card as CardType } from "@big-two/game-core";
import { cn } from "~/lib/utils";

interface CardProps {
  card: CardType;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const SUIT_SYMBOLS: Record<string, string> = {
  DIAMOND: "♦",
  CLUB: "♣",
  HEART: "♥",
  SPADE: "♠",
};

const SUIT_COLORS: Record<string, string> = {
  DIAMOND: "text-suit-red",
  CLUB: "text-suit-black",
  HEART: "text-suit-red",
  SPADE: "text-suit-black",
};

export function Card({ card, selected, onClick, disabled, className, style }: CardProps) {
  const symbol = SUIT_SYMBOLS[card.suit];
  const colorClass = SUIT_COLORS[card.suit];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={cn(
        "relative flex flex-col items-center justify-between rounded-lg border-2 bg-playcard p-1 transition-all",
        "w-16 h-24 sm:w-20 sm:h-28",
        "shadow-card",
        selected && ["border-gold shadow-card-lift", "-translate-y-3", "ring-2 ring-gold/30"],
        !selected && [
          "border-playcard-foreground/15",
          "hover:border-gold/50 hover:-translate-y-1 hover:shadow-card-lift",
        ],
        disabled && "cursor-not-allowed opacity-50",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <span className={cn("text-base font-bold leading-none sm:text-lg", colorClass)}>
        {card.value}
      </span>
      <span className={cn("text-2xl leading-none sm:text-3xl", colorClass)}>{symbol}</span>
      <span className={cn("rotate-180 text-base font-bold leading-none sm:text-lg", colorClass)}>
        {card.value}
      </span>
    </button>
  );
}

export function CardBack({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border-2",
        "w-16 h-24 sm:w-20 sm:h-28",
        "card-back-pattern",
        className,
      )}
    />
  );
}
