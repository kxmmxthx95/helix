import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type MobileHeaderCtx = {
  end: ReactNode;
  setEnd: (node: ReactNode) => void;
};

const Ctx = createContext<MobileHeaderCtx | null>(null);

/** Wrap AppShell main pane — exposes the trailing mobile header slot. */
export function MobileHeaderProvider({ children }: { children: ReactNode }) {
  const [end, setEnd] = useState<ReactNode>(null);
  return <Ctx.Provider value={{ end, setEnd }}>{children}</Ctx.Provider>;
}

export function useMobileHeaderSlot(): ReactNode {
  return useContext(Ctx)?.end ?? null;
}

/** Pages register a trailing control (e.g. filter) — cleared on unmount. */
export function useMobileHeaderEnd(node: ReactNode) {
  const ctx = useContext(Ctx);
  useEffect(() => {
    if (!ctx) return;
    ctx.setEnd(node);
    return () => ctx.setEnd(null);
  }, [ctx, node]);
}
