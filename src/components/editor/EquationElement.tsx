import { useEquationElement } from "@platejs/math/react";
import { useRef } from "react";
import { PlateElement, type PlateElementProps } from "platejs/react";
import type { TEquationElement } from "platejs";

/** Handles both EquationPlugin (block) and InlineEquationPlugin (inline, what the toolbar's formula button inserts) — renders as an inline span either way since nothing in this app's toolbar offers a standalone block equation. useEquationElement's ref type is HTMLDivElement but it only calls katex.render() on the node, which works on any element — a <div> here would be invalid HTML nested inside the surrounding <p>. */
export function EquationElement(props: PlateElementProps<TEquationElement>) {
  const katexRef = useRef<HTMLElement | null>(null);
  useEquationElement({ element: props.element, katexRef: katexRef as React.MutableRefObject<HTMLDivElement | null>, options: { throwOnError: false } });

  return (
    <PlateElement {...props} as="span">
      <span ref={katexRef as React.RefObject<HTMLSpanElement>} contentEditable={false} className="inline-block select-none align-middle" />
      {props.children}
    </PlateElement>
  );
}
