import { describe, expect, it } from "vitest";
import { addressOptions, loadThaiAddress } from "@/lib/thaiAddress";

describe("addressOptions", () => {
  it("narrows districts and subdistricts by the earlier choices", async () => {
    const rows = (await loadThaiAddress())["10200"]!;
    const provinces = addressOptions(rows, 0, []);
    expect(provinces).toEqual(["กรุงเทพมหานคร"]);
    const districts = addressOptions(rows, 1, [provinces[0]!]);
    expect(districts).toContain("พระนคร");
    expect(addressOptions(rows, 2, [provinces[0]!, "พระนคร"])).toContain("พระบรมมหาราชวัง");
    expect(addressOptions(rows, 2, [provinces[0]!, "ไม่มีอำเภอนี้"])).toEqual([]);
  });
});
