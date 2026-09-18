import { ChevronDown, Crosshair, Monitor, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";

export type ViewportMetrics = {
  width: number;
  height: number;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
};

export type GameRoomDevToolsProps = {
  handCount: number;
  fanOut: number;
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
};

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
  handCount,
  fanOut,
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
}: GameRoomDevToolsProps) {
  type DragState = {
    pointerId: number;
    startX: number;
    startY: number;
    startPosition: { x: number; y: number };
    bounds: { left: number; top: number; right: number; bottom: number };
  };
  const [open, setOpen] = useState(true);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const toolsRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const draggedRef = useRef(false);
  const viewport = useViewportMetrics();
  const orientation =
    viewport.width && viewport.height
      ? viewport.width >= viewport.height
        ? "landscape"
        : "portrait"
      : "reading viewport";

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !toolsRef.current) return;
    const rect = toolsRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: position,
      bounds: {
        left: 8 - rect.left + position.x,
        top: 8 - rect.top + position.y,
        right: window.innerWidth - rect.width - 8 - rect.left + position.x,
        bottom: window.innerHeight - rect.height - 8 - rect.top + position.y,
      },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!draggedRef.current && Math.hypot(deltaX, deltaY) < 3) return;
    draggedRef.current = true;
    setDragging(true);
    setPosition({
      x: Math.min(drag.bounds.right, Math.max(drag.bounds.left, drag.startPosition.x + deltaX)),
      y: Math.min(drag.bounds.bottom, Math.max(drag.bounds.top, drag.startPosition.y + deltaY)),
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (draggedRef.current) window.setTimeout(() => (draggedRef.current = false), 0);
  };

  return (
    <aside
      ref={toolsRef}
      className={`game-room-dev-tools ${open ? "is-open" : ""} ${dragging ? "is-dragging" : ""}`}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      aria-label="Game room development tools"
    >
      <button
        type="button"
        className="game-room-dev-trigger"
        aria-expanded={open}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={() => {
          if (draggedRef.current) return;
          setOpen((isOpen) => !isOpen);
        }}
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
              hint="stacked ← current → wide"
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
