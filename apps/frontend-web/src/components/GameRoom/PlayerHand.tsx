import { useContext, useCallback, useState } from "react";
import type { Card as CardType } from "@big-two/game-core";
import { Card } from "./Card";
import { GameRoomContext } from "./GameRoom.provider";
import { cn } from "~/libs/utils";
import { sortCards } from "@big-two/game-core";

interface PlayerHandProps {
  cards: CardType[];
  isCurrentPlayer?: boolean;
  canPlay?: boolean;
  className?: string;
}

export function PlayerHand({
  cards,
  isCurrentPlayer = false,
  canPlay = false,
  className,
}: PlayerHandProps) {
  const { playCards } = useContext(GameRoomContext);
  const [selectedCards, setSelectedCards] = useState<CardType[]>([]);

  const sortedCards = sortCards([...cards]);

  const toggleCard = useCallback((card: CardType) => {
    setSelectedCards((prev) => {
      const isSelected = prev.some((c) => c.suit === card.suit && c.value === card.value);
      if (isSelected) {
        return prev.filter((c) => !(c.suit === card.suit && c.value === card.value));
      }
      return [...prev, card];
    });
  }, []);

  const handlePlay = () => {
    if (selectedCards.length > 0) {
      playCards(selectedCards);
      setSelectedCards([]);
    }
  };

  const clearSelection = () => {
    setSelectedCards([]);
  };

  if (cards.length === 0) {
    return (
      <div className={cn("text-center text-muted-foreground py-8", className)}>
        No cards in hand
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {sortedCards.map((card, index) => (
          <Card
            key={`${card.suit}-${card.value}-${index}`}
            card={card}
            selected={selectedCards.some((c) => c.suit === card.suit && c.value === card.value)}
            onClick={() => toggleCard(card)}
            disabled={!isCurrentPlayer || !canPlay}
          />
        ))}
      </div>

      {isCurrentPlayer && canPlay && selectedCards.length > 0 && (
        <div className="flex justify-center gap-3">
          <button
            onClick={handlePlay}
            className="px-6 py-2 rounded-lg bg-lagoon text-white font-medium hover:bg-lagoon-deep transition-colors"
          >
            Play {selectedCards.length === 1 ? "Card" : `${selectedCards.length} Cards`}
          </button>
          <button
            onClick={clearSelection}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
