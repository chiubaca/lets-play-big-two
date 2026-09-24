import { useEffect, useState } from "react";
import { Activity, ChevronRight } from "lucide-react";

import { useJevDevtools } from "./jev-devtools-context";
import type { JevDecisionLogEntry } from "./use-offline-game";
import "./jev-devtools.css";

const suitSymbols = {
  CLUB: "♣",
  DIAMOND: "♦",
  HEART: "♥",
  SPADE: "♠",
} as const;

function formatAction(entry: JevDecisionLogEntry): string {
  const { cards } = entry.decision;
  if (!cards?.length) return "PASS";
  return cards.map((card) => `${card.value}${suitSymbols[card.suit]}`).join(" · ");
}

function formatQuestionName(questionId: string): string {
  if (questionId === "play_or_pass") return "Tempo decision";
  if (questionId === "best_play") return "Best response";
  if (questionId === "best_move") return "Opening line";
  return questionId.replaceAll("_", " ");
}

function formatPercent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

export function JevDevtools() {
  const { decisions } = useJevDevtools();
  const [selectedSequence, setSelectedSequence] = useState<number>();
  const newestSequence = decisions[0]?.sequence;

  useEffect(() => {
    if (newestSequence !== undefined) setSelectedSequence(newestSequence);
  }, [newestSequence]);

  const selected = decisions.find((entry) => entry.sequence === selectedSequence) ?? decisions[0];
  const trace = selected?.decision.trace;

  return (
    <section className="jev-devtools" aria-label="Jev decision devtools">
      <header className="jev-devtools-header">
        <div className="jev-devtools-title">
          <span className="jev-live-light" aria-hidden="true" />
          <div>
            <strong>JEV / DECISION FEED</strong>
            <small>LOCAL TELEMETRY</small>
          </div>
        </div>
      </header>

      {!selected ? (
        <div className="jev-devtools-empty">
          <Activity aria-hidden="true" />
          <strong>Awaiting inference</strong>
          <span>Set an opponent to Jev. Its next decision will stream here.</span>
        </div>
      ) : (
        <div className="jev-devtools-body">
          <section className="jev-verdict" aria-label="Selected action">
            <div className="jev-verdict-meta">
              <span>TURN {String(selected.sequence).padStart(2, "0")}</span>
              <span>{selected.playerName.toUpperCase()}</span>
              <span className={`jev-source jev-source-${selected.decision.source}`}>
                {selected.decision.source}
              </span>
            </div>
            <div className="jev-verdict-action">
              <small>EXECUTE</small>
              <strong>{formatAction(selected)}</strong>
              {selected.decision.confidence !== undefined && (
                <span>{formatPercent(selected.decision.confidence)} CONF</span>
              )}
            </div>
          </section>

          {trace ? (
            <div className="jev-question-list">
              {Object.entries(trace.questions).map(([questionId, question]) => {
                const probabilities = Object.entries(question.probabilities).sort(
                  ([, left], [, right]) => right - left,
                );
                const visibleProbabilities = probabilities.slice(0, 4);

                return (
                  <section className="jev-question" key={questionId}>
                    <div className="jev-question-heading">
                      <span>{formatQuestionName(questionId)}</span>
                      <small>{formatPercent(question.confidence)} confidence</small>
                    </div>
                    <div className="jev-probability-list">
                      {visibleProbabilities.map(([option, probability]) => {
                        const selectedOption = option === question.choice;
                        const optionLabel = question.options[option] ?? option;
                        return (
                          <div
                            className={`jev-probability ${selectedOption ? "is-selected" : ""}`}
                            key={option}
                          >
                            <div className="jev-probability-label">
                              <span title={optionLabel}>{optionLabel}</span>
                              <strong>{formatPercent(probability)}</strong>
                            </div>
                            <div
                              className="jev-probability-track"
                              role="progressbar"
                              aria-label={`${optionLabel} probability`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(probability * 100)}
                            >
                              <i style={{ width: `${Math.max(1, probability * 100)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {probabilities.length > visibleProbabilities.length && (
                      <small className="jev-more-options">
                        +{probabilities.length - visibleProbabilities.length} lower-probability
                        moves
                      </small>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="jev-no-trace">
              <strong>No model trace</strong>
              <span>
                {selected.decision.source === "forced"
                  ? "Only one legal action was available."
                  : "The deterministic fallback made this move."}
              </span>
            </div>
          )}

          {decisions.length > 1 && (
            <section className="jev-history" aria-label="Previous Jev decisions">
              <span className="jev-history-label">EVENT BUFFER</span>
              <div>
                {decisions.map((entry) => (
                  <button
                    type="button"
                    className={entry.sequence === selected.sequence ? "is-active" : ""}
                    key={entry.sequence}
                    onClick={() => setSelectedSequence(entry.sequence)}
                  >
                    <span>#{String(entry.sequence).padStart(2, "0")}</span>
                    <strong>{entry.playerName}</strong>
                    <i>{formatAction(entry)}</i>
                    <ChevronRight aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          )}

          <footer className="jev-devtools-footer">
            <span>{selected.decision.model ?? "deterministic"}</span>
            <span>{trace ? trace.selectedAction : selected.decision.source}</span>
          </footer>
        </div>
      )}
    </section>
  );
}
