import { CardBack } from "./Card";
import { cn } from "~/libs/utils";
import { Crown } from "lucide-react";

interface OpponentHandProps {
  playerName: string;
  cardCount: number;
  isCurrentPlayer?: boolean;
  isHost?: boolean;
  className?: string;
}

export function OpponentHand({
  playerName,
  cardCount,
  isCurrentPlayer = false,
  isHost = false,
  className,
}: OpponentHandProps) {
  // Show at most 5 card backs to represent their hand
  const displayCards = Math.min(cardCount, 5);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 p-3 rounded-xl",
        isCurrentPlayer
          ? "bg-lagoon/10 border-2 border-lagoon"
          : "bg-card border border-gray-200 dark:border-gray-700",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{playerName}</span>
        {isHost && <Crown className="h-4 w-4 text-yellow-500" />}
        {isCurrentPlayer && (
          <span className="text-xs bg-lagoon text-white px-2 py-0.5 rounded-full">Turn</span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        {Array.from({ length: displayCards }).map((_, i) => (
          <CardBack key={i} className="w-12 h-16 -ml-8 first:ml-0" />
        ))}
        {cardCount > 5 && (
          <span className="text-xs text-muted-foreground ml-2">+{cardCount - 5}</span>
        )}
      </div>

      <span className="text-xs text-muted-foreground">
        {cardCount} {cardCount === 1 ? "card" : "cards"}
      </span>
    </div>
  );
}
