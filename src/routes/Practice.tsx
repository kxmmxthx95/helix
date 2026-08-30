import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { QuestionPromptView } from "@/components/editor/QuestionPromptView";
import {
  BookIcon,
  ChevronBack,
  ChevronForward,
  PencilIcon,
  Plus,
  Search,
  X,
} from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Pagination,
  Select,
  Spinner,
} from "@/components/ui";
import { useMyChildren } from "@/hooks/useAttendance";
import { useLearningAreas, useSubjects } from "@/hooks/useCurriculum";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import {
  useGradeLevelsByIds,
  useSubjectsByIds,
  type ExamQuestionWithChoices,
} from "@/hooks/useExamBank";
import { useMyCurrentClassroom } from "@/hooks/useExams";
import {
  useAvailablePracticeSets,
  useCreatePracticeLesson,
  useCreatePracticeSet,
  useCreatePracticeTopic,
  useCreateSelfServePracticeSet,
  useDeletePracticeLesson,
  useDeletePracticeSet,
  useDeletePracticeTopic,
  useExamQuestionsByIds,
  useMyPracticeAttempts,
  useMyPracticeSets,
  useMySubjects,
  usePracticeAttemptAnswers,
  usePracticeAttemptCount,
  usePracticeLessons,
  usePracticeSetProgress,
  usePracticeSetQuestions,
  usePracticeTopics,
  usePracticeTopicsByIds,
  useSavePracticeAnswer,
  useSetPracticeSetQuestions,
  useStartOrResumePracticeAttempt,
  useSubmitPracticeAttempt,
  useUpdatePracticeLesson,
  useUpdatePracticeTopic,
} from "@/hooks/usePractice";
import { useDepartments } from "@/hooks/useProfiles";
import { usePagination } from "@/hooks/usePagination";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { canManage, isOrgWide } from "@/lib/roles";
import { QuestionSheet } from "@/routes/ExamBank";
import type {
  ExamQuestionDifficulty,
  ExamQuestionType,
  PracticeAttempt,
  PracticeSet,
  Student,
  Subject,
  SubjectType,
} from "@/lib/database.types";
import { cn } from "@/lib/utils";

const DIFFICULTY_LABEL: Record<ExamQuestionDifficulty, string> = {
  easy: "ง่าย",
  medium: "ปานกลาง",
  hard: "ยาก",
};

const DIFFICULTY_BADGE_CLASS: Record<ExamQuestionDifficulty, string> = {
  easy: "bg-success/15 text-success",
  medium: "bg-accent/15 text-accent",
  hard: "bg-destructive/15 text-destructive",
};

const QUESTION_TYPE_LABEL: Record<ExamQuestionType, string> = {
  multiple_choice: "ปรนัย (เลือกตอบ)",
  true_false: "ถูก/ผิด",
  short_answer: "เติมคำ",
};

const SUBJECT_TYPE_LABEL: Record<SubjectType, string> = {
  basic: "พื้นฐาน",
  additional: "เพิ่มเติม",
  activity: "กิจกรรม",
};

const SUBJECT_TYPE_DOT: Record<SubjectType, string> = {
  basic: "bg-blue-500",
  additional: "bg-orange-500",
  activity: "bg-violet-500",
};

/** Pedagogical order: พื้นฐาน → เพิ่มเติม → กิจกรรม */
const SUBJECT_TYPE_ORDER: Record<SubjectType, number> = {
  basic: 0,
  additional: 1,
  activity: 2,
};

/** Deterministic cover color per subject (no color/icon field on `subjects` — see grill note in Practice.tsx). Cycles through a fixed palette by id hash so the same subject always lands on the same color. */
const SUBJECT_COVER_PALETTE = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

function subjectCoverColor(subjectId: string) {
  let hash = 0;
  for (let i = 0; i < subjectId.length; i++)
    hash = (hash * 31 + subjectId.charCodeAt(i)) >>> 0;
  return SUBJECT_COVER_PALETTE[hash % SUBJECT_COVER_PALETTE.length];
}

/** Spotlight-style floating search — centered overlay, Escape/backdrop to close. */
function SearchOverlay({
  open,
  onOpenChange,
  value,
  onChange,
  placeholder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center pt-[15vh]" onClick={() => onOpenChange(false)}>
      <div
        className="animate-fade-in relative h-fit w-[calc(100%-2rem)] max-w-lg rounded-lg border border-border bg-card shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            type="search"
            className="h-14 border-none pl-11 pr-4 text-base shadow-none"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Both teacher/manager (curate sets) and student/parent (practice) render
 * from here — role-branched, same shape as Exams.tsx. A manager
 * (canManage — super_admin/director/staff/dept_head) gets the teacher-side
 * view scoped to every subject in their department rather than "my
 * assignments", mirroring can_write_practice_subject's can_manage()+
 * department grant in migration 0053 (same as ExamBank's fix). See
 * migration 0053.
 */
export function Practice() {
  const { profile: me, myStudent } = useAuth();
  const isTeacher = me?.roles.includes("teacher") ?? false;
  const isManager = me ? canManage(me.roles) : false;
  const isParent = me?.roles.includes("parent") ?? false;

  if (isTeacher || isManager) return <TeacherPractice me={me!} />;
  if (myStudent || isParent) return <StudentPractice />;
  return (
    <Card className="text-sm text-muted-foreground">
      ไม่มีสิทธิ์เข้าถึงเมนูนี้
    </Card>
  );
}

// ============================================================== teacher side

function TeacherPractice({
  me,
}: {
  me: NonNullable<ReturnType<typeof useAuth>["profile"]>;
}) {
  const isManager = canManage(me.roles);
  const orgWide = isOrgWide(me.roles);

  const { data: assignments = [] } = useMyTeachingAssignments(
    !isManager ? me.id : null,
  );
  const teacherSubjectIds = [...new Set(assignments.map((a) => a.subject_id))];
  const { data: teacherSubjects = [] } = useSubjectsByIds(teacherSubjectIds);

  const { data: departments = [] } = useDepartments();
  const [pickedDept, setPickedDept] = useState("");
  const managerDepartmentId = orgWide ? pickedDept : (me.department_id ?? "");
  const { data: learningAreas = [] } = useLearningAreas();
  const [learningAreaId, setLearningAreaId] = useState("");
  const [gradeLevelId, setGradeLevelId] = useState("");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTerm = search.trim().toLowerCase();
  const searching = searchTerm.length >= 3;

  useEffect(() => {
    setGradeLevelId("");
  }, [pickedDept]);

  const { data: managerSubjects = [] } = useSubjects(
    {
      search: "",
      departmentId: isManager ? managerDepartmentId : "",
      learningAreaId: isManager ? learningAreaId : "",
      gradeLevelId: isManager ? gradeLevelId : "",
      term: "",
      subjectType: "",
      includeInactive: false,
    },
    { enabled: isManager && (!orgWide || !!managerDepartmentId || searching) },
  );

  const teacherSubjectsFiltered = teacherSubjects.filter(
    (s) =>
      (!learningAreaId || s.learning_area_id === learningAreaId) &&
      (!gradeLevelId || s.suggested_grade_level_id === gradeLevelId),
  );
  const subjectsScoped = isManager ? managerSubjects : teacherSubjectsFiltered;
  const subjects = searching
    ? subjectsScoped.filter(
        (s) =>
          s.code.toLowerCase().includes(searchTerm) ||
          s.name_th.toLowerCase().includes(searchTerm),
      )
    : subjectsScoped;
  const gradeLevelIds = [
    ...new Set(
      subjects
        .map((s) => s.suggested_grade_level_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const { data: teacherGradeLevels = [] } = useGradeLevelsByIds(
    !isManager ? gradeLevelIds : [],
  );
  const { data: managerGradeLevels = [] } = useGradeLevels(
    isManager ? managerDepartmentId || null : null,
  );
  const gradeLevelById = new Map(
    (isManager ? managerGradeLevels : teacherGradeLevels).map((g) => [g.id, g]),
  );
  const gradeLevelOptions = isManager ? managerGradeLevels : teacherGradeLevels;
  const sortedSubjects = [...subjects].sort((a, b) => {
    const gradeA = a.suggested_grade_level_id
      ? (gradeLevelById.get(a.suggested_grade_level_id)?.sort_order ?? Infinity)
      : Infinity;
    const gradeB = b.suggested_grade_level_id
      ? (gradeLevelById.get(b.suggested_grade_level_id)?.sort_order ?? Infinity)
      : Infinity;
    if (gradeA !== gradeB) return gradeA - gradeB;
    if (a.subject_type !== b.subject_type)
      return (
        SUBJECT_TYPE_ORDER[a.subject_type] - SUBJECT_TYPE_ORDER[b.subject_type]
      );
    return a.code.localeCompare(b.code);
  });
  const { page, setPage, pageCount, pageRows } = usePagination(sortedSubjects, [
    learningAreaId,
    gradeLevelId,
    managerDepartmentId,
    search,
  ]);

  // Drill-down: รายวิชา -> บทเรียน -> เนื้อหาย่อย -> แบบฝึกหัด (each level its own table).
  const [subjectId, setSubjectId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [topic, setTopic] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [selected, setSelected] = useState<PracticeSet | null>(null);

  if (selected) {
    return <SetDetail set={selected} onBack={() => setSelected(null)} />;
  }

  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  if (subject && lessonId && topic) {
    return (
      <TopicSetsTable
        subjectId={subject.id}
        topic={topic}
        createdBy={me.id}
        onBack={() => setTopic(null)}
        onOpenSet={setSelected}
      />
    );
  }
  if (subject && lessonId) {
    return (
      <TopicTable
        subject={subject}
        lessonId={lessonId}
        onBack={() => setLessonId("")}
        onOpenTopic={setTopic}
      />
    );
  }
  if (subject) {
    return (
      <LessonTable
        subject={subject}
        onBack={() => setSubjectId("")}
        onOpenLesson={setLessonId}
      />
    );
  }

  return (
    <div className="page-fill">
      <SearchOverlay
        open={searchOpen}
        onOpenChange={setSearchOpen}
        value={search}
        onChange={setSearch}
        placeholder="ค้นหารหัสหรือชื่อวิชา"
      />
      <div className="shrink-0 space-y-1.5">
        <div className="flex gap-2">
          {isManager && orgWide && (
            <div className="min-w-0 flex-1">
              <Select
                className="w-full"
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

          <div className="min-w-0 flex-1">
            <Select
              className="w-full"
              value={learningAreaId}
              onChange={(e) => setLearningAreaId(e.target.value)}
              aria-label="กลุ่มสาระ"
              placeholder="ทุกกลุ่มสาระ"
            >
              {learningAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0 flex-1">
            <Select
              className="w-full"
              value={gradeLevelId}
              onChange={(e) => setGradeLevelId(e.target.value)}
              aria-label="ระดับชั้น"
              placeholder="ทุกระดับชั้น"
              disabled={isManager && orgWide && !pickedDept}
            >
              {gradeLevelOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {gradeShortLabel(g.code)}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="icon"
            variant="outline"
            aria-label="ค้นหาวิชา"
            onClick={() => setSearchOpen(true)}
            className={cn("shrink-0", search && "border-ring text-foreground")}
          >
            <Search className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {isManager && orgWide && !managerDepartmentId && !searching ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="เลือกแผนก"
            description="เลือกแผนกเพื่อดูรายวิชาทั้งหมด"
          />
        </div>
      ) : subjects.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="ไม่มีวิชา"
            description={
              isManager ? "ยังไม่มีวิชาในแผนกนี้" : "ยังไม่มีวิชาที่คุณสอน"
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[24rem] text-xs">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">รหัสวิชา</th>
                  <th className="px-3 py-2 font-medium">วิชา</th>
                  <th className="px-3 py-2 font-medium">ประเภทวิชา</th>
                  <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => {
                  const gradeLevel = s.suggested_grade_level_id
                    ? gradeLevelById.get(s.suggested_grade_level_id)
                    : null;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSubjectId(s.id)}
                      className="cursor-pointer border-t border-border hover:bg-muted active:bg-muted"
                    >
                      <td className="px-3 py-3">{s.code}</td>
                      <td className="max-w-xs truncate px-3 py-3">
                        {s.name_th}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={`size-2 rounded-full ${SUBJECT_TYPE_DOT[s.subject_type]}`}
                          />
                          {SUBJECT_TYPE_LABEL[s.subject_type]}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {gradeLevel && (
                          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                            {gradeShortLabel(gradeLevel.code)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

/** บทเรียนหลัก ของวิชาที่เลือก — คลิกแถวเข้าเนื้อหาย่อย, มีแถวเพิ่มบทเรียนหลักในตัว. */
function LessonTable({
  subject,
  onBack,
  onOpenLesson,
}: {
  subject: Subject;
  onBack: () => void;
  onOpenLesson: (lessonId: string) => void;
}) {
  const { data: lessons = [] } = usePracticeLessons(subject.id);
  const createLesson = useCreatePracticeLesson();
  const updateLesson = useUpdatePracticeLesson();
  const deleteLesson = useDeletePracticeLesson();
  const toast = useToast();

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ChevronForward className="h-3 w-3 rotate-180" /> {subject.name_th}
        </Button>
      </div>

      {lessons.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="ยังไม่มีบทเรียนหลัก"
            description="เพิ่มบทเรียนหลักด้านล่างเพื่อเริ่มจัดหมวดแบบฝึกหัด"
          />
        </div>
      ) : (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[24rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">บทเรียนหลัก</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {lessons.map((l) => (
                  <tr
                    key={l.id}
                    className="border-t border-border hover:bg-muted"
                  >
                    <td
                      className="cursor-pointer px-3 py-3 font-medium"
                      onClick={() => onOpenLesson(l.id)}
                    >
                      {l.name}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <EditableName
                          value={l.name}
                          onSave={(name) =>
                            updateLesson.mutate({ id: l.id, name })
                          }
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="ลบบทเรียน"
                          onClick={() => {
                            if (
                              !confirm(
                                `ลบบทเรียน "${l.name}"? เนื้อหาย่อยทั้งหมดในบทเรียนนี้จะถูกลบด้วย`,
                              )
                            )
                              return;
                            deleteLesson.mutate(l.id, {
                              onError: () =>
                                toast(
                                  "ลบไม่สำเร็จ อาจมีชุดฝึกหัดใช้เนื้อหาย่อยนี้อยู่",
                                  "error",
                                ),
                            });
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="shrink-0 rounded-lg border border-border bg-card p-3">
        <NewNameInput
          placeholder="เพิ่มบทเรียนหลัก"
          onAdd={(name) =>
            createLesson.mutate(
              { subject_id: subject.id, name, sort_order: lessons.length },
              { onError: () => toast("เพิ่มไม่สำเร็จ", "error") },
            )
          }
        />
      </div>
    </div>
  );
}

/** เนื้อหาย่อย ของบทเรียนที่เลือก — คลิกแถวเข้าดูแบบฝึกหัดของเนื้อหานั้น, มีแถวเพิ่มเนื้อหาย่อยในตัว. */
function TopicTable({
  subject,
  lessonId,
  onBack,
  onOpenTopic,
}: {
  subject: Subject;
  lessonId: string;
  onBack: () => void;
  onOpenTopic: (topic: { id: string; name: string }) => void;
}) {
  const { data: lessons = [] } = usePracticeLessons(subject.id);
  const lesson = lessons.find((l) => l.id === lessonId) ?? null;
  const { data: topics = [] } = usePracticeTopics(lessonId);
  const createTopic = useCreatePracticeTopic();
  const updateTopic = useUpdatePracticeTopic();
  const deleteTopic = useDeletePracticeTopic();
  const toast = useToast();

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ChevronForward className="h-3 w-3 rotate-180" />{" "}
          {lesson?.name ?? "เนื้อหาย่อย"}
        </Button>
      </div>

      {topics.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="ยังไม่มีเนื้อหาย่อย"
            description="เพิ่มเนื้อหาย่อยด้านล่างเพื่อเริ่มเพิ่มแบบฝึกหัด"
          />
        </div>
      ) : (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[24rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">เนื้อหาย่อย</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t border-border hover:bg-muted"
                  >
                    <td
                      className="cursor-pointer px-3 py-3 font-medium"
                      onClick={() => onOpenTopic(t)}
                    >
                      {t.name}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <EditableName
                          value={t.name}
                          onSave={(name) =>
                            updateTopic.mutate({ id: t.id, name })
                          }
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="ลบเนื้อหาย่อย"
                          onClick={() => {
                            if (!confirm(`ลบเนื้อหาย่อย "${t.name}"?`)) return;
                            deleteTopic.mutate(t.id, {
                              onError: () =>
                                toast(
                                  "ลบไม่สำเร็จ อาจมีชุดฝึกหัดใช้เนื้อหาย่อยนี้อยู่",
                                  "error",
                                ),
                            });
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="shrink-0 rounded-lg border border-border bg-card p-3">
        <NewNameInput
          placeholder="เพิ่มเนื้อหาย่อย"
          onAdd={(name) =>
            createTopic.mutate(
              { lesson_id: lessonId, name, sort_order: topics.length },
              { onError: () => toast("เพิ่มไม่สำเร็จ", "error") },
            )
          }
        />
      </div>
    </div>
  );
}

/** แบบฝึกหัด ของเนื้อหาย่อยที่เลือก — คลิกแถวเข้า SetDetail, มีแถวเพิ่มแบบฝึกหัดในตัว (สร้างตรง ไม่มีฟอร์ม). */
function TopicSetsTable({
  subjectId,
  topic,
  createdBy,
  onBack,
  onOpenSet,
}: {
  subjectId: string;
  topic: { id: string; name: string };
  createdBy: string;
  onBack: () => void;
  onOpenSet: (set: PracticeSet) => void;
}) {
  const { data: sets = [] } = useMyPracticeSets([subjectId]);
  const topicSets = sets.filter((s) => s.topic_id === topic.id);
  const createSet = useCreatePracticeSet();
  const deleteSet = useDeletePracticeSet();
  const toast = useToast();
  const [newTitle, setNewTitle] = useState("");

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ChevronForward className="h-3 w-3 rotate-180" /> {topic.name}
        </Button>
      </div>

      {topicSets.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="ยังไม่มีแบบฝึกหัด"
            description="เพิ่มแบบฝึกหัดด้านล่างเพื่อเริ่มใส่โจทย์"
          />
        </div>
      ) : (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[44rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="min-w-[14rem] px-3 py-2 font-medium" rowSpan={2}>
                    แบบฝึกหัด
                  </th>
                  <th className="px-3 py-1 text-center font-medium" colSpan={4} />
                  <th className="px-3 py-2 text-center font-medium" rowSpan={2}>
                    จำนวนครั้งที่เข้าทำ
                  </th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>
                    วันที่สร้าง
                  </th>
                  <th className="px-3 py-2 font-medium" rowSpan={2} />
                </tr>
                <tr>
                  <th className="px-2 py-1 text-center font-medium">
                    ง่าย
                  </th>
                  <th className="px-2 py-1 text-center font-medium">
                    ปานกลาง
                  </th>
                  <th className="px-2 py-1 text-center font-medium">
                    ยาก
                  </th>
                  <th className="px-2 py-1 text-center font-medium">
                    รวม
                  </th>
                </tr>
              </thead>
              <tbody>
                {topicSets.map((s) => (
                  <PracticeSetRow
                    key={s.id}
                    set={s}
                    onOpen={() => onOpenSet(s)}
                    onDelete={() => {
                      if (!confirm("ลบชุดฝึกหัดนี้?")) return;
                      deleteSet.mutate(s.id, {
                        onError: () => toast("ลบไม่สำเร็จ", "error"),
                      });
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="ชื่อแบบฝึกหัด (ถ้ามี)"
          className="min-w-0 flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            createSet.mutate(
              {
                subject_id: subjectId,
                created_by: createdBy,
                topic_id: topic.id,
                title: newTitle.trim() || null,
              },
              {
                onSuccess: (s) => {
                  setNewTitle("");
                  onOpenSet(s);
                },
                onError: () => toast("เพิ่มไม่สำเร็จ", "error"),
              },
            )
          }
          disabled={createSet.isPending}
        >
          <Plus className="h-3 w-3" /> เพิ่มแบบฝึกหัด
        </Button>
      </div>
    </div>
  );
}

/** One existing set row — shows the teacher's title if given, else falls back to a plain "แบบฝึกหัด" label (the topic still identifies it either way). */
function PracticeSetRow({
  set,
  onOpen,
  onDelete,
}: {
  set: PracticeSet;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { data: questions = [] } = usePracticeSetQuestions(set.id);
  const { data: attemptCount = 0 } = usePracticeAttemptCount(set.id);
  const countByDifficulty: Record<ExamQuestionDifficulty, number> = {
    easy: 0,
    medium: 0,
    hard: 0,
  };
  for (const q of questions) countByDifficulty[q.difficulty]++;

  return (
    <tr className="border-t border-border hover:bg-muted">
      <td
        className="min-w-[14rem] cursor-pointer px-3 py-3 font-medium"
        onClick={onOpen}
      >
        {set.title ?? "แบบฝึกหัด"}
      </td>
      <td className="px-2 py-3 text-center">{countByDifficulty.easy || "—"}</td>
      <td className="px-2 py-3 text-center">
        {countByDifficulty.medium || "—"}
      </td>
      <td className="px-2 py-3 text-center">{countByDifficulty.hard || "—"}</td>
      <td className="px-2 py-3 text-center">{questions.length}</td>
      <td className="px-3 py-3 text-center">{attemptCount}</td>
      <td className="px-3 py-3 text-muted-foreground">
        {formatShortDate(set.created_at)}
      </td>
      <td className="px-3 py-2 text-right">
        <Button
          size="icon"
          variant="ghost"
          aria-label="ลบชุดฝึกหัด"
          onClick={onDelete}
        >
          <X className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Small "+ ชื่อ..." inline add row shared by the lesson table and each topic table. */
function NewNameInput({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (name: string) => void;
}) {
  const [value, setValue] = useState("");
  function submit() {
    const name = value.trim();
    if (!name) return;
    onAdd(name);
    setValue("");
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className="min-w-0 flex-1"
      />
      <Button
        size="sm"
        variant="outline"
        onClick={submit}
        disabled={!value.trim()}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

/** Click-to-edit name — swaps to an Input on click, saves on blur/Enter. Used for both lesson and topic rename. */
function EditableName({
  value,
  onSave,
}: {
  value: string;
  onSave: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <Button
        size="icon"
        variant="ghost"
        aria-label="แก้ไขชื่อ"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        <PencilIcon className="h-3 w-3" />
      </Button>
    );
  }

  function save() {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== value) onSave(name);
  }

  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && save()}
      className="h-7 w-32 text-xs"
    />
  );
}

function SetDetail({ set, onBack }: { set: PracticeSet; onBack: () => void }) {
  const { profile: me } = useAuth();
  const { data: setQuestions = [] } = usePracticeSetQuestions(set.id);
  const { data: progress, isLoading } = usePracticeSetProgress(set.id);

  const questionById = new Map(setQuestions.map((q) => [q.question_id, q]));
  const { data: fullQuestions = [] } = useExamQuestionsByIds(
    setQuestions.map((q) => q.question_id),
  );
  const submittedCount = progress?.attempts.length ?? 0;
  const avgScore =
    submittedCount > 0
      ? (
          progress!.attempts.reduce((s, a) => s + (a.score ?? 0), 0) /
          submittedCount
        ).toFixed(1)
      : null;
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [editingQuestion, setEditingQuestion] =
    useState<ExamQuestionWithChoices | null>(null);
  const setSetQuestions = useSetPracticeSetQuestions();
  const toast = useToast();
  const { data: [topic] = [] } = usePracticeTopicsByIds(
    set.topic_id ? [set.topic_id] : [],
  );
  const displayName = set.title ?? topic?.name ?? "—";

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={onBack}
          aria-label="ย้อนกลับ"
        >
          <ChevronBack className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-sm font-semibold">
            {displayName}
          </p>
          <p className="text-xs text-muted-foreground">
            {setQuestions.length} ข้อ · ทำแล้ว {submittedCount} ครั้ง
            {avgScore != null && ` · เฉลี่ย ${avgScore} คะแนน`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddingQuestion(true)}>
          <Plus className="h-3 w-3" /> เพิ่มโจทย์
        </Button>
      </div>

      {me && (
        <QuestionSheet
          open={addingQuestion}
          onOpenChange={setAddingQuestion}
          subjectId={set.subject_id}
          teacherId={me.id}
          question={null}
          full
          defaultTopic={topic?.name}
          onSaved={(id) =>
            setSetQuestions.mutate(
              {
                setId: set.id,
                questionIds: [...setQuestions.map((q) => q.question_id), id],
              },
              { onError: () => toast("เพิ่มโจทย์เข้าชุดไม่สำเร็จ", "error") },
            )
          }
        />
      )}

      {me && (
        <QuestionSheet
          open={!!editingQuestion}
          onOpenChange={(v) => !v && setEditingQuestion(null)}
          subjectId={set.subject_id}
          teacherId={me.id}
          question={editingQuestion}
          full
        />
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : setQuestions.length === 0 ? (
        <EmptyState title="ชุดนี้ยังไม่มีโจทย์" description="" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="table-panel-scroll space-y-3 py-1">
            {[...fullQuestions]
              .sort(
                (a, b) =>
                  (questionById.get(a.id)?.position ?? 0) -
                  (questionById.get(b.id)?.position ?? 0),
              )
              .map((q, i) => (
                <div
                  key={q.id}
                  className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-1 flex-wrap items-center gap-1.5 text-sm font-medium">
                      <span>#{i + 1}</span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                        {QUESTION_TYPE_LABEL[q.question_type]}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-normal",
                          DIFFICULTY_BADGE_CLASS[q.difficulty],
                        )}
                      >
                        {DIFFICULTY_LABEL[q.difficulty]}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="แก้ไขโจทย์"
                        onClick={() => setEditingQuestion(q)}
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="ลบ"
                        onClick={() => {
                          if (!confirm("เอาโจทย์นี้ออกจากชุด?")) return;
                          setSetQuestions.mutate(
                            {
                              setId: set.id,
                              questionIds: setQuestions
                                .filter((sq) => sq.question_id !== q.id)
                                .map((sq) => sq.question_id),
                            },
                            {
                              onError: () =>
                                toast("เอาโจทย์ออกไม่สำเร็จ", "error"),
                            },
                          );
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    <QuestionPromptView value={q.prompt_json} />
                  </div>
                  {q.question_type === "short_answer" ? (
                    <p className="text-muted-foreground">
                      เฉลย: {q.correct_answer}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {q.choices.map((c) => (
                        <li
                          key={c.id}
                          className={cn(
                            "flex items-center gap-1.5",
                            c.is_correct && "font-medium text-success",
                          )}
                        >
                          {c.is_correct ? "✓" : "○"} {c.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================== student side

/** Same self/child picker shape as Exams.tsx. */
function StudentPractice() {
  const { profile, myStudent } = useAuth();
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(
    isParent ? (profile?.id ?? null) : null,
  );
  const options = [...(myStudent ? [myStudent] : []), ...children];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current =
    options.find((s) => s.id === selectedId) ?? options[0] ?? null;
  const [activeSet, setActiveSet] = useState<PracticeSet | null>(null);

  if (options.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          title="ไม่มีข้อมูล"
          description="เมนูนี้สำหรับนักเรียนและผู้ปกครองเท่านั้น"
        />
      </div>
    );
  }

  if (current && activeSet) {
    return (
      <TakePractice
        student={current}
        set={activeSet}
        onExit={() => setActiveSet(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {options.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {options.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={cn(
                "tappable rounded-full px-3 py-1.5 text-xs font-medium",
                current?.id === s.id
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s.first_name} {s.last_name}
            </button>
          ))}
        </div>
      )}
      {current && <PracticeHome student={current} onOpen={setActiveSet} />}
    </div>
  );
}

function PracticeHome({
  student,
  onOpen,
}: {
  student: Student;
  onOpen: (s: PracticeSet) => void;
}) {
  const { data: classroom } = useMyCurrentClassroom(student.id);
  const { data: subjectIds = [] } = useMySubjects(
    classroom?.classroomId ?? null,
    classroom?.academicYear ?? null,
  );
  const { data: subjects = [] } = useSubjectsByIds(subjectIds);
  const { data: sets = [], isLoading } = useAvailablePracticeSets(subjectIds);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const topicIds = [
    ...new Set(sets.map((s) => s.topic_id).filter((id): id is string => !!id)),
  ];
  const { data: topics = [] } = usePracticeTopicsByIds(topicIds);
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const setName = (s: PracticeSet) =>
    s.topic_id ? (topicById.get(s.topic_id)?.name ?? "—") : (s.title ?? "—");

  const [rolling, setRolling] = useState(false);
  const [openSubjectId, setOpenSubjectId] = useState<string | null>(null);
  const selfServe = useCreateSelfServePracticeSet();
  const toast = useToast();

  const setsBySubject = new Map<string, PracticeSet[]>();
  for (const s of sets)
    setsBySubject.set(s.subject_id, [
      ...(setsBySubject.get(s.subject_id) ?? []),
      s,
    ]);
  const subjectsWithSets = subjects.filter(
    (s) => (setsBySubject.get(s.id)?.length ?? 0) > 0,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  const openSubject = openSubjectId ? subjectById.get(openSubjectId) : null;

  return (
    <div className="space-y-4">
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setRolling(true)}
        disabled={subjectIds.length === 0}
      >
        สุ่มโจทย์มาฝึกเอง
      </Button>

      {openSubject ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setOpenSubjectId(null)}
            className="tappable flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronBack className="h-3.5 w-3.5" /> {openSubject.name_th}
          </button>
          <ul className="space-y-2">
            {(setsBySubject.get(openSubject.id) ?? []).map((s) => (
              <Card
                key={s.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{setName(s)}</p>
                  <p className="text-muted-foreground">{openSubject.name_th}</p>
                </div>
                <Button size="sm" onClick={() => onOpen(s)}>
                  ฝึกเลย
                </Button>
              </Card>
            ))}
          </ul>
        </div>
      ) : subjectsWithSets.length === 0 ? (
        <EmptyState
          title="ยังไม่มีชุดฝึกหัด"
          description="รอครูสร้างชุดฝึกหัด หรือลองสุ่มโจทย์มาฝึกเองด้านบน"
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {subjectsWithSets.map((s) => {
            const count = setsBySubject.get(s.id)?.length ?? 0;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setOpenSubjectId(s.id)}
                className={cn(
                  "tappable flex aspect-[3/4] flex-col justify-between rounded-xl p-3 text-left text-white shadow-sm transition-transform active:scale-[0.97]",
                  subjectCoverColor(s.id),
                )}
              >
                <BookIcon className="h-6 w-6 opacity-90" />
                <div>
                  <p className="text-xs font-semibold leading-snug">
                    {s.name_th}
                  </p>
                  <p className="mt-0.5 text-[10px] opacity-80">{count} ชุด</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <SelfServeSheet
        open={rolling}
        onOpenChange={setRolling}
        subjectIds={subjectIds}
        subjects={subjects}
        studentId={student.id}
        onCreated={(set) => {
          setRolling(false);
          onOpen(set);
        }}
        onError={() => toast("ไม่สามารถสุ่มโจทย์ได้", "error")}
        pending={selfServe.isPending}
        create={selfServe.mutate}
      />
    </div>
  );
}

function SelfServeSheet({
  open,
  onOpenChange,
  subjectIds,
  subjects,
  studentId,
  onCreated,
  onError,
  pending,
  create,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectIds: string[];
  subjects: { id: string; name_th: string }[];
  studentId: string;
  onCreated: (set: PracticeSet) => void;
  onError: () => void;
  pending: boolean;
  create: (
    draft: {
      subject_id: string;
      created_by: string;
      topic: string | null;
      difficulty: ExamQuestionDifficulty | null;
    },
    opts: { onSuccess: (set: PracticeSet) => void; onError: () => void },
  ) => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [difficulty, setDifficulty] = useState<ExamQuestionDifficulty | "">("");

  useEffect(() => {
    if (open) {
      setSubjectId(subjectIds[0] ?? "");
      setDifficulty("");
    }
  }, [open, subjectIds]);

  function roll() {
    if (!subjectId) return;
    create(
      {
        subject_id: subjectId,
        created_by: studentId,
        topic: null,
        difficulty: difficulty || null,
      },
      { onSuccess: onCreated, onError },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="สุ่มโจทย์มาฝึกเอง"
      footer={
        <Button
          className="w-full"
          onClick={roll}
          disabled={!subjectId || pending}
        >
          สุ่ม 10 ข้อ
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="วิชา" required>
          <Select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_th}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ระดับความยาก">
          <Select
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.target.value as ExamQuestionDifficulty | "")
            }
            placeholder="ทุกระดับ"
          >
            {Object.entries(DIFFICULTY_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}

function TakePractice({
  student,
  set,
  onExit,
}: {
  student: Student;
  set: PracticeSet;
  onExit: () => void;
}) {
  const { data: setQuestions = [] } = usePracticeSetQuestions(set.id);
  const { data: pastAttempts = [] } = useMyPracticeAttempts(set.id, student.id);
  const startOrResume = useStartOrResumePracticeAttempt();
  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (attempt || setQuestions.length === 0) return;
    startOrResume.mutate(
      {
        setId: set.id,
        studentId: student.id,
        questionIds: setQuestions.map((q) => q.question_id),
      },
      {
        onSuccess: setAttempt,
        onError: () => toast("เริ่มฝึกไม่สำเร็จ", "error"),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setQuestions.length]);

  if (!attempt) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (attempt.status === "submitted") {
    return (
      <AttemptSummary
        attempt={attempt}
        maxPoints={setQuestions.reduce((s, q) => s + q.points, 0)}
        triesSoFar={pastAttempts.length}
        onRetry={() => setAttempt(null)}
        onExit={onExit}
      />
    );
  }

  return (
    <PracticeRunner
      attempt={attempt}
      onSubmitted={setAttempt}
      onExit={onExit}
    />
  );
}

function PracticeRunner({
  attempt,
  onSubmitted,
  onExit,
}: {
  attempt: PracticeAttempt;
  onSubmitted: (a: PracticeAttempt) => void;
  onExit: () => void;
}) {
  const { data: questions = [] } = useExamQuestionsByIds(
    attempt.question_order,
  );
  const { data: answers } = usePracticeAttemptAnswers(attempt.id);
  const saveAnswer = useSavePracticeAnswer();
  const submit = useSubmitPracticeAttempt();
  const toast = useToast();

  const orderedQuestions = attempt.question_order
    .map((id) => questions.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => !!q);
  const answeredCount = orderedQuestions.filter((q) =>
    answers?.has(q.id),
  ).length;

  function doSubmit() {
    submit.mutate(attempt.id, {
      onSuccess: () => onSubmitted({ ...attempt, status: "submitted" }),
      onError: () => toast("ส่งไม่สำเร็จ", "error"),
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-3 pb-4">
      <div className="sticky top-0 z-10 -mx-3 flex items-center justify-between bg-background/95 px-3 py-2 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          ตอบแล้ว {answeredCount}/{orderedQuestions.length} ข้อ
        </p>
      </div>

      {orderedQuestions.map((q, i) => {
        const answer = answers?.get(q.id);
        const answered = !!answer;
        return (
          <Card
            key={q.id}
            className={cn(
              "space-y-2 text-sm",
              answered &&
                (answer.is_correct
                  ? "border-success/40"
                  : "border-destructive/40"),
            )}
          >
            <div className="font-medium">
              {i + 1}. <QuestionPromptView value={q.prompt_json} />
            </div>
            {q.question_type === "short_answer" ? (
              <Input
                value={answer?.short_answer ?? ""}
                onChange={(e) =>
                  saveAnswer.mutate({
                    attempt_id: attempt.id,
                    question_id: q.id,
                    choice_id: null,
                    short_answer: e.target.value,
                  })
                }
                placeholder="พิมพ์คำตอบ"
              />
            ) : (
              <div className="space-y-1.5">
                {q.choices.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answer?.choice_id === c.id}
                      onChange={() =>
                        saveAnswer.mutate({
                          attempt_id: attempt.id,
                          question_id: q.id,
                          choice_id: c.id,
                          short_answer: null,
                        })
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
            {answered && (
              <p
                className={cn(
                  "text-xs",
                  answer.is_correct ? "text-success" : "text-destructive",
                )}
              >
                {answer.is_correct ? "ถูกต้อง" : "ยังไม่ถูก ลองอีกครั้งได้"}
                {q.question_type === "short_answer" &&
                  !answer.is_correct &&
                  ` — เฉลย: ${q.correct_answer}`}
                {q.question_type !== "short_answer" &&
                  !answer.is_correct &&
                  ` — เฉลย: ${q.choices.find((c) => c.is_correct)?.label ?? "—"}`}
              </p>
            )}
          </Card>
        );
      })}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onExit}>
          ออกไปก่อน (ทำต่อได้ภายหลัง)
        </Button>
        <Button
          className="flex-1"
          onClick={doSubmit}
          disabled={submit.isPending}
        >
          เสร็จแล้ว
        </Button>
      </div>
    </div>
  );
}

function AttemptSummary({
  attempt,
  maxPoints,
  triesSoFar,
  onRetry,
  onExit,
}: {
  attempt: PracticeAttempt;
  maxPoints: number;
  triesSoFar: number;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <Card className="text-center">
        <p className="text-xs text-muted-foreground">คะแนนที่ทำได้</p>
        <p className="font-heading text-2xl font-bold">
          {attempt.score ?? "—"}/{maxPoints}
        </p>
        <p className="text-xs text-muted-foreground">
          ฝึกไปแล้ว {triesSoFar} ครั้ง
        </p>
      </Card>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onExit}>
          กลับไปหน้ารายการ
        </Button>
        <Button className="flex-1" onClick={onRetry}>
          ฝึกอีกครั้ง
        </Button>
      </div>
    </div>
  );
}
