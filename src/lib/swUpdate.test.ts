import { describe, expect, it } from "vitest";
import { IDLE_MS, applyWaitingIfIdle, shouldReload } from "./swUpdate";

describe("shouldReload", () => {
  it("needs long absence and empty outbox", () => {
    expect(shouldReload(IDLE_MS, 0)).toBe(true);
    expect(shouldReload(IDLE_MS - 1, 0)).toBe(false);
    expect(shouldReload(IDLE_MS, 1)).toBe(false);
  });
});

describe("applyWaitingIfIdle exam guard", () => {
  const reg = { waiting: {} } as ServiceWorkerRegistration;
  const run = async (path: string, key: boolean) => {
    history.replaceState(null, "", path);
    localStorage.clear();
    if (key) localStorage.setItem("helix-exam-answers:a1", "{}");
    let applied = false;
    await applyWaitingIfIdle(reg, IDLE_MS, () => (applied = true));
    return applied;
  };

  it("blocks reload mid-exam, allows otherwise", async () => {
    expect(await run("/exams", true)).toBe(false);
    expect(await run("/exams", false)).toBe(true);
    expect(await run("/students", true)).toBe(true);
  });
});
