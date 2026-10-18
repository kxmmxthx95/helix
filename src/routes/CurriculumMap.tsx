import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { AppsIcon, BookIcon, ChevronForward, ClipboardIcon, DocumentTextIcon, LibraryIcon, LinkIcon, ListIcon, Plus, PricetagIcon, Search, Upload, X } from "@/components/icons";
import { ImportPlanSheet } from "@/components/ImportPlanSheet";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Input, Select, Skeleton } from "@/components/ui";
import { useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import {
  useCreatePlanLesson,
  useCreatePlanSubject,
  useCreatePlanTopic,
  useDeletePlanLesson,
  useDeletePlanSubject,
  useDeletePlanTopic,
  useDocFileChoices,
  useLinkPlanFile,
  useLinkPlanLessonFile,
  useTagPlanLesson,
  useUntagPlanLesson,
  useUnlinkPlanFile,
  useUnlinkPlanLessonFile,
  openDocFile,
  usePlanOutline,
  usePlanSubjects,
  useRenamePlanLesson,
  useRenamePlanSubject,
  useRenamePlanTopic,
  type PlanLessonNode,
  type PlanLinkedFile,
  type PlanTopicNode,
  type PlanSubjectSummary,
} from "@/hooks/usePlan";
import { useDepartments } from "@/hooks/useProfiles";
import type { GradeLevel } from "@/lib/database.types";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { canManageAcademic, isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { EditableName } from "@/routes/Practice";

// ผังการเรียน — วิชา -> ระดับชั้น -> บทเรียน -> หัวข้อ. A free-standing content plan: it does not
// read the subject catalog, curriculum, teaching assignments or documents. See migration 0088.

const DUPLICATE = "23505";
const errorText = (err: unknown, fallback: string) =>
  (err as { code?: string })?.code === DUPLICATE ? "มีชื่อนี้อยู่แล้ว" : fallback;

export function CurriculumMap() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const [pickedDept, setPickedDept] = useState("");
  const [openId, setOpenId] = useState("");

  if (!me || !(me.roles.some((r) => ["teacher", "staff", "super_admin", "director", "dept_head", "dept_director"].includes(r)))) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }
  const orgWide = isOrgWide(me.roles);
  const departmentId = orgWide ? pickedDept : (me.department_id ?? "");
  const mayEdit = canManageAcademic(me.roles);

  return (
    <div className="page-fill gap-5">
      {!openId && orgWide && departments.length > 0 && (
        <div>
          <Select
            className="w-auto min-w-[10rem]"
            value={pickedDept}
            onChange={(e) => setPickedDept(e.target.value)}
            aria-label="แผนก"
            placeholder="เลือกแผนก"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      {!departmentId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนก" description="เลือกแผนกเพื่อดูผังการเรียน" icon={ClipboardIcon} />
        </div>
      ) : (
        <PlanBoard
          key={departmentId}
          departmentId={departmentId}
          mayEdit={mayEdit}
          openId={openId}
          onOpen={setOpenId}
        />
      )}
    </div>
  );
}

function PlanBoard({
  departmentId,
  mayEdit,
  openId,
  onOpen,
}: {
  departmentId: string;
  mayEdit: boolean;
  openId: string;
  onOpen: (id: string) => void;
}) {
  const { data: subjects = [], isLoading } = usePlanSubjects(departmentId);
  const { data: grades = [] } = useGradeLevels(departmentId);
  const open = subjects.find((s) => s.id === openId);

  if (open) return <SubjectPlan subject={open} grades={grades} mayEdit={mayEdit} onBack={() => onOpen("")} />;
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  return <SubjectList departmentId={departmentId} subjects={subjects} grades={grades} mayEdit={mayEdit} onOpen={onOpen} />;
}

function SubjectList({
  departmentId,
  subjects,
  grades,
  mayEdit,
  onOpen,
}: {
  departmentId: string;
  subjects: PlanSubjectSummary[];
  grades: GradeLevel[];
  mayEdit: boolean;
  onOpen: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [name, setName] = useState("");
  const create = useCreatePlanSubject();
  const toast = useToast();

  const q = search.trim().toLowerCase();
  const shown = subjects.filter((s) => !q || s.name.toLowerCase().includes(q));
  const gradeOf = (s: PlanSubjectSummary) =>
    grades.filter((g) => s.gradeLevelIds.includes(g.id)).sort((a, b) => a.sort_order - b.sort_order);

  function add() {
    const n = name.trim();
    if (!n) return;
    create.mutate(
      { department_id: departmentId, name: n },
      {
        onSuccess: () => {
          setName("");
          setAdding(false);
        },
        onError: (err) => toast(errorText(err, "เพิ่มไม่สำเร็จ"), "error"),
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาวิชา..."
            className="pl-9"
            aria-label="ค้นหา"
          />
        </div>
        <div className="flex h-8 rounded-lg border border-border bg-card p-0.5">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-label={v === "grid" ? "มุมมองกริด" : "มุมมองรายการ"}
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "flex h-full w-8 items-center justify-center rounded-md",
                view === v ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              {v === "grid" ? <AppsIcon className="h-3.5 w-3.5" /> : <ListIcon className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
        {mayEdit && (
          <>
            <Button className="active:scale-100" size="icon" variant="outline" aria-label="นำเข้าจาก CSV" onClick={() => setImporting(true)}>
              <Upload className="h-3 w-3" />
            </Button>
            <Button className="active:scale-100" size="icon" aria-label="เพิ่มวิชา" onClick={() => setAdding((a) => !a)}>
              <Plus className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
      {mayEdit && <ImportPlanSheet open={importing} onOpenChange={setImporting} departmentId={departmentId} />}

      {mayEdit && adding && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="ชื่อวิชา"
            aria-label="ชื่อวิชา"
          />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            เพิ่มวิชา
          </Button>
        </form>
      )}

      <div>
        <h2 className="text-base font-bold">รายวิชาทั้งหมด</h2>
        <p className="text-xs text-muted-foreground">เลือกวิชาเพื่อดูบทเรียนและหัวข้อของแต่ละชั้น</p>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="ไม่พบรายวิชา"
          description={subjects.length === 0 ? (mayEdit ? "กดปุ่ม + เพื่อเพิ่มวิชาแรก" : "ยังไม่มีวิชาในผัง") : "ลองเปลี่ยนคำค้นหา"}
        />
      ) : view === "list" ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[32rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">วิชา</th>
                <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                <th className="px-3 py-2 text-right font-medium">บท</th>
                <th className="px-3 py-2 text-right font-medium">หัวข้อ</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer border-t border-border hover:bg-muted active:bg-muted">
                  <td className="max-w-xs truncate px-3 py-3">{s.name}</td>
                  <td className="px-3 py-3">
                    <GradeBadges grades={gradeOf(s)} />
                  </td>
                  <td className="px-3 py-3 text-right">{s.lessonCount}</td>
                  <td className="px-3 py-3 text-right">{s.topicCount}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    <ChevronForward className="h-3 w-3" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpen(s.id)}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:shadow-md"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <BookIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.lessonCount} บท · {s.topicCount} หัวข้อ
                  </div>
                  <div className="mt-2">
                    <GradeBadges grades={gradeOf(s)} />
                  </div>
                </div>
              </div>
              <div className="mt-auto flex justify-end pt-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground">
                  <ChevronForward className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GradeBadges({ grades }: { grades: GradeLevel[] }) {
  if (grades.length === 0) return <span className="text-[11px] text-muted-foreground">ยังไม่มีเนื้อหา</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {grades.slice(0, 4).map((g) => (
        <span key={g.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
          {gradeShortLabel(g.code)}
        </span>
      ))}
      {grades.length > 4 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">+{grades.length - 4}</span>}
    </span>
  );
}

function SubjectPlan({
  subject,
  grades,
  mayEdit,
  onBack,
}: {
  subject: PlanSubjectSummary;
  grades: GradeLevel[];
  mayEdit: boolean;
  onBack: () => void;
}) {
  const { data: lessons = [], isLoading } = usePlanOutline(subject.id);
  const [pickedGrade, setPickedGrade] = useState("");
  const rename = useRenamePlanSubject();
  const remove = useDeletePlanSubject();
  const toast = useToast();
  const grade = grades.find((g) => g.id === pickedGrade) ?? grades[0];

  function deleteSubject() {
    const extra = subject.lessonCount ? ` บทเรียน ${subject.lessonCount} บทและหัวข้อ ${subject.topicCount} หัวข้อจะถูกลบด้วย` : "";
    if (!confirm(`ลบวิชา "${subject.name}"?${extra}`)) return;
    remove.mutate(subject.id, {
      onSuccess: onBack,
      onError: () => toast("ลบไม่สำเร็จ", "error"),
    });
  }

  return (
    <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      <div>
        <Button className="active:scale-100" size="sm" variant="ghost" onClick={onBack}>
          <ChevronForward className="h-3 w-3 rotate-180" /> รายวิชาทั้งหมด
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
          <BookIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold">{subject.name}</h2>
          <p className="text-xs text-muted-foreground">
            {subject.lessonCount} บท · {subject.topicCount} หัวข้อ
          </p>
        </div>
        {mayEdit && (
          <>
            <EditableName
              noMotion
              value={subject.name}
              onSave={(name) =>
                rename.mutate({ id: subject.id, name }, { onError: (err) => toast(errorText(err, "บันทึกไม่สำเร็จ"), "error") })
              }
            />
            <Button
              className="active:scale-100"
              size="icon"
              variant="ghost"
              aria-label={`ลบวิชา ${subject.name}`}
              disabled={remove.isPending}
              onClick={deleteSubject}
            >
              <X className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !grade ? (
        <EmptyState title="ไม่พบระดับชั้น" description="แผนกนี้ยังไม่มีระดับชั้น" />
      ) : (
        <>
          <div className="scrollbar-hidden flex w-full shrink-0 gap-0 overflow-x-auto border-b border-border" role="tablist">
            {grades.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={grade.id === g.id}
                onClick={() => setPickedGrade(g.id)}
                className={cn(
                  "inline-flex h-8 min-w-0 flex-1 items-center justify-center border-b-2 px-3 text-xs font-medium transition-colors -mb-px",
                  grade.id === g.id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="truncate">{gradeShortLabel(g.code)}</span>
              </button>
            ))}
          </div>
          <GradeSection
            key={grade.id}
            subjectId={subject.id}
            departmentId={subject.department_id}
            grade={grade}
            lessons={lessons.filter((l) => l.grade_level_id === grade.id)}
            mayEdit={mayEdit}
          />
        </>
      )}
    </div>
  );
}

function GradeSection({
  subjectId,
  departmentId,
  grade,
  lessons,
  mayEdit,
}: {
  subjectId: string;
  departmentId: string;
  grade: GradeLevel;
  lessons: PlanLessonNode[];
  mayEdit: boolean;
}) {
  const [name, setName] = useState("");
  const create = useCreatePlanLesson();
  const toast = useToast();

  function add() {
    const n = name.trim();
    if (!n) return;
    create.mutate(
      { subject_id: subjectId, grade_level_id: grade.id, name: n, sort_order: lessons.length },
      { onSuccess: () => setName(""), onError: () => toast("เพิ่มไม่สำเร็จ", "error") },
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {lessons.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีบทเรียนในชั้นนี้</p>}
      {lessons.map((l, i) => (
        <LessonCard key={l.id} lesson={l} index={i} departmentId={departmentId} mayEdit={mayEdit} />
      ))}
      {mayEdit && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder={`เพิ่มบทเรียน ${gradeShortLabel(grade.code)}`}
            aria-label={`เพิ่มบทเรียน ${gradeShortLabel(grade.code)}`}
          />
          <Button type="submit" size="icon" variant="outline" disabled={!name.trim() || create.isPending} aria-label="เพิ่มบทเรียน">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>
      )}
    </section>
  );
}

function LessonCard({
  lesson,
  index,
  departmentId,
  mayEdit,
}: {
  lesson: PlanLessonNode;
  index: number;
  departmentId: string;
  mayEdit: boolean;
}) {
  const [title, setTitle] = useState("");
  const renameLesson = useRenamePlanLesson();
  const removeLesson = useDeletePlanLesson();
  const createTopic = useCreatePlanTopic();
  const renameTopic = useRenamePlanTopic();
  const removeTopic = useDeletePlanTopic();
  const linkFile = useLinkPlanLessonFile();
  const unlinkFile = useUnlinkPlanLessonFile();
  const [picking, setPicking] = useState(false);
  const [tagging, setTagging] = useState(false);
  const tag = useTagPlanLesson();
  const untag = useUntagPlanLesson();
  const toast = useToast();
  const fail = (msg: string) => () => toast(msg, "error");

  function deleteLesson() {
    const extra = lesson.topics.length ? ` หัวข้อ ${lesson.topics.length} หัวข้อในบทนี้จะถูกลบด้วย` : "";
    if (!confirm(`ลบบทเรียน "${lesson.name}"?${extra}`)) return;
    removeLesson.mutate(lesson.id, { onError: fail("ลบไม่สำเร็จ") });
  }

  function addTopic() {
    const n = title.trim();
    if (!n) return;
    createTopic.mutate(
      { lesson_id: lesson.id, name: n, sort_order: lesson.topics.length },
      { onSuccess: () => setTitle(""), onError: fail("เพิ่มไม่สำเร็จ") },
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
          {index + 1}
        </span>
        <LibraryIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{lesson.name}</div>
          {lesson.tags.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {lesson.tags.map(({ linkId, subject }) => (
                <li
                  key={linkId}
                  title={subject.name_th}
                  className="flex items-center gap-1 rounded-full bg-accent/15 py-0.5 pl-2 pr-1.5 text-[11px] font-medium uppercase text-accent"
                >
                  {subject.code}
                  {mayEdit && (
                    <button
                      type="button"
                      aria-label={`เอาแท็ก ${subject.code} ออก`}
                      onClick={() => untag.mutate(linkId, { onError: fail("ลบแท็กไม่สำเร็จ") })}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {mayEdit && (
          <>
            <Button
              className="active:scale-100"
              size="icon"
              variant="ghost"
              aria-label={`ติดแท็กรายวิชากับบทเรียน ${lesson.name}`}
              onClick={() => setTagging(true)}
            >
              <PricetagIcon className="h-3 w-3" />
            </Button>
            <Button
              className="active:scale-100"
              size="icon"
              variant="ghost"
              aria-label={`เชื่อมเอกสารกับบทเรียน ${lesson.name}`}
              onClick={() => setPicking(true)}
            >
              <LinkIcon className="h-3 w-3" />
            </Button>
            <EditableName noMotion value={lesson.name} onSave={(name) => renameLesson.mutate({ id: lesson.id, name })} />
            <Button
              className="active:scale-100"
              size="icon"
              variant="ghost"
              aria-label={`ลบบทเรียน ${lesson.name}`}
              disabled={removeLesson.isPending}
              onClick={deleteLesson}
            >
              <X className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>

      {lesson.files.length > 0 && (
        <div className="px-3 pb-2">
          <LinkedFiles files={lesson.files} mayEdit={mayEdit} onUnlink={(id, done) => unlinkFile.mutate(id, done)} />
        </div>
      )}
      {mayEdit && (
        <SubjectTagPicker
          open={tagging}
          onClose={() => setTagging(false)}
          departmentId={departmentId}
          lessonName={lesson.name}
          taggedIds={new Set(lesson.tags.map((t) => t.subject.id))}
          onTag={(subjectId) => tag.mutate({ lesson_id: lesson.id, subject_id: subjectId }, { onError: fail("ติดแท็กไม่สำเร็จ") })}
          pending={tag.isPending}
        />
      )}
      {mayEdit && (
        <DocPicker
          open={picking}
          onClose={() => setPicking(false)}
          title={lesson.name}
          linkedIds={linkedIds(lesson.files)}
          onLink={(docFileId, done) => linkFile.mutate({ lesson_id: lesson.id, doc_file_id: docFileId }, done)}
          pending={linkFile.isPending}
        />
      )}

      <div className="flex flex-col gap-1 border-t border-border px-3 py-2">
        {lesson.topics.length === 0 && <p className="py-1 text-[11px] text-muted-foreground">ยังไม่มีหัวข้อ</p>}
        <ol className="flex flex-col">
          {lesson.topics.map((t, i) => (
            <TopicRow
              key={t.id}
              topic={t}
              label={`${index + 1}.${i + 1}`}
              mayEdit={mayEdit}
              onRename={(name) => renameTopic.mutate({ id: t.id, name })}
              onDelete={() => {
                if (confirm(`ลบหัวข้อ "${t.name}"?`)) removeTopic.mutate(t.id, { onError: fail("ลบไม่สำเร็จ") });
              }}
              deleting={removeTopic.isPending}
            />
          ))}
        </ol>
        {mayEdit && (
          <form
            className="flex gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              addTopic();
            }}
          >
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="เพิ่มหัวข้อ"
              aria-label={`เพิ่มหัวข้อในบทเรียน ${lesson.name}`}
            />
            <Button type="submit" size="icon" variant="outline" disabled={!title.trim() || createTopic.isPending} aria-label="เพิ่มหัวข้อ">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function TopicRow({
  topic,
  label,
  mayEdit,
  onRename,
  onDelete,
  deleting,
}: {
  topic: PlanTopicNode;
  label: string;
  mayEdit: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const unlink = useUnlinkPlanFile();
  const link = useLinkPlanFile();

  return (
    <li className="flex flex-col gap-1 py-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-right text-muted-foreground">{label}</span>
        <span className="min-w-0 flex-1 truncate">{topic.name}</span>
        {mayEdit && (
          <>
            <button
              type="button"
              aria-label={`เชื่อมเอกสารกับหัวข้อ ${topic.name}`}
              onClick={() => setPicking(true)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </button>
            <EditableName noMotion value={topic.name} onSave={onRename} />
            <button
              type="button"
              aria-label={`ลบหัวข้อ ${topic.name}`}
              disabled={deleting}
              onClick={onDelete}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      <LinkedFiles files={topic.files} mayEdit={mayEdit} onUnlink={(id, done) => unlink.mutate(id, done)} indent />
      {mayEdit && (
        <DocPicker
          open={picking}
          onClose={() => setPicking(false)}
          title={topic.name}
          linkedIds={linkedIds(topic.files)}
          onLink={(docFileId, done) => link.mutate({ topic_id: topic.id, doc_file_id: docFileId }, done)}
          pending={link.isPending}
        />
      )}
    </li>
  );
}

const linkedIds = (files: PlanLinkedFile[]) => new Set(files.flatMap((f) => (f.file ? [f.file.id] : [])));
type Done = { onSuccess?: () => void; onError?: () => void };

/** Linked-file chips under a บทเรียน or หัวข้อ; unreadable files show as a muted placeholder (doc_files RLS). */
function LinkedFiles({
  files,
  mayEdit,
  onUnlink,
  indent,
}: {
  files: PlanLinkedFile[];
  mayEdit: boolean;
  onUnlink: (linkId: string, done: Done) => void;
  indent?: boolean;
}) {
  const toast = useToast();
  if (files.length === 0) return null;
  async function open(path: string) {
    if (!(await openDocFile(path))) toast("เปิดไฟล์ไม่สำเร็จ", "error");
  }
  return (
    <ul className={cn("flex flex-wrap gap-1.5 text-xs", indent && "pl-10")}>
      {files.map(({ linkId, file }) => (
        <li key={linkId} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2 pr-1 text-[11px]">
          {file ? (
            <button type="button" onClick={() => open(file.file_path)} className="flex items-center gap-1 hover:underline">
              <DocumentTextIcon className="h-3 w-3" /> <span className="max-w-[16rem] truncate">{file.title}</span>
            </button>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              <DocumentTextIcon className="h-3 w-3" /> ไม่มีสิทธิ์ดูไฟล์นี้
            </span>
          )}
          {mayEdit && (
            <button
              type="button"
              aria-label="ยกเลิกการเชื่อมเอกสาร"
              onClick={() => onUnlink(linkId, { onError: () => toast("ยกเลิกไม่สำเร็จ", "error") })}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function DocPicker({
  open,
  onClose,
  title,
  linkedIds: linked,
  onLink,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  linkedIds: Set<string>;
  onLink: (docFileId: string, done: Done) => void;
  pending: boolean;
}) {
  const [search, setSearch] = useState("");
  const { data: choices = [], isLoading } = useDocFileChoices(open);
  const toast = useToast();
  const q = search.trim().toLowerCase();
  const shown = choices.filter(
    (c) => !linked.has(c.id) && (!q || `${c.title} ${c.fileName} ${c.context}`.toLowerCase().includes(q)),
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSearch("");
          onClose();
        }
      }}
      title="เชื่อมเอกสาร"
      description={`เลือกเอกสารที่ครูอัปโหลดมาเชื่อมกับ "${title}"`}
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อเอกสาร วิชา หรือบทเรียน..."
            className="pl-9"
            aria-label="ค้นหาเอกสาร"
          />
        </div>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : shown.length === 0 ? (
          <EmptyState title="ไม่พบเอกสาร" description="ลองเปลี่ยนคำค้นหา หรือยังไม่มีเอกสารที่เชื่อมได้" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {shown.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onLink(c.id, { onSuccess: onClose, onError: () => toast("เชื่อมไม่สำเร็จ", "error") })}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs hover:bg-muted"
                >
                  <span className="font-medium">{c.title}</span>
                  <span className="text-[11px] text-muted-foreground">{c.context || c.fileName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

/** Pick catalog subjects (รหัสวิชา) of the department to tag a บทเรียน with; stays open for several picks. */
function SubjectTagPicker({
  open,
  onClose,
  departmentId,
  lessonName,
  taggedIds,
  onTag,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  departmentId: string;
  lessonName: string;
  taggedIds: Set<string>;
  onTag: (subjectId: string) => void;
  pending: boolean;
}) {
  const [search, setSearch] = useState("");
  const { data: subjects = [], isLoading } = useSubjects(
    { search, departmentId, learningAreaId: "", gradeLevelId: "", term: "", subjectType: "", includeInactive: false },
    { enabled: open },
  );
  const shown = subjects.filter((s) => !taggedIds.has(s.id));

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSearch("");
          onClose();
        }
      }}
      title="ติดแท็กรายวิชา"
      description={`เลือกรายวิชาที่เกี่ยวข้องกับบท "${lessonName}"`}
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหารหัสวิชา หรือชื่อวิชา..."
            className="pl-9"
            aria-label="ค้นหารายวิชา"
          />
        </div>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : shown.length === 0 ? (
          <EmptyState title="ไม่พบรายวิชา" description="ลองเปลี่ยนคำค้นหา" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {shown.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onTag(s.id)}
                  className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                >
                  <span className="font-mono font-medium uppercase">{s.code}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.name_th}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
