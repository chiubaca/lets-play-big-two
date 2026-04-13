import type { Card } from "@big-two/game-state-machine";

const suitIconMapper = (suit: Card["suit"]) => {
  const mapper: Record<Card["suit"], string> = {
    DIAMOND: "♦",
    CLUB: "♣",
    HEART: "♥",
    SPADE: "♠",
  };
  return mapper[suit];
};

const cardColourMapper = (suit: Card["suit"]) => {
  return suit === "HEART" || suit === "DIAMOND" ? "suit-red" : "suit-black";
};

export const PlayingCard = ({
  card,
  selected,
  onSelect,
  className,
  style,
}: {
  card: Card;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
  style?: React.HTMLAttributes<HTMLLabelElement>["style"];
}) => {
  return (
    <>
      <label
        style={style}
        key={card.value + card.suit}
        className={`playing-card ${cardColourMapper(card.suit)} ${className || ""} ${selected ? "selected" : ""}`}
      >
        <input type="checkbox" className="card-checkbox" checked={selected} onChange={onSelect} />
        <span className="card-corner">
          <span className="card-value">{card.value}</span>
          <span className="card-suit">{suitIconMapper(card.suit)}</span>
        </span>
        <span className="card-center">{suitIconMapper(card.suit)}</span>
        <span className="card-corner rotated">
          <span className="card-value">{card.value}</span>
          <span className="card-suit">{suitIconMapper(card.suit)}</span>
        </span>
      </label>

      <style>{`
        .playing-card {
          width: 10vmin;
          height: 13vmin;
          min-width: 52px;
          min-height: 72px;
          max-width: 78px;
          max-height: 108px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background: linear-gradient(145deg, #ffffff 0%, #f8f8f8 50%, #f0f0f0 100%);
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.15),
            0 0 1px rgba(0, 0, 0, 0.1);
          z-index: 10;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }

        .playing-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 8px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          pointer-events: none;
        }

        .playing-card:hover {
          box-shadow: 
            0 4px 16px rgba(0, 0, 0, 0.2),
            0 0 1px rgba(0, 0, 0, 0.4);
        }

        .playing-card.selected {
          transform: translateY(-10px);
          box-shadow: 
            0 8px 24px rgba(0, 0, 0, 0.3),
            0 0 0 2px #1a7a42,
            0 0 20px rgba(13, 77, 43, 0.4);
        }

        .playing-card.selected::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 6px;
          background: linear-gradient(135deg, rgba(26, 122, 66, 0.15) 0%, transparent 50%);
          pointer-events: none;
        }

        .card-checkbox {
          display: none;
        }

        .card-corner {
          padding: 4px 6px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          line-height: 1;
        }

        .card-value {
          font-size: minmax(13px, 2.5vmin);
          font-weight: 600;
          font-family: var(--font-sans);
        }

        .card-suit {
          font-size: minmax(12px, 2.2vmin);
          margin-top: 1px;
        }

        .card-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: minmax(22px, 5vmin);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        .rotated {
          position: absolute;
          bottom: 0;
          right: 0;
          transform: rotate(180deg);
        }

        .suit-red {
          color: #a8242f;
        }

        .suit-black {
          color: #1a1a2e;
        }
      `}</style>
    </>
  );
};
