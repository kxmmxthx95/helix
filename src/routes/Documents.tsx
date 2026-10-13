import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronForward, DocumentTextIcon, X } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Select } from "@/components/ui";
import { useMyChildren } from "@/hooks/useAttendance";
import { useSubjects } from "@/hooks/useCurriculum";
import {
  DOC_ACCEPT,
  docFilePaths,
  docFileSignedUrl,
  useAllGradeLevels,
  useCreateDocLesson,
  useCreateDocTopic,
  useDeleteDocFile,
  useDeleteDocLesson,
  useDeleteDocTopic,
  useDocFiles,
  useDocLessons,
  useDocTopics,
  useUpdateDocLesson,
  useUpdateDocTopic,
  useUploadDocFile,
} from "@/hooks/useDocuments";
import { useClassroomsByIds, useSubjectsByIds } from "@/hooks/useExamBank";
import { useMyCurrentClassroom } from "@/hooks/useExams";
import { useMySubjects } from "@/hooks/usePractice";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import type { DocFile, Subject } from "@/lib/database.types";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { canManage } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { EditableName, NewNameInput } from "@/routes/Practice";

// เอกสาร — วิชา -> ระดับชั้น -> เนื้อหาหลัก -> เนื้อหาย่อย -> ไฟล์.
// Teachers/managers curate; students/parents read the grade they're in. See migration 0071.

export function Documents() {
  const { profile: me, myStudent } = useAuth();
  const isParent = me?.roles.includes("parent") ?? false;
  if (me && (me.roles.includes("teacher") || canManage(me.roles))) return <TeacherDocuments />;
  if (myStudent || isParent) return <StudentDocuments />;
  return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
}

function TeacherDocuments() {
  const { profile: me } = useAuth();
  const isManager = canManage(me!.roles);
  const { data: assignments = [] } = useMyTeachingAssignments(!isManager ? me!.id : null);
  const { data: teacherSubjects = [] } = useSubjectsByIds([...new Set(assignments.map((a) => a.subject_id))]);
  const { data: managerSubjects = [] } = useSubjects(
    {
      search: "",
      departmentId: me!.department_id ?? "",
      learningAreaId: "",
      gradeLevelId: "",
      term: "",
      subjectType: "",
      includeInactive: false,
    },
    { enabled: isManager },
  );
  return <DocBrowser subjects={isManager ? managerSubjects : teacherSubjects} canEdit />;
}

function StudentDocuments() {
  const { profile, myStudent } = useAuth();
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(isParent ? (profile?.id ?? null) : null);
  const options = [...(myStudent ? [myStudent] : []), ...children];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = options.find((s) => s.id === selectedId) ?? options[0] ?? null;

  if (!current) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ไม่มีข้อมูล" description="เมนูนี้สำหรับนักเรียนและผู้ปกครองเท่านั้น" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {options.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {options.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={cn(
                "tappable rounded-full px-3 py-1.5 text-xs font-medium",
                current.id === s.id ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s.first_name} {s.last_name}
            </button>
          ))}
        </div>
      )}
      <StudentDocBrowser key={current.id} studentId={current.id} />
    </div>
  );
}

function StudentDocBrowser({ studentId }: { studentId: string }) {
  const { data: classroom } = useMyCurrentClassroom(studentId);
  const { data: subjectIds = [] } = useMySubjects(classroom?.classroomId ?? null, classroom?.academicYear ?? null);
  const { data: subjects = [] } = useSubjectsByIds(subjectIds);
  const { data: classrooms = [] } = useClassroomsByIds(classroom ? [classroom.classroomId] : []);
  return <DocBrowser subjects={subjects} fixedGradeLevelId={classrooms[0]?.grade_level_id ?? null} canEdit={false} />;
}

/** Subject + grade pickers, then lessons -> topics -> files. `fixedGradeLevelId` (students) hides the grade picker. */
function DocBrowser({
  subjects,
  canEdit,
  fixedGradeLevelId,
}: {
  subjects: Subject[];
  canEdit: boolean;
  fixedGradeLevelId?: string | null;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [pickedGradeId, setPickedGradeId] = useState("");
  const [lesson, setLesson] = useState<{ id: string; name: string } | null>(null);
  const [topic, setTopic] = useState<{ id: string; name: string } | null>(null);
  const { data: gradeLevels = [] } = useAllGradeLevels();

  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  const gradeOptions = gradeLevels.filter((g) => g.department_id === subject?.department_id);
  const gradeId = fixedGradeLevelId ?? pickedGradeId;
  const grade = gradeLevels.find((g) => g.id === gradeId) ?? null;
  const ready = !!subject && !!grade;

  if (ready && lesson && topic) {
    return <TopicFiles topic={topic} canEdit={canEdit} onBack={() => setTopic(null)} />;
  }
  if (ready && lesson) {
    return <TopicList lesson={lesson} canEdit={canEdit} onBack={() => setLesson(null)} onOpenTopic={setTopic} />;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setPickedGradeId("");
          }}
          aria-label="วิชา"
          placeholder="เลือกวิชา"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} {s.name_th}
            </option>
          ))}
        </Select>
        {fixedGradeLevelId === undefined ? (
          <Select
            value={pickedGradeId}
            onChange={(e) => setPickedGradeId(e.target.value)}
            disabled={!subject}
            aria-label="ระดับชั้น"
            placeholder="เลือกระดับชั้น"
          >
            {gradeOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {gradeShortLabel(g.code)} {g.name}
              </option>
            ))}
          </Select>
        ) : (
          <div className="flex h-8 items-center text-xs text-muted-foreground">
            {grade ? `ระดับชั้น ${gradeShortLabel(grade.code)}` : "ยังไม่มีห้องเรียนปัจจุบัน"}
          </div>
        )}
      </div>
      {ready ? (
        <LessonList subject={subject} gradeLevelId={grade.id} canEdit={canEdit} onOpenLesson={setLesson} />
      ) : (
        <EmptyState title="เลือกวิชา" description="เลือกวิชา (และระดับชั้น) เพื่อดูเอกสาร" />
      )}
    </div>
  );
}

function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onBack}>
      <ChevronForward className="h-3 w-3 rotate-180" /> {label}
    </Button>
  );
}

function LessonList({
  subject,
  gradeLevelId,
  canEdit,
  onOpenLesson,
}: {
  subject: Subject;
  gradeLevelId: string;
  canEdit: boolean;
  onOpenLesson: (l: { id: string; name: string }) => void;
}) {
  const { data: lessons = [] } = useDocLessons(subject.id, gradeLevelId);
  const create = useCreateDocLesson();
  const update = useUpdateDocLesson();
  const remove = useDeleteDocLesson();
  const toast = useToast();

  async function onDelete(l: { id: string; name: string }) {
    const paths = await docFilePaths({ lessonId: l.id });
    const extra = paths.length ? ` เอกสาร ${paths.length} ไฟล์ในบทเรียนนี้จะถูกลบด้วย` : "";
    if (!confirm(`ลบบทเรียน "${l.name}"? เนื้อหาย่อยทั้งหมดจะถูกลบด้วย${extra}`)) return;
    remove.mutate({ id: l.id, paths }, { onError: () => toast("ลบไม่สำเร็จ", "error") });
  }

  return (
    <NameList
      title="เนื้อหาหลัก"
      emptyTitle="ยังไม่มีเนื้อหาหลัก"
      items={lessons}
      canEdit={canEdit}
      addPlaceholder="เพิ่มเนื้อหาหลัก"
      onOpen={onOpenLesson}
      onRename={(id, name) => update.mutate({ id, name })}
      onDelete={(l) => void onDelete(l)}
      onAdd={(name) =>
        create.mutate(
          { subject_id: subject.id, grade_level_id: gradeLevelId, name, sort_order: lessons.length },
          { onError: () => toast("เพิ่มไม่สำเร็จ", "error") },
        )
      }
    />
  );
}

function TopicList({
  lesson,
  canEdit,
  onBack,
  onOpenTopic,
}: {
  lesson: { id: string; name: string };
  canEdit: boolean;
  onBack: () => void;
  onOpenTopic: (t: { id: string; name: string }) => void;
}) {
  const { data: topics = [] } = useDocTopics(lesson.id);
  const create = useCreateDocTopic();
  const update = useUpdateDocTopic();
  const remove = useDeleteDocTopic();
  const toast = useToast();

  async function onDelete(t: { id: string; name: string }) {
    const paths = await docFilePaths({ topicId: t.id });
    const extra = paths.length ? ` เอกสาร ${paths.length} ไฟล์จะถูกลบด้วย` : "";
    if (!confirm(`ลบเนื้อหาย่อย "${t.name}"?${extra}`)) return;
    remove.mutate({ id: t.id, paths }, { onError: () => toast("ลบไม่สำเร็จ", "error") });
  }

  return (
    <div className="space-y-3">
      <BackButton label={lesson.name} onBack={onBack} />
      <NameList
        title="เนื้อหาย่อย"
        emptyTitle="ยังไม่มีเนื้อหาย่อย"
        items={topics}
        canEdit={canEdit}
        addPlaceholder="เพิ่มเนื้อหาย่อย"
        onOpen={onOpenTopic}
        onRename={(id, name) => update.mutate({ id, name })}
        onDelete={(t) => void onDelete(t)}
        onAdd={(name) =>
          create.mutate(
            { lesson_id: lesson.id, name, sort_order: topics.length },
            { onError: () => toast("เพิ่มไม่สำเร็จ", "error") },
          )
        }
      />
    </div>
  );
}

/** Shared row list for lessons and topics: click to open; teachers also get rename/delete and an add row. */
function NameList({
  title,
  emptyTitle,
  items,
  canEdit,
  addPlaceholder,
  onOpen,
  onRename,
  onDelete,
  onAdd,
}: {
  title: string;
  emptyTitle: string;
  items: { id: string; name: string }[];
  canEdit: boolean;
  addPlaceholder: string;
  onOpen: (item: { id: string; name: string }) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (item: { id: string; name: string }) => void;
  onAdd: (name: string) => void;
}) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <EmptyState title={emptyTitle} description={canEdit ? "เพิ่มด้านล่างเพื่อเริ่มจัดหมวดเอกสาร" : "ครูยังไม่ได้เพิ่มเอกสาร"} />
      ) : (
        <div className="table-panel">
          <table className="w-full text-xs">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{title}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border hover:bg-muted">
                  <td className="cursor-pointer px-3 py-3 font-medium" onClick={() => onOpen(item)}>
                    {item.name}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canEdit && (
                      <div className="flex items-center justify-end gap-1">
                        <EditableName value={item.name} onSave={(name) => onRename(item.id, name)} />
                        <Button size="icon" variant="ghost" aria-label="ลบ" onClick={() => onDelete(item)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <div className="rounded-lg border border-border bg-card p-3">
          <NewNameInput placeholder={addPlaceholder} onAdd={onAdd} />
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function TopicFiles({
  topic,
  canEdit,
  onBack,
}: {
  topic: { id: string; name: string };
  canEdit: boolean;
  onBack: () => void;
}) {
  const { profile: me } = useAuth();
  const { data: files = [] } = useDocFiles(topic.id);
  const upload = useUploadDocFile();
  const remove = useDeleteDocFile();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [inputKey, setInputKey] = useState(0);

  // Open a blank tab synchronously (popup blockers), then point it at the signed URL.
  async function open(f: DocFile) {
    const tab = window.open("", "_blank");
    const url = await docFileSignedUrl(f.file_path);
    if (!url) {
      tab?.close();
      toast("เปิดไฟล์ไม่สำเร็จ", "error");
      return;
    }
    if (tab) tab.location.href = url;
    else window.location.href = url;
  }

  function submit() {
    if (!file || !me) return;
    upload.mutate(
      { file, topicId: topic.id, title: title.trim() || file.name, description: description.trim() || null, uploadedBy: me.id },
      {
        onSuccess: () => {
          setFile(null);
          setTitle("");
          setDescription("");
          setInputKey((k) => k + 1);
        },
        onError: (e) => toast(e instanceof Error && e.message ? e.message : "อัพโหลดไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <div className="space-y-3">
      <BackButton label={topic.name} onBack={onBack} />
      {files.length === 0 ? (
        <EmptyState title="ยังไม่มีเอกสาร" description={canEdit ? "อัพโหลดไฟล์ด้านล่าง" : "ครูยังไม่ได้อัพโหลดเอกสาร"} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-2.5">
              <DocumentTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <button type="button" onClick={() => void open(f)} className="tappable min-w-0 flex-1 text-left">
                <div className="truncate text-xs font-medium">{f.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {f.description ? `${f.description} · ` : ""}
                  {f.file_name} · {formatSize(f.size_bytes)}
                </div>
              </button>
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="ลบไฟล์"
                  onClick={() => {
                    if (!confirm(`ลบไฟล์ "${f.title}"?`)) return;
                    remove.mutate(f, { onError: () => toast("ลบไม่สำเร็จ", "error") });
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <Field label="ไฟล์ (PDF, Word, PowerPoint, Excel, รูปภาพ — ไม่เกิน 20 MB)">
            <input
              key={inputKey}
              type="file"
              accept={DOC_ACCEPT}
              className="text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </Field>
          <Field label="ชื่อเอกสาร">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="คำอธิบาย (ไม่บังคับ)">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Button size="sm" onClick={submit} disabled={!file || upload.isPending}>
            {upload.isPending ? "กำลังอัพโหลด…" : "อัพโหลด"}
          </Button>
        </div>
      )}
    </div>
  );
}
