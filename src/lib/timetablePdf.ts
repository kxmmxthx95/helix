import type { Content } from "pdfmake/interfaces";
import type { PeriodDefinition } from "@/lib/database.types";

const DAY_LABEL: Record<number, string> = { 1: "จันทร์", 2: "อังคาร", 3: "พุธ", 4: "พฤหัสบดี", 5: "ศุกร์", 6: "เสาร์" };
const hhmm = (t: string) => t.slice(0, 5);

export type PdfCell = { day: number; periodNo: number; code: string; name: string; extra: string; fill: string | null };
/** One printed page: a classroom's or a teacher's week. */
export type PdfSheet = { title: string; subtitle: string; periods: PeriodDefinition[]; cells: PdfCell[] };

/** Builds one A4-landscape PDF (a page per sheet) and downloads it. pdfmake + fonts load only on first use. */
export async function downloadTimetablePdf({
  schoolName,
  sheets,
  color,
  fileName,
}: {
  schoolName: string;
  sheets: PdfSheet[];
  color: boolean;
  fileName: string;
}) {
  const pdfMake = (await import("pdfmake/build/pdfmake")).default;
  const font = (f: string) => new URL(`${import.meta.env.BASE_URL}fonts/${f}`, window.location.href).href;
  pdfMake.addFonts({ Sarabun: { normal: font("Sarabun-Regular.ttf"), bold: font("Sarabun-Bold.ttf") } });

  const printed = new Date().toLocaleDateString("th-TH", { dateStyle: "long" });
  const content = sheets.map((sheet, i) => ({
    ...(i > 0 ? { pageBreak: "before" as const } : {}),
    stack: [
      { text: schoolName, bold: true, fontSize: 14, alignment: "center" as const },
      { text: sheet.title, bold: true, fontSize: 12, alignment: "center" as const, margin: [0, 2, 0, 0] as [number, number, number, number] },
      { text: sheet.subtitle, fontSize: 9, alignment: "center" as const, margin: [0, 0, 0, 6] as [number, number, number, number] },
      sheetTable(sheet, color),
    ],
  }));

  await pdfMake
    .createPdf({
      pageSize: "A4",
      pageOrientation: "landscape",
      pageMargins: [24, 24, 24, 32],
      defaultStyle: { font: "Sarabun", fontSize: 9 },
      content: content as unknown as Content,
      footer: (page: number, pages: number) => ({
        columns: [
          { text: `พิมพ์เมื่อ ${printed}`, alignment: "left" },
          { text: `หน้า ${page}/${pages}`, alignment: "right" },
        ],
        margin: [24, 8, 24, 0],
        fontSize: 8,
        color: "#666666",
      }),
    })
    .download(fileName);
}

function sheetTable(sheet: PdfSheet, color: boolean) {
  const { periods, cells } = sheet;
  const days = [...new Set(periods.map((p) => p.day_of_week))].sort((a, b) => a - b);
  const maxNo = Math.max(0, ...periods.map((p) => p.period_no));
  const periodAt = new Map(periods.map((p) => [`${p.day_of_week}-${p.period_no}`, p]));
  const cellsAt = new Map<string, PdfCell[]>();
  for (const c of cells) cellsAt.set(`${c.day}-${c.periodNo}`, [...(cellsAt.get(`${c.day}-${c.periodNo}`) ?? []), c]);

  // Teaching-period number shown to people: breaks don't count (same rule as the on-screen grid).
  const ordinal = (no: number) => {
    let n = 0;
    for (let i = 1; i <= no; i++) if (days.some((d) => periodAt.get(`${d}-${i}`)?.period_type === "teaching")) n++;
    return n;
  };
  const head = (text: string) => ({ text, bold: true, alignment: "center" as const, fillColor: "#eeeeee", margin: [0, 3, 0, 3] as [number, number, number, number] });
  const span = days.length + 1;
  const body: unknown[][] = [[head("คาบ / เวลา"), ...days.map((d) => head(DAY_LABEL[d] ?? String(d)))]];

  for (let no = 1; no <= maxNo; no++) {
    const slots = days.map((d) => periodAt.get(`${d}-${no}`));
    const first = slots.find(Boolean);
    if (first && slots.every((p) => !p || p.period_type === "break")) {
      body.push([
        { text: `${first.label}  ${hhmm(first.start_time)} – ${hhmm(first.end_time)}`, colSpan: span, alignment: "center", fillColor: "#f5f5f5", color: "#555555" },
        ...Array.from({ length: span - 1 }, () => ({})),
      ]);
      continue;
    }
    const time = first ? `${hhmm(first.start_time)} – ${hhmm(first.end_time)}` : "";
    body.push([
      { stack: [{ text: String(slots.some((p) => p?.period_type === "teaching") ? ordinal(no) : "—"), bold: true, fontSize: 12 }, { text: time, fontSize: 7, color: "#555555" }], alignment: "center", fillColor: "#fafafa" },
      ...days.map((d, i) => {
        const pd = slots[i];
        if (pd?.period_type === "break") return { text: pd.label, alignment: "center", color: "#777777", fillColor: "#f5f5f5" };
        const here = cellsAt.get(`${d}-${no}`) ?? [];
        const fill = color ? here.find((c) => c.fill)?.fill : null;
        return {
          ...(fill ? { fillColor: fill } : {}),
          stack: here.map((c, k) => ({
            margin: [0, k ? 3 : 0, 0, 0] as [number, number, number, number],
            stack: [
              { text: c.code, bold: true },
              { text: c.name, fontSize: 8 },
              { text: c.extra, fontSize: 7, color: "#444444" },
            ],
          })),
        };
      }),
    ]);
  }

  return {
    table: { headerRows: 1, dontBreakRows: true, widths: [52, ...days.map(() => "*")], body },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "#999999", vLineColor: () => "#999999", paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 6, paddingBottom: () => 6 },
  };
}
