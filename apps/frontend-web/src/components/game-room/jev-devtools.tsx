import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Activity, ChevronRight, X } from "lucide-react";

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

type PanelPosition = { x: number; y: number };

type DragState = {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  panelX: number;
  panelY: number;
  originLeft: number;
  originTop: number;
  width: number;
  height: number;
};

const VIEWPORT_MARGIN = 8;

export function JevDevtools({ decisions }: { decisions: readonly JevDecisionLogEntry[] }) {
  const [open, setOpen] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<PanelPosition>({ x: 0, y: 0 });
  const [selectedSequence, setSelectedSequence] = useState<number>();
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const newestSequence = decisions[0]?.sequence;

  useEffect(() => {
    if (newestSequence !== undefined) setSelectedSequence(newestSequence);
  }, [newestSequence]);

  if (!open) {
    return (
      <button
        type="button"
        className="jev-devtools-trigger"
        aria-label="Open Jev decision devtools"
        onClick={() => setOpen(true)}
      >
        <Activity aria-hidden="true" />
        <span>JEV</span>
        <i>LIVE</i>
      </button>
    );
  }

  const selected = decisions.find((entry) => entry.sequence === selectedSequence) ?? decisions[0];
  const trace = selected?.decision.trace;
  const panelStyle = {
    "--jev-drag-x": `${position.x}px`,
    "--jev-drag-y": `${position.y}px`,
  } as CSSProperties;

  const startDragging = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    const panel = panelRef.current;
    if (!panel) return;

    const bounds = panel.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      panelX: position.x,
      panelY: position.y,
      originLeft: bounds.left - position.x,
      originTop: bounds.top - position.y,
      width: bounds.width,
      height: bounds.height,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  };

  const movePanel = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const nextX = drag.panelX + event.clientX - drag.pointerX;
    const nextY = drag.panelY + event.clientY - drag.pointerY;
    setPosition({
      x: Math.min(
        window.innerWidth - VIEWPORT_MARGIN - drag.originLeft - drag.width,
        Math.max(VIEWPORT_MARGIN - drag.originLeft, nextX),
      ),
      y: Math.min(
        window.innerHeight - VIEWPORT_MARGIN - drag.originTop - drag.height,
        Math.max(VIEWPORT_MARGIN - drag.originTop, nextY),
      ),
    });
  };

  const stopDragging = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <aside
      ref={panelRef}
      className={`jev-devtools ${dragging ? "is-dragging" : ""}`}
      style={panelStyle}
      aria-label="Jev decision devtools"
    >
      <header
        className="jev-devtools-header"
        title="Drag to move · Double-click to reset"
        onDoubleClick={() => setPosition({ x: 0, y: 0 })}
        onPointerDown={startDragging}
        onPointerMove={movePanel}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <div className="jev-devtools-title">
          <span className="jev-live-light" aria-hidden="true" />
          <div>
            <strong>JEV / DECISION FEED</strong>
            <small>LOCAL TELEMETRY</small>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close Jev decision devtools"
          onClick={() => setOpen(false)}
        >
          <X aria-hidden="true" />
        </button>
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
    </aside>
  );
}
