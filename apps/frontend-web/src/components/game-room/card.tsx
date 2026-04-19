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
        "playing-card-fluid relative flex flex-col items-center justify-between border-2 bg-playcard transition-all",
        "shadow-card",
        selected && [
          "border-gold shadow-card-lift",
          "-translate-y-2 md:-translate-y-3",
          "ring-1 ring-gold/30 md:ring-2",
        ],
        !selected && [
          "border-playcard-foreground/15",
          "hover:border-gold/50 hover:-translate-y-1 hover:shadow-card-lift",
        ],
        disabled && "cursor-not-allowed opacity-50",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <span className={cn("card-value font-bold leading-none", colorClass)}>{card.value}</span>
      <span className={cn("card-suit leading-none", colorClass)}>{symbol}</span>
      <span className={cn("card-value rotate-180 font-bold leading-none", colorClass)}>
        {card.value}
      </span>
    </button>
  );
}

export function CardBack({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "playing-card-fluid flex items-center justify-center border-2",
        "card-back-pattern",
        className,
      )}
    />
  );
}
