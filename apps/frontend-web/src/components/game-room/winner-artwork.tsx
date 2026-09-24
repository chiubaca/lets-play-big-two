import { Component, lazy, Suspense, type ReactNode } from "react";

const WinnerEmblem = lazy(() => import("./winner-emblem"));

function EmblemFallback() {
  return <img className="winner-emblem-fallback" src="/models/gold-spade-2.png" alt="" />;
}

class EmblemBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <EmblemFallback /> : this.props.children;
  }
}

export function WinnerArtwork({ isWinner }: { isWinner: boolean }) {
  if (!isWinner) {
    return (
      <div className="winner-artwork winner-artwork-loss" aria-hidden="true">
        <img src="/too-bad.png" alt="" width="1675" height="952" />
      </div>
    );
  }

  return (
    <div className="winner-artwork" aria-hidden="true">
      <div className="winner-emblem">
        <EmblemBoundary>
          <Suspense fallback={<EmblemFallback />}>
            <WinnerEmblem />
          </Suspense>
        </EmblemBoundary>
      </div>
      <div className="winner-wordmark">
        <img src="/winner.png" alt="" width="1454" height="1069" />
      </div>
    </div>
  );
}
