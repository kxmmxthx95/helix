import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus, X } from "@/components/icons";
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
  useSubjectsByIds,
  useUpdateExamQuestion,
  type ChoiceDraft,
  type ExamQuestionWithChoices,
} from "@/hooks/useExamBank";
import { useMyTeachingAssignments } from "@/hooks/useTeachingPlan";
import type { ExamQuestionType } from "@/lib/database.types";

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
        <Select
          className="w-auto min-w-[10rem]"
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setSetId("");
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
