import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ChevronForward, Plus, X } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Select, Spinner } from "@/components/ui";
import {
  useCreateExamQuestion,
  useCreateExamSet,
  useDeleteExamQuestion,
  useDeleteExamSet,
  useExamQuestions,
  useExamSets,
  useGradeLevelsByIds,
  useSubjectsByIds,
  useUpdateExamQuestion,
  type ChoiceDraft,
  type ExamQuestionWithChoices,
} from "@/hooks/useExamBank";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import type { ExamQuestionType, Subject } from "@/lib/database.types";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<ExamQuestionType, string> = {
  multiple_choice: "ปรนัย (เลือกตอบ)",
  true_false: "ถูก/ผิด",
  short_answer: "เติมคำ",
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
  const [setId, setSetId] = useState("");
  const [creatingSet, setCreatingSet] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ExamQuestionWithChoices | null>(null);

  const { data: sets = [] } = useExamSets(subjectId || null);
  const { data: questions = [], isLoading } = useExamQuestions(subjectId || null, setId || null);
  const deleteQuestion = useDeleteExamQuestion();
  const deleteSet = useDeleteExamSet();
  const toast = useToast();

  if (!me?.roles.includes("teacher")) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }

  return (
    <div className="page-fill">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SubjectPicker
          subjects={subjects}
          gradeLevelById={gradeLevelById}
          value={subjectId}
          onChange={(id) => {
            setSubjectId(id);
            setSetId("");
          }}
        />
        {subjectId && (
          <>
            <Select
              className="w-auto min-w-[9rem]"
              value={setId}
              onChange={(e) => setSetId(e.target.value)}
              aria-label="ชุดข้อสอบ"
              placeholder="ทุกชุด"
            >
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" onClick={() => setCreatingSet(true)}>
              <Plus className="h-3 w-3" /> เพิ่มชุดข้อสอบ
            </Button>
            {setId && (
              <Button
                size="icon"
                variant="ghost"
                aria-label="ลบชุดข้อสอบ"
                onClick={() => {
                  const set = sets.find((s) => s.id === setId);
                  if (!set || !confirm(`ลบชุด "${set.name}"? (ข้อสอบในชุดจะยังอยู่ในคลัง)`)) return;
                  deleteSet.mutate(setId, {
                    onSuccess: () => setSetId(""),
                    onError: () => toast("ลบไม่สำเร็จ", "error"),
                  });
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            <Button size="sm" onClick={() => setCreating(true)} disabled={sets.length === 0}>
              <Plus className="h-3 w-3" /> เพิ่มข้อสอบ
            </Button>
          </>
        )}
      </div>

      {!subjectId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกวิชา" description="เลือกวิชาด้านบนเพื่อดูคลังข้อสอบ" />
        </div>
      ) : sets.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ยังไม่มีชุดข้อสอบ" description="กด “เพิ่มชุดข้อสอบ” เพื่อสร้างชุดก่อนเริ่มเพิ่มข้อสอบ" />
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : questions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ยังไม่มีข้อสอบ" description="กด “เพิ่มข้อสอบ” เพื่อเริ่มสร้างคลังข้อสอบของวิชานี้" />
        </div>
      ) : (
        <div className="table-panel flex-1">
          <div className="table-panel-scroll">
            <table className="w-full min-w-[32rem] text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">โจทย์</th>
                  <th className="px-3 py-2 font-medium">ประเภท</th>
                  <th className="px-3 py-2 font-medium">คะแนน</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => setEditing(q)}
                    className="cursor-pointer border-t border-border hover:bg-muted active:bg-muted"
                  >
                    <td className="max-w-xs truncate px-3 py-2">{q.prompt}</td>
                    <td className="px-3 py-2">{TYPE_LABEL[q.question_type]}</td>
                    <td className="px-3 py-2">{q.points}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="ลบ"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!confirm("ลบข้อสอบนี้?")) return;
                          deleteQuestion.mutate(q.id, {
                            onError: () => toast("ลบไม่สำเร็จ", "error"),
                          });
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateSetSheet open={creatingSet} onOpenChange={setCreatingSet} subjectId={subjectId} teacherId={me.id} />
      <QuestionSheet
        open={creating}
        onOpenChange={setCreating}
        subjectId={subjectId}
        teacherId={me.id}
        sets={sets}
        defaultSetId={setId || sets[0]?.id || ""}
        question={null}
      />
      <QuestionSheet
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        subjectId={subjectId}
        teacherId={me.id}
        sets={sets}
        defaultSetId=""
        question={editing}
      />
    </div>
  );
}

function CreateSetSheet({
  open,
  onOpenChange,
  subjectId,
  teacherId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  teacherId: string;
}) {
  const [name, setName] = useState("");
  const create = useCreateExamSet();
  const toast = useToast();

  function save() {
    if (!name.trim()) return;
    create.mutate(
      { subject_id: subjectId, name: name.trim(), created_by: teacherId },
      {
        onSuccess: () => {
          onOpenChange(false);
          setName("");
        },
        onError: () => toast("สร้างไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="เพิ่มชุดข้อสอบ"
      footer={
        <Button className="w-full" onClick={save} disabled={!name.trim() || create.isPending}>
          บันทึก
        </Button>
      }
    >
      <Field label="ชื่อชุดข้อสอบ">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น บทที่ 1, กลางภาค 2569" />
      </Field>
    </Sheet>
  );
}

function QuestionSheet({
  open,
  onOpenChange,
  subjectId,
  teacherId,
  sets,
  defaultSetId,
  question,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  teacherId: string;
  sets: { id: string; name: string }[];
  defaultSetId: string;
  question: ExamQuestionWithChoices | null;
}) {
  const isEdit = !!question;
  const create = useCreateExamQuestion();
  const update = useUpdateExamQuestion();
  const toast = useToast();

  const [type, setType] = useState<ExamQuestionType>(question?.question_type ?? "multiple_choice");
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [points, setPoints] = useState(String(question?.points ?? 1));
  const [correctAnswer, setCorrectAnswer] = useState(question?.correct_answer ?? "");
  const [choices, setChoices] = useState<ChoiceDraft[]>(
    question?.choices.map((c) => ({ label: c.label, is_correct: c.is_correct })) ?? [
      { label: "", is_correct: true },
      { label: "", is_correct: false },
    ],
  );
  const [setIds, setSetIds] = useState<string[]>(question?.set_ids ?? (defaultSetId ? [defaultSetId] : []));

  function reset() {
    setType("multiple_choice");
    setPrompt("");
    setPoints("1");
    setCorrectAnswer("");
    setChoices([
      { label: "", is_correct: true },
      { label: "", is_correct: false },
    ]);
    setSetIds(defaultSetId ? [defaultSetId] : []);
  }

  const pointsNum = Number(points);
  const canSave =
    prompt.trim() &&
    pointsNum > 0 &&
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
          prompt: prompt.trim(),
          points: pointsNum,
          correct_answer: type === "short_answer" ? correctAnswer.trim() : null,
          choices: type === "short_answer" ? undefined : finalChoices,
          set_ids: setIds,
        },
        {
          onSuccess: () => onOpenChange(false),
          onError: () => toast("บันทึกไม่สำเร็จ", "error"),
        },
      );
    } else {
      create.mutate(
        {
          subject_id: subjectId,
          question_type: type,
          prompt: prompt.trim(),
          points: pointsNum,
          correct_answer: type === "short_answer" ? correctAnswer.trim() : null,
          created_by: teacherId,
          choices: finalChoices,
          set_ids: setIds,
        },
        {
          onSuccess: () => {
            onOpenChange(false);
            reset();
          },
          onError: () => toast("สร้างไม่สำเร็จ", "error"),
        },
      );
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "แก้ไขข้อสอบ" : "เพิ่มข้อสอบ"}
      footer={
        <Button className="w-full" onClick={save} disabled={!canSave || create.isPending || update.isPending}>
          บันทึก
        </Button>
      }
    >
      <div className="space-y-3">
        {!isEdit && (
          <Field label="ประเภทคำถาม">
            <Select value={type} onChange={(e) => setType(e.target.value as ExamQuestionType)}>
              {Object.entries(TYPE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="โจทย์">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="flex w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring"
          />
        </Field>
        <Field label="คะแนน">
          <Input type="number" min="0.01" step="0.01" value={points} onChange={(e) => setPoints(e.target.value)} className="w-24" />
        </Field>

        {type === "short_answer" ? (
          <Field label="เฉลย (ไม่สนตัวพิมพ์เล็ก/ใหญ่)">
            <Input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} />
          </Field>
        ) : (
          <ChoiceEditor type={type} choices={choices} onChange={setChoices} />
        )}

        {sets.length > 0 && (
          <Field label="ชุดข้อสอบ (เลือกได้หลายชุด)">
            <div className="space-y-1.5 rounded-lg border border-border p-2">
              {sets.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={setIds.includes(s.id)}
                    onChange={(e) =>
                      setSetIds(e.target.checked ? [...setIds, s.id] : setIds.filter((id) => id !== s.id))
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </Field>
        )}
      </div>
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
