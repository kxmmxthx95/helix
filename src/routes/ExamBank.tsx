import { NodeApi, type Value } from "platejs";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { EMPTY_PROMPT } from "@/components/editor/plateConfig";
import { QuestionEditor } from "@/components/editor/QuestionEditor";
import { QuestionPromptView } from "@/components/editor/QuestionPromptView";
import { ChevronForward, DocumentTextIcon, PencilIcon, Plus, X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from "@/components/ui";
import {
  useCreateExamQuestion,
  useDeleteExamQuestion,
  useExamQuestions,
  useGradeLevelsByIds,
  useSubjectsByIds,
  useUpdateExamQuestion,
  type ChoiceDraft,
  type ExamQuestionWithChoices,
} from "@/hooks/useExamBank";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import type { ExamQuestionDifficulty, ExamQuestionType, Subject } from "@/lib/database.types";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { cn } from "@/lib/utils";

/** Plaintext fallback for the table-preview/session-picker read sites — [สูตร]/[รูปภาพ] placeholders for nodes NodeApi.string can't stringify (equation/image have no .text). */
function promptToPlainText(value: Value): string {
  return value
    .map((node) =>
      NodeApi.string(node) ||
      (node.type === "equation" || node.type === "inline_equation" ? "[สูตร]" : node.type === "img" ? "[รูปภาพ]" : ""),
    )
    .filter(Boolean)
    .join(" ")
    .trim();
}

const TYPE_LABEL: Record<ExamQuestionType, string> = {
  multiple_choice: "ปรนัย (เลือกตอบ)",
  true_false: "ถูก/ผิด",
  short_answer: "เติมคำ",
};

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

/** role="teacher" only — ครูสร้าง/จัดการคลังข้อสอบของวิชาที่ตัวเองสอน. See migration 0047. */
export function ExamBank() {
  const { profile: me } = useAuth();
  const { data: assignments = [] } = useMyTeachingAssignments(me?.id ?? null);
  const subjectIds = [...new Set(assignments.map((a) => a.subject_id))];
  const { data: subjects = [] } = useSubjectsByIds(subjectIds);
  const gradeLevelIds = [...new Set(subjects.map((s) => s.suggested_grade_level_id).filter((id): id is string => !!id))];
  const { data: gradeLevels = [] } = useGradeLevelsByIds(gradeLevelIds);
  const gradeLevelById = new Map(gradeLevels.map((g) => [g.id, g]));

  const [subjectId, setSubjectId] = useState("");
  const [editing, setEditing] = useState<ExamQuestionWithChoices | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const { data: questions = [], isLoading } = useExamQuestions(subjectId || null);
  const deleteQuestion = useDeleteExamQuestion();
  const toast = useToast();

  if (!me?.roles.includes("teacher")) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }

  return (
    <div className="page-fill">
      {subjectId && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setSubjectId("")}>
            <ChevronForward className="h-3 w-3 rotate-180" /> {subjects.find((s) => s.id === subjectId)?.name_th ?? "เปลี่ยนวิชา"}
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="icon"
              variant={previewing ? "accent" : "ghost"}
              aria-label={previewing ? "กลับไปพิมพ์ข้อสอบ" : "ดูข้อสอบทั้งหมด"}
              aria-pressed={previewing}
              disabled={questions.length === 0}
              onClick={() => setPreviewing((v) => !v)}
            >
              <DocumentTextIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {subjectId && !previewing && (
        <div className="shrink-0 rounded-lg border border-border bg-card p-3">
          <QuestionForm key="new" subjectId={subjectId} teacherId={me.id} question={null} onSaved={() => {}} />
        </div>
      )}

      {subjects.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่มีวิชา" description="ยังไม่มีวิชาที่คุณสอน" />
        </div>
      ) : subjectId && !previewing ? null : !subjectId ? (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[24rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">รหัสวิชา</th>
                  <th className="px-3 py-2 font-medium">วิชา</th>
                  <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => {
                  const grade = s.suggested_grade_level_id ? gradeLevelById.get(s.suggested_grade_level_id) : null;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSubjectId(s.id)}
                      className="cursor-pointer border-t border-border hover:bg-muted active:bg-muted"
                    >
                      <td className="px-3 py-3 text-muted-foreground">{s.code}</td>
                      <td className="max-w-xs truncate px-3 py-3">{s.name_th}</td>
                      <td className="px-3 py-3">
                        {grade && (
                          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                            {gradeShortLabel(grade.code)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : questions.length === 0 ? null : !previewing ? null : (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll space-y-4 p-3">
            {questions.map((q, i) => (
              <div key={q.id} className="space-y-2 border-b border-border pb-4 last:border-0">
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex flex-1 items-start gap-1.5 text-sm font-medium">
                    <span>{i + 1}.</span>
                    <QuestionPromptView value={q.prompt_json} />
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-normal",
                        DIFFICULTY_BADGE_CLASS[q.difficulty],
                      )}
                    >
                      {DIFFICULTY_LABEL[q.difficulty]}
                    </span>
                    {q.topic && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                        {q.topic}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="icon" variant="ghost" aria-label="แก้ไข" onClick={() => setEditing(q)}>
                      <PencilIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="ลบ"
                      onClick={() => {
                        if (!confirm("ลบข้อสอบนี้?")) return;
                        deleteQuestion.mutate(q.id, {
                          onError: (err) =>
                            toast(
                              (err as { code?: string }).code === "23503"
                                ? "ลบไม่ได้ ข้อสอบนี้ถูกใช้ในห้องสอบแล้ว"
                                : "ลบไม่สำเร็จ",
                              "error",
                            ),
                        });
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {q.question_type === "short_answer" ? (
                  <p className="pl-4 text-xs text-muted-foreground">เฉลย: {q.correct_answer}</p>
                ) : (
                  <ul className="space-y-1 pl-4 text-xs">
                    {q.choices.map((c) => (
                      <li key={c.id} className={cn("flex items-center gap-1.5", c.is_correct && "font-medium text-success")}>
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

      <QuestionSheet
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        subjectId={subjectId}
        teacherId={me.id}
        question={editing}
      />
    </div>
  );
}

function useQuestionForm({
  subjectId,
  teacherId,
  question,
  onSaved,
}: {
  subjectId: string;
  teacherId: string;
  question: ExamQuestionWithChoices | null;
  onSaved: () => void;
}) {
  const isEdit = !!question;
  const create = useCreateExamQuestion();
  const update = useUpdateExamQuestion();
  const toast = useToast();

  const [type, setType] = useState<ExamQuestionType>(question?.question_type ?? "multiple_choice");
  const [prompt, setPrompt] = useState<Value>(question?.prompt_json ?? EMPTY_PROMPT);
  const [correctAnswer, setCorrectAnswer] = useState(question?.correct_answer ?? "");
  const [difficulty, setDifficulty] = useState<ExamQuestionDifficulty>(question?.difficulty ?? "medium");
  const [topic, setTopic] = useState(question?.topic ?? "");
  const [choices, setChoices] = useState<ChoiceDraft[]>(
    question?.choices.map((c) => ({ label: c.label, is_correct: c.is_correct })) ?? [
      { label: "", is_correct: true },
      { label: "", is_correct: false },
      { label: "", is_correct: false },
      { label: "", is_correct: false },
    ],
  );

  function reset() {
    setType("multiple_choice");
    setPrompt(EMPTY_PROMPT);
    setCorrectAnswer("");
    setDifficulty("medium");
    setTopic("");
    setChoices([
      { label: "", is_correct: true },
      { label: "", is_correct: false },
      { label: "", is_correct: false },
      { label: "", is_correct: false },
    ]);
  }

  const promptText = promptToPlainText(prompt);
  const canSave =
    promptText &&
    (type === "short_answer"
      ? correctAnswer.trim()
      : choices.filter((c) => c.label.trim()).length >= 2 && choices.some((c) => c.is_correct));

  function save() {
    if (!canSave) return;
    const finalChoices = type === "short_answer" ? [] : choices.filter((c) => c.label.trim());
    if (isEdit) {
      update.mutate(
        {
          id: question.id,
          prompt: promptText,
          prompt_json: prompt,
          correct_answer: type === "short_answer" ? correctAnswer.trim() : null,
          difficulty,
          topic: topic.trim() || null,
          choices: type === "short_answer" ? undefined : finalChoices,
        },
        {
          onSuccess: onSaved,
          onError: () => toast("บันทึกไม่สำเร็จ", "error"),
        },
      );
    } else {
      create.mutate(
        {
          subject_id: subjectId,
          question_type: type,
          prompt: promptText,
          prompt_json: prompt,
          points: 1,
          correct_answer: type === "short_answer" ? correctAnswer.trim() : null,
          difficulty,
          topic: topic.trim() || null,
          created_by: teacherId,
          choices: finalChoices,
        },
        {
          onSuccess: () => {
            reset();
            onSaved();
          },
          onError: () => toast("สร้างไม่สำเร็จ", "error"),
        },
      );
    }
  }

  return {
    isEdit,
    type,
    setType,
    prompt,
    setPrompt,
    correctAnswer,
    setCorrectAnswer,
    difficulty,
    setDifficulty,
    topic,
    setTopic,
    choices,
    setChoices,
    canSave,
    save,
    pending: create.isPending || update.isPending,
  };
}

function QuestionFormFields(form: ReturnType<typeof useQuestionForm>, questionId: string | null) {
  return (
    <div className="space-y-3">
      {!form.isEdit && (
        <Field label="ประเภทคำถาม">
          <Select value={form.type} onChange={(e) => form.setType(e.target.value as ExamQuestionType)}>
            {Object.entries(TYPE_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="space-y-1">
        <span className="font-ui text-xs font-medium">โจทย์</span>
        <QuestionEditor value={form.prompt} onChange={form.setPrompt} questionId={questionId} />
      </div>
      <div className="flex gap-3">
        <div className="w-32 shrink-0">
          <Field label="ความยาก">
            <Select value={form.difficulty} onChange={(e) => form.setDifficulty(e.target.value as ExamQuestionDifficulty)}>
              {Object.entries(DIFFICULTY_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="min-w-0 flex-1">
          <Field label="ชื่อเนื้อหา">
            <Input value={form.topic} onChange={(e) => form.setTopic(e.target.value)} placeholder="เช่น สมการเชิงเส้น" />
          </Field>
        </div>
      </div>
      {form.type === "short_answer" ? (
        <Field label="เฉลย (ไม่สนตัวพิมพ์เล็ก/ใหญ่)">
          <Input value={form.correctAnswer} onChange={(e) => form.setCorrectAnswer(e.target.value)} />
        </Field>
      ) : (
        <ChoiceEditor type={form.type} choices={form.choices} onChange={form.setChoices} />
      )}
    </div>
  );
}

/** Always-visible "new question" form above the table — no add button, matches ChoiceEditor's inline style. */
function QuestionForm({
  subjectId,
  teacherId,
  question,
  onSaved,
}: {
  subjectId: string;
  teacherId: string;
  question: ExamQuestionWithChoices | null;
  onSaved: () => void;
}) {
  const form = useQuestionForm({ subjectId, teacherId, question, onSaved });
  return (
    <div className="space-y-3">
      {QuestionFormFields(form, question?.id ?? null)}
      <Button className="w-full" onClick={form.save} disabled={!form.canSave || form.pending}>
        บันทึก
      </Button>
    </div>
  );
}

function QuestionSheet({
  open,
  onOpenChange,
  subjectId,
  teacherId,
  question,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  teacherId: string;
  question: ExamQuestionWithChoices | null;
}) {
  const form = useQuestionForm({ subjectId, teacherId, question, onSaved: () => onOpenChange(false) });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={form.isEdit ? "แก้ไขข้อสอบ" : "เพิ่มข้อสอบ"}
      wide
      footer={
        <Button className="w-full" onClick={form.save} disabled={!form.canSave || form.pending}>
          บันทึก
        </Button>
      }
    >
      {QuestionFormFields(form, question?.id ?? null)}
    </Sheet>
  );
}

function ChoiceEditor({
  type,
  choices,
  onChange,
}: {
  type: ExamQuestionType;
  choices: ChoiceDraft[];
  onChange: (choices: ChoiceDraft[]) => void;
}) {
  if (type === "true_false") {
    const correctIdx = choices.findIndex((c) => c.is_correct);
    return (
      <Field label="คำตอบที่ถูก">
        <Select
          value={String(correctIdx === 0 ? "true" : "false")}
          onChange={(e) =>
            onChange([
              { label: "ถูก", is_correct: e.target.value === "true" },
              { label: "ผิด", is_correct: e.target.value === "false" },
            ])
          }
        >
          <option value="true">ถูก</option>
          <option value="false">ผิด</option>
        </Select>
      </Field>
    );
  }

  return (
    <Field label="ตัวเลือก (เลือกตัวที่ถูกไว้ 1 ข้อ)">
      <div className="space-y-2">
        {choices.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              checked={c.is_correct}
              onChange={() => onChange(choices.map((ch, j) => ({ ...ch, is_correct: j === i })))}
              aria-label={`ตัวเลือกที่ถูก ${i + 1}`}
            />
            <Input
              value={c.label}
              onChange={(e) => onChange(choices.map((ch, j) => (j === i ? { ...ch, label: e.target.value } : ch)))}
              placeholder={`ตัวเลือกที่ ${i + 1}`}
              className="min-w-0 flex-1"
            />
            {choices.length > 2 && (
              <Button
                size="icon"
                variant="ghost"
                aria-label="ลบตัวเลือก"
                onClick={() => onChange(choices.filter((_, j) => j !== i))}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => onChange([...choices, { label: "", is_correct: false }])}>
          <Plus className="h-3 w-3" /> เพิ่มตัวเลือก
        </Button>
      </div>
    </Field>
  );
}

/**
 * Native <details>/<summary> disclosure instead of Select — a plain <option>
 * can't render a badge, and each row here needs one for the subject's
 * suggested grade level. Browser handles outside-click/Escape/focus for
 * free; the only JS is closing on selection.
 */
export function SubjectPicker({
  subjects,
  gradeLevelById,
  value,
  onChange,
}: {
  subjects: Subject[];
  gradeLevelById: Map<string, { code: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = subjects.find((s) => s.id === value) ?? null;

  return (
    <details
      className="relative w-auto min-w-[10rem]"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary
        className={cn(
          "tappable flex h-8 w-full cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-xs outline-none marker:content-none focus-visible:border-ring [&::-webkit-details-marker]:hidden",
        )}
        aria-label="วิชา"
      >
        <span className={cn("flex min-w-0 items-center gap-1.5 truncate", !selected && "text-muted-foreground")}>
          {selected ? (
            <>
              <span className="truncate">{selected.name_th}</span>
              {selected.suggested_grade_level_id && gradeLevelById.get(selected.suggested_grade_level_id) && (
                <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                  {gradeShortLabel(gradeLevelById.get(selected.suggested_grade_level_id)!.code)}
                </span>
              )}
            </>
          ) : (
            "เลือกวิชา"
          )}
        </span>
        <ChevronForward className={cn("h-3 w-3 shrink-0 rotate-90 text-muted-foreground transition-transform", open && "-rotate-90")} />
      </summary>

      <ul className="absolute z-20 mt-1 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-lg border border-border bg-card p-1 text-xs shadow-lg">
        {subjects.length === 0 && <li className="px-2 py-2 text-muted-foreground">ไม่มีวิชา</li>}
        {subjects.map((s) => {
          const grade = s.suggested_grade_level_id ? gradeLevelById.get(s.suggested_grade_level_id) : null;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
                className={cn(
                  "tappable flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-muted",
                  s.id === value && "bg-muted font-medium",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{s.name_th}</span>
                {grade && (
                  <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                    {gradeShortLabel(grade.code)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
