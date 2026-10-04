import { CARD_VALUES, SUITS, type Card } from "@big-two/game-core";
import { Card as PlayingCard, getCardAccessibleName } from "./card";
import "./big-two-cheat-sheet.css";

const suitNames = { DIAMOND: "Diamonds", CLUB: "Clubs", HEART: "Hearts", SPADE: "Spades" };
function IllustrationCard({ value, suit }: Card) {
  return (
    <span className="cheat-card" role="img" aria-label={getCardAccessibleName({ value, suit })}>
      <span aria-hidden="true" inert>
        <PlayingCard card={{ value, suit }} />
      </span>
    </span>
  );
}

const combos: { name: string; detail: string; tie: string; cards: Card[] }[] = [
  {
    name: "Straight",
    detail: "Five consecutive ranks",
    tie: "Compare the highest card, then its suit.",
    cards: [
      { value: "3", suit: "DIAMOND" },
      { value: "4", suit: "CLUB" },
      { value: "5", suit: "HEART" },
      { value: "6", suit: "SPADE" },
      { value: "7", suit: "DIAMOND" },
    ],
  },
  {
    name: "Flush",
    detail: "Five cards of one suit",
    tie: "Compare suit first, then the highest card.",
    cards: ["3", "5", "8", "J", "K"].map((value) => ({ value, suit: "HEART" }) as Card),
  },
  {
    name: "Full house",
    detail: "Three of a kind + a pair",
    tie: "Compare the triple’s rank, then its highest suit.",
    cards: [
      { value: "8", suit: "DIAMOND" },
      { value: "8", suit: "CLUB" },
      { value: "8", suit: "SPADE" },
      { value: "K", suit: "HEART" },
      { value: "K", suit: "SPADE" },
    ],
  },
  {
    name: "Four of a kind",
    detail: "Four matching ranks + any card",
    tie: "Compare the four matching cards’ rank.",
    cards: [...SUITS.map((suit) => ({ value: "9", suit }) as Card), { value: "3", suit: "CLUB" }],
  },
  {
    name: "Straight flush",
    detail: "Five consecutive ranks, one suit",
    tie: "Compare the highest card, then its suit.",
    cards: ["6", "7", "8", "9", "10"].map((value) => ({ value, suit: "SPADE" }) as Card),
  },
];

export function BigTwoCheatSheet() {
  return (
    <div className="cheat-sheet">
      <section className="cheat-suits" aria-labelledby="cheat-suits-title">
        <h3 id="cheat-suits-title">
          Suit order <span>Low → high</span>
        </h3>
        <div className="cheat-suit-order">
          {SUITS.map((suit, index) => (
            <div className="cheat-suit-step" key={suit}>
              {index > 0 && (
                <span className="cheat-order-arrow" aria-hidden="true">
                  &lt;
                </span>
              )}
              <div>
                <IllustrationCard value="A" suit={suit} />
                <span>{suitNames[suit]}</span>
              </div>
            </div>
          ))}
        </div>
        <p>Same rank? The higher suit wins. Spades are strongest.</p>
      </section>

      <section className="cheat-ranks" aria-labelledby="cheat-ranks-title">
        <h3 id="cheat-ranks-title">
          Rank order <span>Low → high</span>
        </h3>
        <div className="cheat-rank-order" aria-label="Ranks from lowest to highest">
          {CARD_VALUES.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
        <p>3 is lowest. 2 is highest. Straights don’t wrap: no A–2–3–4–5.</p>
      </section>

      <section aria-labelledby="cheat-play-title">
        <h3 id="cheat-play-title">Match the play</h3>
        <div className="cheat-basic-plays">
          <div>
            <IllustrationCard value="J" suit="SPADE" />
            <p>
              <strong>Single → higher single</strong>
              <span>Compare rank, then suit.</span>
            </p>
          </div>
          <div>
            <div className="cheat-hand">
              <IllustrationCard value="8" suit="HEART" />
              <IllustrationCard value="8" suit="SPADE" />
            </div>
            <p>
              <strong>Pair → higher pair</strong>
              <span>Same rank; compare the highest suit.</span>
            </p>
          </div>
        </div>
        <p>Match the number of cards played: 1, 2, or 5. No standalone triples.</p>
      </section>

      <section aria-labelledby="cheat-combos-title">
        <h3 id="cheat-combos-title">
          Five-card hands <span>Low → high</span>
        </h3>
        <p className="cheat-ladder-intro">
          Each hand beats every type above it. Same type? Use the tie-break below.
        </p>
        <ol className="cheat-combos">
          {combos.map((combo) => (
            <li key={combo.name}>
              <div className="cheat-combo-copy">
                <strong>{combo.name}</strong>
                <span>{combo.detail}</span>
                <small>{combo.tie}</small>
              </div>
              <div className="cheat-hand">
                {combo.cards.map((card) => (
                  <IllustrationCard key={`${card.value}-${card.suit}`} {...card} />
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <aside className="cheat-table-tip">
        <IllustrationCard value="3" suit="DIAMOND" />
        <p>
          <strong>Start small. Finish first.</strong>
          <span>
            The first play must include 3 ♦. Can’t beat a play? Pass. When everyone else passes, the
            last player starts a fresh round with any valid hand.
          </span>
        </p>
      </aside>
    </div>
  );
}
