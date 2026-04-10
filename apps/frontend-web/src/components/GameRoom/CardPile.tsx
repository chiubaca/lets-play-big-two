import type { Card as CardType } from "@big-two/game-core";
import { Card } from "./Card";
import { cn } from "~/libs/utils";

interface CardPileProps {
  cards: CardType[];
  label?: string;
  className?: string;
}

export function CardPile({ cards, label, className }: CardPileProps) {
  if (cards.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50",
          "min-h-32 p-4",
          className,
        )}
      >
        <p className="text-muted-foreground text-sm">{label || "No cards played yet"}</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {cards.map((card, index) => (
          <Card key={`${card.suit}-${card.value}-${index}`} card={card} disabled />
        ))}
      </div>
    </div>
  );
}
