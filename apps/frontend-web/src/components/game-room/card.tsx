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

const CARD_VALUE_NAMES: Record<string, string> = {
  J: "jack",
  Q: "queen",
  K: "king",
  A: "ace",
};

function SuitIcon({ suit }: { suit: CardType["suit"] }) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" focusable="false">
      {suit === "DIAMOND" ? (
        <path d="M50 4 80 50 50 96 20 50Z" />
      ) : suit === "HEART" ? (
        <path d="M50 92C38 80 6 56 6 31 6 5 35 1 50 24 65 1 94 5 94 31 94 56 62 80 50 92Z" />
      ) : suit === "SPADE" ? (
        <path d="M50 3C40 17 7 42 7 63 7 88 35 92 47 72 46 85 41 91 34 97H66C59 91 54 85 53 72 65 92 93 88 93 63 93 42 60 17 50 3Z" />
      ) : (
        <>
          <circle cx="50" cy="26" r="23" />
          <circle cx="25" cy="60" r="23" />
          <circle cx="75" cy="60" r="23" />
          <path d="M47 48H53C53 77 55 89 66 97H34C45 89 47 77 47 48Z" />
        </>
      )}
    </svg>
  );
}

export function getCardAccessibleName(card: CardType) {
  const value = CARD_VALUE_NAMES[card.value] ?? card.value;
  return `${value} of ${card.suit.toLowerCase()}s`;
}

export function Card({ card, selected, onClick, disabled, className, style }: CardProps) {
  const symbol = SUIT_SYMBOLS[card.suit];
  const colorClass = SUIT_COLORS[card.suit];

  return (
    <button
      type="button"
      data-suit={symbol}
      data-red={card.suit === "DIAMOND" || card.suit === "HEART"}
      aria-label={getCardAccessibleName(card)}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={cn(
        "playing-card-fluid relative border-2 bg-white transition-all",
        "shadow-card",
        selected && [
          "border-gold shadow-card-lift",
          "-translate-y-2 md:-translate-y-3",
          "ring-1 ring-gold/30 md:ring-2",
        ],
        !selected && [
          "border-[#111111]",
          "hover:border-gold/50 hover:-translate-y-1 hover:shadow-card-lift",
        ],
        disabled && "cursor-not-allowed opacity-50",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <span className={cn("card-corner", colorClass)} aria-hidden="true">
        <span className="card-value font-bold leading-none">{card.value}</span>
        <span className="card-suit">
          <SuitIcon suit={card.suit} />
        </span>
      </span>
      <span className={cn("card-center leading-none", colorClass)} aria-hidden="true">
        <SuitIcon suit={card.suit} />
      </span>
      <span className={cn("card-corner card-corner-bottom", colorClass)} aria-hidden="true">
        <span className="card-value font-bold leading-none">{card.value}</span>
        <span className="card-suit">
          <SuitIcon suit={card.suit} />
        </span>
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
