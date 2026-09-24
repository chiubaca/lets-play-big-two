import { createContext, useContext, useState, type ReactNode } from "react";

import type { JevDecisionLogEntry } from "./use-offline-game";

const JevDevtoolsContext = createContext<{
  decisions: readonly JevDecisionLogEntry[];
  setDecisions: (decisions: readonly JevDecisionLogEntry[]) => void;
} | null>(null);

export function JevDevtoolsProvider({ children }: { children: ReactNode }) {
  const [decisions, setDecisions] = useState<readonly JevDecisionLogEntry[]>([]);
  return (
    <JevDevtoolsContext.Provider value={{ decisions, setDecisions }}>
      {children}
    </JevDevtoolsContext.Provider>
  );
}

export function useJevDevtools() {
  const context = useContext(JevDevtoolsContext);
  if (!context) throw new Error("Jev devtools must be used within JevDevtoolsProvider");
  return context;
}
