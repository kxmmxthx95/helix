import { useEquationElement } from "@platejs/math/react";
import { useRef } from "react";
import { PlateElement, type PlateElementProps } from "platejs/react";
import type { TEquationElement } from "platejs";

export function EquationElement(props: PlateElementProps<TEquationElement>) {
  const katexRef = useRef<HTMLDivElement | null>(null);
  useEquationElement({ element: props.element, katexRef });

  return (
    <PlateElement {...props} as="div" className="my-1">
      <div ref={katexRef} contentEditable={false} className="inline-block select-none" />
      {props.children}
    </PlateElement>
  );
}
