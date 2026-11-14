import type { Student } from "@/lib/database.types";

const lightHorizontalLines = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0 : 1),
  vLineWidth: () => 0,
  hLineColor: () => "#dddddd",
};

type Row = Pick<Student, "student_code" | "prefix" | "first_name" | "last_name">;

/** Builds the A4 name list for one classroom. pdfmake + fonts load on first use. */
async function buildRosterPdf(label: string, students: Row[]) {
  const pdfMake = (await import("pdfmake/build/pdfmake")).default;
  const font = (f: string) => new URL(`${import.meta.env.BASE_URL}fonts/${f}`, window.location.href).href;
  pdfMake.addFonts({ Sarabun: { normal: font("Sarabun-Regular.ttf"), bold: font("Sarabun-Bold.ttf") } });

  return pdfMake.createPdf({
      pageSize: "A4",
      pageMargins: [36, 36, 36, 36],
      defaultStyle: { font: "Sarabun", fontSize: 12 },
      content: [
        { text: `รายชื่อนักเรียน ${label}`, bold: true, fontSize: 16 },
        { text: `จำนวน ${students.length} คน`, color: "#666666", margin: [0, 2, 0, 10] },
        {
          table: {
            headerRows: 1,
            widths: [40, 80, 70, "*", "*"],
            body: [
              ["เลขที่", "รหัสนักเรียน", "คำนำหน้า", "ชื่อ", "นามสกุล"].map((text) => ({ text, bold: true, fillColor: "#f1f1f4" })),
              ...students.map((s, i) => [String(i + 1), s.student_code, s.prefix ?? "", s.first_name, s.last_name]),
            ],
          },
          layout: { ...lightHorizontalLines, paddingTop: () => 6, paddingBottom: () => 6 },
        },
      ],
  });
}

/** Saves the name list as a PDF file. */
export async function downloadRosterPdf(label: string, students: Row[]) {
  await (await buildRosterPdf(label, students)).download(`รายชื่อนักเรียน-${label.replace("/", "-")}.pdf`);
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Same list as HTML for the preview/print iframe — a PDF embed renders blank in some browsers (iPad Safari), HTML never does. */
export function rosterHtml(label: string, students: Row[]) {
  const font = (f: string) => new URL(`${import.meta.env.BASE_URL}fonts/${f}`, window.location.href).href;
  const rows = students
    .map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.student_code)}</td><td>${esc(s.prefix ?? "")}</td><td>${esc(s.first_name)}</td><td>${esc(s.last_name)}</td></tr>`)
    .join("");
  return `<!doctype html><meta charset="utf-8"><style>
    @font-face{font-family:Sarabun;src:url(${font("Sarabun-Regular.ttf")})}
    @font-face{font-family:Sarabun;font-weight:700;src:url(${font("Sarabun-Bold.ttf")})}
    @page{size:A4;margin:12mm}
    body{margin:16px;font:12pt Sarabun,"Noto Sans Thai",sans-serif;color:#000}
    h1{font-size:16pt;margin:0}p{margin:2px 0 10px;color:#666}
    table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #ddd}
    th{background:#f1f1f4}thead{display:table-header-group}tr{break-inside:avoid}
  </style><h1>รายชื่อนักเรียน ${esc(label)}</h1><p>จำนวน ${students.length} คน</p>
  <table><thead><tr><th style="width:50px">เลขที่</th><th style="width:110px">รหัสนักเรียน</th><th style="width:90px">คำนำหน้า</th><th>ชื่อ</th><th>นามสกุล</th></tr></thead><tbody>${rows}</tbody></table>`;
}
