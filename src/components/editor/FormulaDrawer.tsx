import "mathlive";
import type { MathfieldElement } from "mathlive";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "@/components/icons";
import { Button } from "@/components/ui";

/** Centered popup (not the usual side Sheet) wrapping a mathlive <math-field> — its virtual keyboard docks to the bottom automatically on focus, matching the reference screenshot. Mounted imperatively since <math-field> is a web component with no JSX typing. */
export function FormulaDrawer({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (latex: string) => void;
}) {
  const fieldRef = useRef<MathfieldElement | null>(null);
  const [latex, setLatex] = useState("");

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      fieldRef.current?.remove();
      fieldRef.current = null;
      return;
    }
    const field = document.createElement("math-field") as MathfieldElement;
    field.value = "";
    field.addEventListener("input", () => setLatex(field.getValue("latex")));
    node.appendChild(field);
    fieldRef.current = field;
    field.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  function insert() {
    if (!latex.trim()) return;
    onInsert(latex.trim());
    onOpenChange(false);
    setLatex("");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="glass-sidebar relative w-full max-w-md rounded-2xl bg-white/[0.85] p-4 dark:bg-white/[0.06]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-base font-semibold">สูตร</h2>
          <Button size="icon" variant="ghost" aria-label="ปิด" onClick={() => onOpenChange(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
        <div ref={containerRef} className="rounded-lg border border-input bg-background px-2.5 py-2" />
        <Button className="mt-3 w-full" onClick={insert} disabled={!latex.trim()}>
          แทรก
        </Button>
      </div>
    </div>
  );
}
