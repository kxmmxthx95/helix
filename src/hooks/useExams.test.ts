import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { countBySession } from "@/hooks/useExams";

// PostgREST caps a response at 1000 rows; counts must cover every page, not just the first.
describe("countBySession", () => {
  it("counts across pages", async () => {
    const rows = [...Array(1165)].map((_, i) => ({ session_id: i < 1000 ? "a" : "b" }));
    const page = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
    const counts = await countBySession(page);
    expect(counts.get("a")).toBe(1000);
    expect(counts.get("b")).toBe(165);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("stops after one page when under the cap", async () => {
    const page = vi.fn(async () => ({ data: [{ session_id: "a" }], error: null }));
    expect((await countBySession(page)).get("a")).toBe(1);
    expect(page).toHaveBeenCalledTimes(1);
  });
});
