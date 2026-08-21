import { PlateElement, type PlateElementProps } from "platejs/react";
import type { TImageElement } from "platejs";

export function ImageElement(props: PlateElementProps<TImageElement>) {
  return (
    <PlateElement {...props} as="div" className="my-1">
      <img src={props.element.url} alt="" draggable={false} className="max-w-full rounded-lg" />
      {props.children}
    </PlateElement>
  );
}
