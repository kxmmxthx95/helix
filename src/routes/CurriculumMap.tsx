import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { BookIcon, ChevronForward, DocumentTextIcon, LibraryIcon, Plus, X } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Input, Skeleton } from "@/components/ui";
import { useLearningAreas } from "@/hooks/useCurriculum";
import {
  docFilePaths,
  docTopicFilePaths,
  useAllGradeLevels,
  useCreateDocLesson,
  useCreateDocTopic,
  useDeleteDocLesson,
  useDeleteDocTopic,
  useDocOutline,
  useUpdateDocLesson,
  useUpdateDocTopic,
  type DocOutlineLesson,
} from "@/hooks/useDocuments";
import { useSubjectColors } from "@/hooks/useSubjectColors";
import type { Subject } from "@/lib/database.types";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { canManage } from "@/lib/roles";
import { SUBJECT_TYPE_LABEL } from "@/lib/subjectColor";
import { cn } from "@/lib/utils";
import { DocBrowser, useBrowsableSubjects } from "@/routes/Documents";
import { EditableName } from "@/routes/Practice";

// ผังการเรียน — วิชา -> ระดับชั้น -> บทเรียน -> หัวข้อ. Same data as เอกสาร (doc_lessons /
// doc_topics, same RLS): this page is the outline view, files live in /documents.

export function CurriculumMap() {
  const { profile: me } = useAuth();
  const { subjects, showDepartments } = useBrowsableSubjects();
  if (!me || !(me.roles.includes("teacher") || canManage(me.roles))) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }
  return (
    <DocBrowser
      subjects={subjects}
      canEdit
      showDepartments={showDepartments}
      renderSubject={(s, onBack) => <SubjectMap subject={s} onBack={onBack} />}
    />
  );
}

function SubjectMap({ subject, onBack }: { subject: Subject; onBack: () => void }) {
  const [pickedGrade, setPickedGrade] = useState("");
  const { data: allGrades = [] } = useAllGradeLevels();
  const { data: areas = [] } = useLearningAreas();
  const colors = useSubjectColors(allGrades);
  const grades = allGrades.filter((g) => g.department_id === subject.department_id).sort((a, b) => a.sort_order - b.sort_order);
  const gradeId = grades.some((g) => g.id === pickedGrade) ? pickedGrade : (grades[0]?.id ?? "");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button className="active:scale-100" size="sm" variant="ghost" onClick={onBack}>
          <ChevronForward className="h-3 w-3 rotate-180" /> {subject.code} {subject.name_th}
        </Button>
        {gradeId && (
          <Link
            to={`/documents?subject=${subject.id}&grade=${gradeId}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs hover:bg-muted"
          >
            <DocumentTextIcon className="h-3.5 w-3.5" /> ดูเอกสาร
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            colors.shade(subject.learning_area_id, gradeId),
          )}
        >
          <BookIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold">{subject.name_th}</h2>
          <p className="text-xs text-muted-foreground">
            {[subject.code, areas.find((a) => a.id === subject.learning_area_id)?.name, SUBJECT_TYPE_LABEL[subject.subject_type]]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <div className="scrollbar-hidden flex w-full shrink-0 gap-0 overflow-x-auto border-b border-border" role="tablist">
        {grades.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={gradeId === g.id}
            onClick={() => setPickedGrade(g.id)}
            className={cn(
              "inline-flex h-8 min-w-0 flex-1 items-center justify-center border-b-2 px-3 text-xs font-medium transition-colors -mb-px",
              gradeId === g.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="truncate">{gradeShortLabel(g.code)}</span>
          </button>
        ))}
      </div>

      {gradeId ? (
        <Outline
          key={gradeId}
          subjectId={subject.id}
          gradeId={gradeId}
          tint={colors.shade(subject.learning_area_id, gradeId)}
        />
      ) : (
        <EmptyState title="ไม่พบระดับชั้น" description="แผนกของวิชานี้ยังไม่มีระดับชั้น" />
      )}
    </div>
  );
}

function Outline({ subjectId, gradeId, tint }: { subjectId: string; gradeId: string; tint: string }) {
  const { data: lessons = [], isLoading } = useDocOutline(subjectId, gradeId);
  const create = useCreateDocLesson();
  const toast = useToast();
  const [name, setName] = useState("");

  function add() {
    const n = name.trim();
    if (!n) return;
    create.mutate(
      { subject_id: subjectId, grade_level_id: gradeId, name: n, sort_order: lessons.length },
      { onSuccess: () => setName(""), onError: () => toast("เพิ่มไม่สำเร็จ", "error") },
    );
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {lessons.length === 0 && <EmptyState title="ยังไม่มีบทเรียน" description="เพิ่มบทเรียนเพื่อเริ่มวางโครงเนื้อหา" />}
      {lessons.map((l, i) => (
        <LessonCard key={l.id} lesson={l} index={i} tint={tint} />
      ))}
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
          placeholder="เพิ่มบทเรียน"
          aria-label="ชื่อบทเรียน"
        />
        <Button type="submit" size="icon" variant="outline" disabled={!name.trim() || create.isPending} aria-label="เพิ่มบทเรียน">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}

function LessonCard({ lesson, index, tint }: { lesson: DocOutlineLesson; index: number; tint: string }) {
  const [title, setTitle] = useState("");
  const updateLesson = useUpdateDocLesson();
  const removeLesson = useDeleteDocLesson();
  const createTopic = useCreateDocTopic();
  const updateTopic = useUpdateDocTopic();
  const removeTopic = useDeleteDocTopic();
  const toast = useToast();
  const fail = (msg: string) => () => toast(msg, "error");

  async function deleteLesson() {
    const paths = await docFilePaths(lesson.id);
    const extra = paths.length ? ` เอกสาร ${paths.length} ไฟล์ในบทเรียนนี้จะถูกลบด้วย` : "";
    if (!confirm(`ลบบทเรียน "${lesson.name}"? หัวข้อทั้งหมดในบทนี้จะถูกลบด้วย${extra}`)) return;
    removeLesson.mutate({ id: lesson.id, paths }, { onError: fail("ลบไม่สำเร็จ") });
  }

  async function deleteTopic(id: string, name: string) {
    const paths = await docTopicFilePaths(id);
    const extra = paths.length ? ` เอกสาร ${paths.length} ไฟล์ในหัวข้อนี้จะถูกลบด้วย` : "";
    if (!confirm(`ลบหัวข้อ "${name}"?${extra}`)) return;
    removeTopic.mutate({ id, paths }, { onError: fail("ลบไม่สำเร็จ") });
  }

  function addTopic() {
    const t = title.trim();
    if (!t) return;
    createTopic.mutate(
      { lesson_id: lesson.id, name: t, sort_order: lesson.topics.length },
      { onSuccess: () => setTitle(""), onError: fail("เพิ่มไม่สำเร็จ") },
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
          {index + 1}
        </span>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tint)}>
          <LibraryIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 truncate text-sm font-bold">{lesson.name}</div>
        <EditableName noMotion value={lesson.name} onSave={(name) => updateLesson.mutate({ id: lesson.id, name })} />
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
      </div>

      <div className="flex flex-col gap-1 border-t border-border px-3 py-2">
        {lesson.topics.length === 0 && <p className="py-1 text-[11px] text-muted-foreground">ยังไม่มีหัวข้อ</p>}
        <ol className="flex flex-col">
          {lesson.topics.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2 py-1 text-xs">
              <span className="w-8 shrink-0 text-right text-muted-foreground">
                {index + 1}.{i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                <DocumentTextIcon className="h-3 w-3" /> {t.fileCount}
              </span>
              <EditableName noMotion value={t.name} onSave={(name) => updateTopic.mutate({ id: t.id, name })} />
              <button
                type="button"
                aria-label={`ลบหัวข้อ ${t.name}`}
                disabled={removeTopic.isPending}
                onClick={() => deleteTopic(t.id, t.name)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ol>
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
      </div>
    </div>
  );
}
