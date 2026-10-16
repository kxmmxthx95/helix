import type { Content, TableCell } from "pdfmake/interfaces";
import { supabase } from "@/lib/supabase";

const NO_TOPIC = "ไม่ระบุเนื้อหาย่อย";
const thDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium" });

type FileRow = { title: string; created_at: string; topic_id: string | null; uploader: { first_name: string; last_name: string } | null };

/** Fetches a เนื้อหาหลัก's topics + files and downloads an A4 summary PDF (no file contents). pdfmake + fonts load on first use. */
export async function downloadLessonPdf({ lessonId, lessonName, subject, grade }: { lessonId: string; lessonName: string; subject: string; grade: string }) {
  const [topicsRes, filesRes] = await Promise.all([
    supabase.from("doc_topics").select("id, name").eq("lesson_id", lessonId).order("sort_order").order("created_at"),
    // uploader may be hidden by profile RLS for some roles -> left join, shown as "-".
    supabase.from("doc_files").select("title, created_at, topic_id, uploader:profiles!uploaded_by(first_name, last_name)").eq("lesson_id", lessonId).order("created_at"),
  ]);
  if (topicsRes.error) throw topicsRes.error;
  if (filesRes.error) throw filesRes.error;
  const files = filesRes.data as unknown as FileRow[];

  const groups = [
    ...topicsRes.data.map((t) => ({ name: t.name, files: files.filter((f) => f.topic_id === t.id) })),
    { name: NO_TOPIC, files: files.filter((f) => !f.topic_id) },
  ].filter((g) => g.name !== NO_TOPIC || g.files.length > 0);

  const head = (text: string): TableCell => ({ text, bold: true, fillColor: "#eeeeee" });
  const content: Content[] = [
    { text: lessonName, bold: true, fontSize: 16 },
    { text: `${subject} · ${grade}`, color: "#555555", margin: [0, 2, 0, 10] },
    ...groups.flatMap((g): Content[] => [
      { text: `${g.name} (${g.files.length} ไฟล์)`, bold: true, fontSize: 11, margin: [0, 8, 0, 4] },
      g.files.length
        ? {
            table: {
              headerRows: 1,
              widths: ["*", 130, 80],
              body: [
                [head("ชื่อไฟล์"), head("ผู้อัปโหลด"), head("วันที่")],
                ...g.files.map((f): TableCell[] => [
                  f.title,
                  f.uploader ? `${f.uploader.first_name} ${f.uploader.last_name}` : "-",
                  thDate(f.created_at),
                ]),
              ],
            },
            layout: "lightHorizontalLines",
          }
        : { text: "ยังไม่มีไฟล์", color: "#888888" },
    ]),
  ];
  if (groups.length === 0) content.push({ text: "ยังไม่มีเนื้อหาย่อยหรือไฟล์", color: "#888888" });

  const pdfMake = (await import("pdfmake/build/pdfmake")).default;
  const font = (f: string) => new URL(`${import.meta.env.BASE_URL}fonts/${f}`, window.location.href).href;
  pdfMake.addFonts({ Sarabun: { normal: font("Sarabun-Regular.ttf"), bold: font("Sarabun-Bold.ttf") } });
  const printed = new Date().toLocaleDateString("th-TH", { dateStyle: "long" });

  await pdfMake
    .createPdf({
      pageSize: "A4",
      pageMargins: [36, 36, 36, 44],
      defaultStyle: { font: "Sarabun", fontSize: 10 },
      content,
      footer: (page: number, pages: number) => ({
        columns: [
          { text: `พิมพ์เมื่อ ${printed}`, alignment: "left" },
          { text: `หน้า ${page}/${pages}`, alignment: "right" },
        ],
        margin: [36, 8, 36, 0],
        fontSize: 8,
        color: "#666666",
      }),
    })
    .download(`${lessonName}.pdf`);
}
