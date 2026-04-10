import type { Card as CardType } from "@big-two/game-core";
import { cn } from "~/libs/utils";

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
  DIAMOND: "text-red-500",
  CLUB: "text-gray-900 dark:text-gray-100",
  HEART: "text-red-500",
  SPADE: "text-gray-900 dark:text-gray-100",
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
        "relative flex flex-col items-center justify-between rounded-lg border-2 bg-white p-1 shadow-md transition-all",
        "w-16 h-24 sm:w-20 sm:h-28",
        "dark:bg-gray-800 dark:border-gray-600",
        selected && "border-lagoon ring-2 ring-lagoon -translate-y-2",
        !selected && "border-gray-200 hover:border-lagoon hover:-translate-y-1",
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
        "flex items-center justify-center rounded-lg border-2 border-gray-300 bg-gradient-to-br from-[var(--sea-ink)] to-[var(--lagoon-deep)]",
        "w-16 h-24 sm:w-20 sm:h-28",
        className,
      )}
    >
      <span className="text-white/80 text-2xl">🃏</span>
    </div>
  );
}
