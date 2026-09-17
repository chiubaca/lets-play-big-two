import { ChevronDown, Crosshair, Monitor, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

export type ViewportMetrics = {
  width: number;
  height: number;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
};

export const DEFAULT_DEV_LAYOUT = {
  fanOut: 100,
  arc: 5,
  selectedLift: 27,
  showGuides: false,
  showCardOrder: false,
  motion: true,
} as const;

const EMPTY_VIEWPORT: ViewportMetrics = {
  width: 0,
  height: 0,
  screenWidth: 0,
  screenHeight: 0,
  devicePixelRatio: 1,
};

function readViewportMetrics(): ViewportMetrics {
  if (typeof window === "undefined") return EMPTY_VIEWPORT;

  return {
    width: Math.round(window.visualViewport?.width ?? window.innerWidth),
    height: Math.round(window.visualViewport?.height ?? window.innerHeight),
    screenWidth: window.screen?.width ?? window.innerWidth,
    screenHeight: window.screen?.height ?? window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

export function useViewportMetrics() {
  const [metrics, setMetrics] = useState(EMPTY_VIEWPORT);

  useEffect(() => {
    const update = () => setMetrics(readViewportMetrics());
    update();

    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return metrics;
}

type RangeControlProps = {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  output: string;
  onChange: (value: number) => void;
};

function RangeControl({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  output,
  onChange,
}: RangeControlProps) {
  return (
    <label className="game-room-dev-range" htmlFor={id}>
      <span className="game-room-dev-range-header">
        <span>{label}</span>
        <output htmlFor={id}>{output}</output>
      </span>
      <input
        id={id}
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="game-room-dev-range-hint">{hint}</span>
    </label>
  );
}

type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="game-room-dev-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function GameRoomDevTools({
  viewport,
  handCount,
  fanOut,
  fanOutAuto = false,
  arc,
  selectedLift,
  showGuides,
  showCardOrder,
  motion,
  onFanOutChange,
  onArcChange,
  onSelectedLiftChange,
  onShowGuidesChange,
  onShowCardOrderChange,
  onMotionChange,
  onReset,
}: {
  viewport: ViewportMetrics;
  handCount: number;
  fanOut: number;
  fanOutAuto?: boolean;
  arc: number;
  selectedLift: number;
  showGuides: boolean;
  showCardOrder: boolean;
  motion: boolean;
  onFanOutChange: (value: number) => void;
  onArcChange: (value: number) => void;
  onSelectedLiftChange: (value: number) => void;
  onShowGuidesChange: (value: boolean) => void;
  onShowCardOrderChange: (value: boolean) => void;
  onMotionChange: (value: boolean) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(true);
  const orientation =
    viewport.width && viewport.height
      ? viewport.width >= viewport.height
        ? "landscape"
        : "portrait"
      : "reading viewport";

  return (
    <aside
      className={`game-room-dev-tools ${open ? "is-open" : ""}`}
      aria-label="Game room development tools"
    >
      <button
        type="button"
        className="game-room-dev-trigger"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="game-room-dev-live-dot" aria-hidden="true" />
        <SlidersHorizontal aria-hidden="true" />
        <span>Dev tools</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="game-room-dev-panel">
          <section className="game-room-dev-section" aria-labelledby="dev-viewport-title">
            <div className="game-room-dev-section-heading">
              <span id="dev-viewport-title">Viewport</span>
              <span className="game-room-dev-live-label">Live</span>
            </div>
            <div className="game-room-dev-viewport">
              <Monitor aria-hidden="true" />
              <strong>{viewport.width ? `${viewport.width} × ${viewport.height}` : "— × —"}</strong>
            </div>
            <div className="game-room-dev-meta">
              <span>{orientation}</span>
              <span>{viewport.devicePixelRatio}× DPR</span>
              <span>
                screen{" "}
                {viewport.screenWidth ? `${viewport.screenWidth} × ${viewport.screenHeight}` : "—"}
              </span>
            </div>
          </section>

          <section className="game-room-dev-section" aria-labelledby="dev-hand-title">
            <div className="game-room-dev-section-heading">
              <span id="dev-hand-title">Hand layout</span>
              <span>{handCount} cards</span>
            </div>
            <RangeControl
              id="dev-fan-out"
              label="Fan out"
              min={0}
              max={160}
              step={5}
              value={fanOut}
              output={`${fanOut}%`}
              hint={
                fanOutAuto ? "19+ cards → auto 160% · move to override" : "stacked ← current → wide"
              }
              onChange={onFanOutChange}
            />
            <RangeControl
              id="dev-card-arc"
              label="Card arc"
              hint="flat ← current → curved"
              min={0}
              max={12}
              step={0.5}
              value={arc}
              output={`${arc.toFixed(1)} cqw`}
              onChange={onArcChange}
            />
            <RangeControl
              id="dev-selected-lift"
              label="Selected lift"
              hint="selection offset from the hand"
              min={0}
              max={50}
              step={1}
              value={selectedLift}
              output={`${selectedLift}px`}
              onChange={onSelectedLiftChange}
            />
          </section>

          <section className="game-room-dev-section" aria-labelledby="dev-inspection-title">
            <div className="game-room-dev-section-heading">
              <span id="dev-inspection-title">Inspection</span>
              <Crosshair aria-hidden="true" />
            </div>
            <Toggle label="Layout guides" checked={showGuides} onChange={onShowGuidesChange} />
            <Toggle label="Card order" checked={showCardOrder} onChange={onShowCardOrderChange} />
            <Toggle label="Motion" checked={motion} onChange={onMotionChange} />
          </section>

          <button type="button" className="game-room-dev-reset" onClick={onReset}>
            <RotateCcw aria-hidden="true" />
            Reset layout
          </button>
        </div>
      )}
    </aside>
  );
}
