import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Button, Card, EmptyState, Field, Input, Spinner } from "@/components/ui";
import {
  assignmentStatus,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  signedSubmissionAttachmentUrl,
  useMyAssignments,
  useMyItemScores,
  useSubmission,
  useSubmitAssignment,
  type AssignmentStatus,
  type MyAssignment,
} from "@/hooks/useAssignments";
import { useMyChildren } from "@/hooks/useAttendance";
import type { Student } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<AssignmentStatus, string> = {
  missing: "ยังไม่ส่ง",
  submitted: "ส่งแล้ว",
  late: "ส่งช้า",
  graded: "ตรวจแล้ว",
};

const STATUS_STYLE: Record<AssignmentStatus, string> = {
  missing: "bg-muted text-muted-foreground",
  submitted: "bg-success/15 text-success",
  late: "bg-warning/15 text-warning",
  graded: "bg-accent/15 text-accent",
};

/** role="student"/"parent" only — visible to everyone in the nav (see AppShell), renders empty for teacher/admin. */
export function Assignments() {
  const { profile, myStudent } = useAuth();
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(isParent ? (profile?.id ?? null) : null);
  const options = [...(myStudent ? [myStudent] : []), ...children];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = options.find((s) => s.id === selectedId) ?? options[0] ?? null;

  if (options.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="ไม่มีข้อมูล" description="เมนูนี้สำหรับนักเรียนและผู้ปกครองเท่านั้น" />
      </div>
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
                current?.id === s.id ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s.first_name} {s.last_name}
            </button>
          ))}
        </div>
      )}
      {current && <AssignmentList student={current} />}
    </div>
  );
}

function AssignmentList({ student }: { student: Student }) {
  const { data: items = [], isLoading } = useMyAssignments(student.id);
  const { data: scores } = useMyItemScores(student.id);
  const [open, setOpen] = useState<MyAssignment | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState title="ไม่มีงาน" description="ยังไม่มีงานที่โพสต์" />;
  }

  return (
    <>
      <ul className="space-y-2">
        {items.map((item) => (
          <AssignmentCard
            key={item.id}
            item={item}
            student={student}
            graded={scores?.has(item.id) ?? false}
            onOpen={() => setOpen(item)}
          />
        ))}
      </ul>
      <SubmitSheet item={open} student={student} scoreInfo={open ? (scores?.get(open.id) ?? null) : null} onClose={() => setOpen(null)} />
    </>
  );
}

function AssignmentCard({
  item,
  student,
  graded,
  onOpen,
}: {
  item: MyAssignment;
  student: Student;
  graded: boolean;
  onOpen: () => void;
}) {
  const { data: submission } = useSubmission(item.id, student.id);
  const status = assignmentStatus(item, submission ?? null, graded);

  return (
    <li>
      <Card className="cursor-pointer space-y-1" onClick={onOpen}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {item.subjectCode} · {item.subjectName}
            </p>
            <p className="font-medium">{item.label}</p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", STATUS_STYLE[status])}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
        {item.due_date && <p className="text-xs text-muted-foreground">กำหนดส่ง {item.due_date}</p>}
      </Card>
    </li>
  );
}

function SubmitSheet({
  item,
  student,
  scoreInfo,
  onClose,
}: {
  item: MyAssignment | null;
  student: Student;
  scoreInfo: { score: number; feedback: string | null } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data: submission } = useSubmission(item?.id ?? null, student.id);
  const submit = useSubmitAssignment();
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // Locked once graded, unless the teacher explicitly reopened it (grill decision: "ส่งซ้ำเมื่อครูเปิด").
  const locked = !!scoreInfo && !submission?.reopened;

  async function openAttachment(path: string) {
    try {
      window.open(await signedSubmissionAttachmentUrl(path), "_blank");
    } catch {
      /* best-effort — ignore */
    }
  }

  function onSubmit() {
    if (!item) return;
    submit.mutate(
      { scoreItemId: item.id, studentId: student.id, content: content.trim() || null, files },
      {
        onSuccess: () => {
          toast("ส่งงานสำเร็จ");
          setContent("");
          setFiles([]);
          onClose();
        },
        onError: (err) => toast(err instanceof Error ? err.message : "ส่งงานไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={item !== null}
      onOpenChange={(o) => !o && onClose()}
      title={item?.label ?? "งาน"}
      description={item?.description ?? undefined}
    >
      {item && (
        <div className="space-y-4">
          {item.due_date && <p className="text-xs text-muted-foreground">กำหนดส่ง {item.due_date}</p>}

          {scoreInfo && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p>
                คะแนน: <span className="font-semibold">{scoreInfo.score}</span> / {item.max_score}
              </p>
              {scoreInfo.feedback && <p className="mt-1 text-muted-foreground">{scoreInfo.feedback}</p>}
            </div>
          )}

          {submission && (
            <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">
                ส่งแล้วเมื่อ {new Date(submission.submitted_at).toLocaleString("th-TH")}
              </p>
              {submission.content && <p className="whitespace-pre-wrap">{submission.content}</p>}
              {submission.attachments.length > 0 && (
                <ul className="space-y-1">
                  {submission.attachments.map((a) => (
                    <li key={a.id}>
                      <button type="button" className="text-primary underline" onClick={() => openAttachment(a.storage_path)}>
                        {a.file_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!item.requires_submission ? (
            <p className="text-sm text-muted-foreground">งานนี้ไม่ต้องส่งออนไลน์ — ครูให้คะแนนจากที่ส่งในห้องเรียน</p>
          ) : locked ? (
            <p className="text-xs text-muted-foreground">ตรวจแล้ว — ส่งงานใหม่ไม่ได้ (ให้ครูเปิดให้ส่งใหม่ก่อน)</p>
          ) : (
            <>
              {submission?.reopened && <p className="text-xs text-warning">ครูเปิดให้ส่งงานใหม่ได้</p>}
              <Field label="ข้อความ">
                <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="พิมพ์คำตอบ (ถ้ามี)" />
              </Field>
              <div>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  id="submission-files"
                  onChange={(e) => {
                    const picked = [...(e.target.files ?? [])].slice(0, MAX_ATTACHMENTS);
                    if (picked.some((f) => f.size > MAX_ATTACHMENT_BYTES)) {
                      toast("ไฟล์ต้องมีขนาดไม่เกิน 10MB", "error");
                      return;
                    }
                    setFiles(picked);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById("submission-files")?.click()}
                >
                  {files.length ? `เลือกแล้ว ${files.length} ไฟล์` : "แนบไฟล์ (สูงสุด 5 ไฟล์)"}
                </Button>
              </div>
              <Button className="w-full" onClick={onSubmit} disabled={submit.isPending}>
                {submit.isPending ? <Spinner className="h-3 w-3" /> : submission ? "ส่งใหม่" : "ส่งงาน"}
              </Button>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
