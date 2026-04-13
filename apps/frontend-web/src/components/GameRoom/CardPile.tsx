import type { Card as CardType } from "@big-two/game-core";
import { Card } from "./Card";
import { cn } from "~/lib/utils";

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
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50 min-h-32 p-4",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">{label || "No cards played yet"}</p>
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
