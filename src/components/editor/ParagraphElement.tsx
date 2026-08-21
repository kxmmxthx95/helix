import { PlateElement, type PlateElementProps } from "platejs/react";
import type { TElement } from "platejs";
import { cn } from "@/lib/utils";

type ListParagraph = TElement & { indent?: number; listStyleType?: string };

/** @platejs/list models a bullet item as a plain paragraph carrying indent/listStyleType — not a nested ul/li — so the marker renders here rather than in a separate list-item component. */
export function ParagraphElement(props: PlateElementProps<ListParagraph>) {
  const { indent, listStyleType } = props.element;

  return (
    <PlateElement
      {...props}
      as="p"
      className={cn("mb-1 last:mb-0", listStyleType && "relative")}
      style={indent ? { paddingLeft: `${indent * 1.5}em` } : undefined}
    >
      {listStyleType && <span className="absolute -translate-x-4">•</span>}
      {props.children}
    </PlateElement>
  );
}
