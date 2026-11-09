import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stageSpacing, stageZs } from "./ForestWorld";

const world = vi.hoisted(() => ({ focus: vi.fn(), resize: vi.fn(), dispose: vi.fn(), create: vi.fn() }));
vi.mock("./ForestWorld", async (orig) => ({
  ...(await orig<typeof import("./ForestWorld")>()),
  createForestWorld: (...a: unknown[]) => { world.create(...a); return { focus: world.focus, resize: world.resize, dispose: world.dispose, stageZ: [] }; },
}));
import { ForestScene } from "./ForestScene";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ""; vi.clearAllMocks(); });
const nodes = [{ id: "a", name: "บทที่ 1" }, { id: "b", name: "บทที่ 2" }, { id: "c", name: "บทที่ 3" }];
async function mount(props: Partial<React.ComponentProps<typeof ForestScene>> = {}) {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const onSelect = vi.fn();
  await act(async () => root!.render(<ForestScene nodes={nodes} selectedId={null} onSelect={onSelect} {...props} />));
  return onSelect;
}
const btn = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

describe("forest stage spacing", () => {
  it("keeps 6 m up to 9 stages and never below 3.2 m", () => {
    expect(stageSpacing(1)).toBe(6); expect(stageSpacing(9)).toBe(6); expect(stageSpacing(40)).toBe(3.2);
    const z = stageZs(4); expect(z).toHaveLength(4); expect(z[0]! - z[1]!).toBe(6);
  });
});

describe("ForestScene", () => {
  it("creates one world per stage count and moves focus with previous/next without opening a lesson", async () => {
    const onSelect = await mount();
    expect(world.create).toHaveBeenCalledTimes(1); expect(world.create.mock.calls[0]![1].stageCount).toBe(3);
    await act(async () => btn("ด่านถัดไป").click());
    expect(world.focus).toHaveBeenLastCalledWith(1);
    expect(document.body.textContent).toContain("บทที่ 2");
    expect(onSelect).not.toHaveBeenCalled();
    await act(async () => btn("ด่านก่อนหน้า").click());
    expect(world.focus).toHaveBeenLastCalledWith(0);
    expect(btn("ด่านก่อนหน้า").disabled).toBe(true);
  });
  it("opens the focused lesson only through the open button", async () => {
    const onSelect = await mount();
    await act(async () => btn("ด่านถัดไป").click());
    const open = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("เปิดบทเรียน"))!;
    await act(async () => open.click());
    expect(onSelect).toHaveBeenCalledWith("b");
  });
  it("follows an externally selected lesson and shows labelled samples without an open button when empty", async () => {
    await mount({ selectedId: "c" });
    expect(world.focus).toHaveBeenLastCalledWith(2);
    await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = "";
    await mount({ nodes: [] });
    expect(document.body.textContent).toContain("ตัวอย่างฉาก");
    expect([...document.querySelectorAll("button")].some((b) => b.textContent?.includes("เปิดบทเรียน"))).toBe(false);
  });
  it("supports arrow keys and has no orbit/zoom handlers on the canvas", async () => {
    await mount();
    const group = document.querySelector<HTMLElement>("[role=group]")!;
    await act(async () => { group.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(world.focus).toHaveBeenLastCalledWith(1);
    expect(document.querySelector("canvas")!.getAttribute("aria-hidden")).toBe("true");
  });
  it("gives every world its own canvas so StrictMode's double mount never reuses a context-lost canvas", async () => {
    const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root!.render(<StrictMode><ForestScene nodes={nodes} selectedId={null} onSelect={() => {}} /></StrictMode>));
    const canvases = world.create.mock.calls.map((c) => c[0] as HTMLCanvasElement);
    expect(canvases.length).toBeGreaterThanOrEqual(2);
    expect(new Set(canvases).size).toBe(canvases.length);
    expect(world.dispose).toHaveBeenCalledTimes(canvases.length - 1);
    expect(document.querySelectorAll("canvas")).toHaveLength(1);
    expect(canvases[canvases.length - 1]!.isConnected).toBe(true);
  });
});
