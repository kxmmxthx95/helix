import { describe, expect, it } from "vitest";
import { resolveCardRows } from "@/components/ImportCardsSheet";

const ids = new Map([["S1", "id1"], ["S2", "id2"], ["S3", "id3"]]);
const row = (student_code: string, card_uid: string) => ({ student_code, card_uid });

describe("resolveCardRows", () => {
  it("binds known students with free cards", () => {
    const r = resolveCardRows([row("S1", "A"), row("S2", "B")], ids, new Set(), new Set());
    expect(r.ready.map((x) => [x.student_id, x.card_uid])).toEqual([["id1", "A"], ["id2", "B"]]);
    expect(r.skipped).toEqual([]);
  });
  it("skips unknown codes, students who hold a card, and used or repeated card numbers", () => {
    const r = resolveCardRows(
      [row("S9", "A"), row("S1", "B"), row("S2", "USED"), row("S3", "C"), row("S3", "D"), row("S2", "C")],
      ids,
      new Set(["id1"]),
      new Set(["USED"]),
    );
    expect(r.ready.map((x) => x.card_uid)).toEqual(["C"]);
    expect(r.skipped.map((x) => x.line)).toEqual([2, 3, 4, 6, 7]);
  });
});
