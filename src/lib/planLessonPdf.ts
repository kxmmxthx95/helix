import type { Content } from "pdfmake/interfaces";
import type { PlanLessonNode } from "@/hooks/usePlan";

/** Downloads an A4 PDF of one บทเรียน of ผังการเรียน: related subject codes, numbered หัวข้อ, linked document titles. pdfmake + fonts load on first use. */
export async function downloadPlanLessonPdf({
  lesson,
  index,
  subject,
  grade,
}: {
  lesson: PlanLessonNode;
  index: number;
  subject: string;
  grade: string;
}) {
  const muted = "#555555";
  const fileLine = (files: PlanLessonNode["files"]): Content[] =>
    files.length ? [{ text: `เอกสาร: ${files.map((f) => f.file?.title ?? "(ไม่มีสิทธิ์ดูไฟล์)").join(", ")}`, color: muted, fontSize: 9, margin: [0, 2, 0, 0] }] : [];

  const content: Content[] = [
    { text: `บทที่ ${index + 1} ${lesson.name}`, bold: true, fontSize: 16 },
    { text: `${subject} · ${grade}`, color: muted, margin: [0, 2, 0, 6] },
    ...(lesson.tags.length
      ? [{ text: `รายวิชาที่เกี่ยวข้อง: ${lesson.tags.map((t) => `${t.subject.code} ${t.subject.name_th}`).join(", ")}`, margin: [0, 0, 0, 6] } as Content]
      : []),
    ...fileLine(lesson.files),
    { text: `หัวข้อ (${lesson.topics.length})`, bold: true, fontSize: 11, margin: [0, 10, 0, 4] },
    ...(lesson.topics.length
      ? lesson.topics.flatMap((t, i): Content[] => [
          { text: `${index + 1}.${i + 1}  ${t.name}`, margin: [0, 3, 0, 0] },
          ...fileLine(t.files),
        ])
      : [{ text: "ยังไม่มีหัวข้อ", color: "#888888" } as Content]),
  ];

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
    .download(`${subject} ${grade} ${lesson.name}.pdf`);
}
PYEOF 2>/dev/null
python3 - <<'PYEOF'
p='src/routes/CurriculumMap.tsx'
s=open(p).read()
def rep(a,b):
    global s
    assert a in s,a
    s=s.replace(a,b,1)
rep('PaletteIcon, Plus, PricetagIcon,','PaletteIcon, Plus, PricetagIcon, PrintIcon,')
rep('import { PLAN_HUES,','import { downloadPlanLessonPdf } from "@/lib/planLessonPdf";\nimport { PLAN_HUES,')
rep('''            subjectId={subject.id}
            departmentId={subject.department_id}''','''            subjectId={subject.id}
            subjectName={subject.name}
            departmentId={subject.department_id}''')
rep('''function GradeSection({
  subjectId,
  departmentId,''','''function GradeSection({
  subjectId,
  subjectName,
  departmentId,''')
rep('''  subjectId: string;
  departmentId: string;
  grade: GradeLevel;''','''  subjectId: string;
  subjectName: string;
  departmentId: string;
  grade: GradeLevel;''')
rep('<LessonCard key={l.id} lesson={l} index={i} departmentId={departmentId} mayEdit={mayEdit} />','<LessonCard\n          key={l.id}\n          lesson={l}\n          index={i}\n          subjectName={subjectName}\n          gradeLabel={gradeShortLabel(grade.code)}\n          departmentId={departmentId}\n          mayEdit={mayEdit}\n        />')
rep('''function LessonCard({
  lesson,
  index,
  departmentId,
  mayEdit,
}: {
  lesson: PlanLessonNode;
  index: number;
  departmentId: string;''','''function LessonCard({
  lesson,
  index,
  subjectName,
  gradeLabel,
  departmentId,
  mayEdit,
}: {
  lesson: PlanLessonNode;
  index: number;
  subjectName: string;
  gradeLabel: string;
  departmentId: string;''')
rep('''  const [tagging, setTagging] = useState(false);''','''  const [tagging, setTagging] = useState(false);
  const [printing, setPrinting] = useState(false);''')
rep('''  function deleteLesson() {''','''  function printPdf() {
    setPrinting(true);
    downloadPlanLessonPdf({ lesson, index, subject: subjectName, grade: gradeLabel })
      .catch(() => toast("สร้าง PDF ไม่สำเร็จ", "error"))
      .finally(() => setPrinting(false));
  }

  function deleteLesson() {''')
rep('''        {mayEdit && (
          <>
            <Button
              className="active:scale-100"
              size="icon"
              variant="ghost"
              aria-label={`ติดแท็กรายวิชากับบทเรียน ${lesson.name}`}''','''        <Button
          className="active:scale-100"
          size="icon"
          variant="ghost"
          aria-label={`พิมพ์ PDF บทเรียน ${lesson.name}`}
          disabled={printing}
          onClick={printPdf}
        >
          <PrintIcon className="h-3 w-3" />
        </Button>
        {mayEdit && (
          <>
            <Button
              className="active:scale-100"
              size="icon"
              variant="ghost"
              aria-label={`ติดแท็กรายวิชากับบทเรียน ${lesson.name}`}''')
open(p,'w').write(s)
PYEOF
npx tsc --noEmit -p . | head