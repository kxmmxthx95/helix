import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { ChipFilter, SegmentedFilter } from "@/components/FilterSheet";

it("chips mark the selected one and segmented control is a radiogroup", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const picked: string[] = [];
  await act(async () =>
    createRoot(el).render(
      <>
        <SegmentedFilter label="ขอบเขต" value="mine" onChange={(v) => picked.push(v)} options={[["mine", "ของฉัน"], ["all", "ทุกวิชา"]]} />
        <ChipFilter label="ชั้น" value="g1" onChange={(v) => picked.push(v)} options={[["g1", "ม.1"], ["g2", "ม.2"]]} />
      </>,
    ),
  );
  expect(el.querySelectorAll('[role="radio"][aria-checked="true"]').length).toBe(1);
  expect(el.querySelectorAll('button[aria-pressed="true"]').length).toBe(1);
  expect(el.querySelector('button[aria-pressed="true"]')!.textContent).toBe("ม.1");
  await act(async () => (el.querySelectorAll('[role="radio"]')[1] as HTMLElement).click());
  await act(async () => (el.querySelector('button[aria-pressed="false"]') as HTMLElement).click());
  expect(picked).toEqual(["all", ""]);
});
