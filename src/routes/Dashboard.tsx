import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Modal } from "@/components/Modal";
import { Sheet } from "@/components/Sheet";
import { Button, Card, EmptyState, Field, Input, Select, Skeleton, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { assignmentStatus, useMyAssignments, useMyItemScores, useMySubmissions } from "@/hooks/useAssignments";
import { summarizeAttendance, useAttendanceRange, useMyChildren } from "@/hooks/useAttendance";
import { STARTING_SCORE, summarizeBehaviorScore, useBehaviorRecords } from "@/hooks/useBehaviorRecords";
import { BookIcon, BuildingIcon, CheckboxIcon, ChevronForward, DocumentTextIcon, LinkIcon, PrintIcon, Search, SettingsOutlineIcon, SquareIcon, TrashIcon, UploadOutlineIcon } from "@/components/icons";
import { DOC_ACCEPT, findOrCreateDocLesson, useDeleteDocFile, useUploadDocFile } from "@/hooks/useDocuments";
import { useAddPrintRequest, usePrintRequests } from "@/hooks/useDocPrint";
import { openDocFile, useLinkPlanLessonFile, useUnlinkPlanLessonFile } from "@/hooks/usePlan";
import { DocPicker } from "@/routes/CurriculumMap";
import { useQueryClient } from "@tanstack/react-query";
import { useSubjectColors } from "@/hooks/useSubjectColors";
import type { OverviewLesson } from "@/hooks/useDeptClassroomOverview";
import { useCurrentTerm } from "@/hooks/useAcademicTerms";
import {
  useDeptClassroomOverview,
  hiddenSubjectKey,
  useHiddenOverviewSubjects,
  useSetHiddenOverviewSubjects,
} from "@/hooks/useDeptClassroomOverview";
import { useClockIn, useClockOut, useMyTimeClock } from "@/hooks/useTimeClock";
import {
  useCancelStudentLeaveRequest,
  useRequestStudentLeave,
  useStudentLeaveRequests,
} from "@/hooks/useStudentLeave";
import { useSchoolSettings } from "@/hooks/useSettings";
import {
  profileFullName,
  type AttendanceStatus,
  type StudentLeaveStatus,
  type Student,
} from "@/lib/database.types";
import { useDepartments, useRoleSubtitle } from "@/hooks/useProfiles";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { cn, todayIso } from "@/lib/utils";
import { STATUS_LABEL } from "@/routes/Attendance";
import { bangkokTime } from "@/routes/TimeTracking";

const LEAVE_STATUS_LABEL: Record<StudentLeaveStatus, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิกแล้ว",
};

const LEAVE_STATUS_STYLE: Record<StudentLeaveStatus, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "leave"];
const monthLabel = () => new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(new Date());
/** ISO yyyy-mm-dd → "14 ต.ค." (parsed and formatted in UTC so the day never shifts). */
const leaveDate = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar parts of the Thailand day, so month and year ranges roll over at Bangkok midnight. */
function bangkokYearMonth() {
  const [year = 0, month = 1] = todayIso().split("-").map(Number);
  return { year, month };
}

export function currentMonthRange() {
  const { year, month } = bangkokYearMonth();
  // Day 0 of next month = last day of this one; getUTCDate avoids the local-midnight-to-UTC day shift.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` };
}

/** Thai school year runs 1 May – 30 April. */
export function currentAcademicYearRange() {
  const { year, month } = bangkokYearMonth();
  const startYear = month >= 5 ? year : year - 1;
  return { start: `${startYear}-05-01`, end: `${startYear + 1}-04-30` };
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Bangkok" }).format(new Date())) % 24;
  if (hour < 12) return "สวัสดีตอนเช้า";
  if (hour < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

export function Dashboard() {
  const { profile, myStudent } = useAuth();
  const roleSubtitle = useRoleSubtitle(profile?.id, profile?.roles ?? []);
  const isParent = profile?.roles.includes("parent") ?? false;
  const { data: children = [] } = useMyChildren(isParent ? (profile?.id ?? null) : null);
  const { data: schoolSettings } = useSchoolSettings();
  const students = [...(myStudent ? [myStudent] : []), ...children];
  const isDeptOverview = profile?.roles.some((r) => r === "dept_director" || r === "super_admin") ?? false;
  const showClockWidget =
    !!profile && profile.roles.some((r) => schoolSettings?.time_tracking_roles.includes(r));

  return (
    <div className={cn("space-y-6", !isDeptOverview && "mx-auto max-w-xl")}>
      {!isDeptOverview && (
        <div>
          <h1 className="font-heading text-lg font-semibold leading-snug">
            {greeting()}{profile && `, ${profileFullName(profile)}`}
          </h1>
          {profile && <p className="text-xs leading-snug text-muted-foreground">{roleSubtitle}</p>}
        </div>
      )}

      {showClockWidget && profile && (
        <Card>
          <QuickClockSection profileId={profile.id} departmentId={profile.department_id} />
        </Card>
      )}

      {profile && isDeptOverview && (
        <DeptClassroomSection
          profileId={profile.id}
          departmentId={profile.department_id}
          pickDepartment={profile.roles.includes("super_admin")}
        />
      )}

      {profile &&
        students.map((st) => (
          <Card key={`leave-${st.id}`}>
            <StudentLeaveSection student={st} submittedBy={profile.id} />
          </Card>
        ))}
      {students.map((st) => (
        <Card key={`assignments-${st.id}`}>
          <AssignmentSummarySection student={st} />
        </Card>
      ))}
      {students.map((st) => (
        <Card key={`attendance-${st.id}`}>
          <AttendanceSummarySection student={st} />
        </Card>
      ))}
      {students.map((st) => (
        <Card key={`behavior-${st.id}`}>
          <BehaviorScoreSection student={st} />
        </Card>
      ))}
    </div>
  );
}

const SECTION_TITLE = "font-ui text-xs font-medium text-muted-foreground";

/** Shown when a query failed and there is no cached data — never render that as "empty" or zero. */
function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mt-1 flex items-center justify-between gap-2">
      <p className="text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        ลองใหม่
      </Button>
    </div>
  );
}

function SeeAll({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <Button variant="ghost" size="sm" className="-mr-2 text-accent" onClick={() => navigate(to)}>
      ดูทั้งหมด
    </Button>
  );
}

/** role="dept_director" (own department) / "super_admin" (picks one) — ห้อง → วิชา → บทเรียน/หัวข้อย่อย of the latest term. */
function DeptClassroomSection({
  profileId,
  departmentId,
  pickDepartment,
}: {
  profileId: string;
  departmentId: string | null;
  pickDepartment: boolean;
}) {
  const { data: departments = [] } = useDepartments();
  const [picked, setPicked] = useState("");
  const deptId = (pickDepartment ? picked || departments[0]?.id : departmentId) ?? null;
  const { data: term, isLoading: termLoading } = useCurrentTerm(deptId);
  // teaching_assignments.term is only set for SEC (migration 0017).
  const isSec = departments.find((d) => d.id === deptId)?.code === "SEC";
  const { data: allRooms = [], isLoading, isError, refetch } = useDeptClassroomOverview(
    deptId,
    term?.academicYear ?? null,
    isSec ? (term?.term ?? null) : null,
  );
  const { data: hiddenIds = [] } = useHiddenOverviewSubjects(profileId);
  const [settingsRoomId, setSettingsRoomId] = useState("");
  const rooms = allRooms.map((r) => ({ ...r, subjects: r.subjects.filter((s) => !hiddenIds.includes(hiddenSubjectKey(r.id, s.id))) }));
  const [roomId, setRoomId] = useState("");
  const settingsRoom = allRooms.find((r) => r.id === settingsRoomId);
  const open = rooms.find((r) => r.id === roomId);
  const [subjectId, setSubjectId] = useState("");
  const openSubject = open?.subjects.find((x) => x.id === subjectId);
  const colors = useSubjectColors([]); // hue from กลุ่มสาระ only
  const subjectTile = (areaId: string | null) => (
    <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", colors.shade(areaId))}>
      <BookIcon className="h-6 w-6" />
    </div>
  );
  const subjectCounts = (s: { lessons: { topics: unknown[] }[] }) =>
    `${s.lessons.length} บท · ${s.lessons.reduce((n, l) => n + l.topics.length, 0)} หัวข้อ`;
  const loading = termLoading || isLoading;

  return (
    <section className="space-y-3 pb-12">
      <div className="flex items-center justify-between gap-2">
        {open && (
          <Button size="sm" variant="ghost" onClick={() => (openSubject ? setSubjectId("") : setRoomId(""))}>
            <ChevronForward className="h-3 w-3 rotate-180" /> {openSubject ? open.name : "ห้องเรียนทั้งหมด"}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {pickDepartment && (
            <Select
              aria-label="แผนก"
              className="w-auto"
              value={deptId ?? ""}
              onChange={(e) => {
                setPicked(e.target.value);
                setRoomId("");
              }}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>
      {loading && <Skeleton className="h-10 w-full" />}
      {isError && <LoadError onRetry={() => void refetch()} />}
      {!loading && !isError && rooms.length === 0 && (
        <EmptyState
          className="min-h-[60vh]"
          icon={BuildingIcon}
          title="ยังไม่มีห้องเรียน"
          description={pickDepartment ? "แผนกนี้ยังไม่มีห้องเรียนที่มีรายวิชาในเทอมล่าสุด ลองเลือกแผนกอื่น" : "ยังไม่มีห้องเรียนที่มีรายวิชาในเทอมล่าสุด"}
        />
      )}
      {open ? (
        <div className="space-y-3">
          {openSubject ? (
            <>
              <div className="flex items-center gap-3">
                {subjectTile(openSubject.areaId)}
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">{openSubject.code}</div>
                  <h3 className="truncate text-base font-bold">{openSubject.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {openSubject.teachers.join(", ") || "ไม่ระบุครู"} · {subjectCounts(openSubject)}
                  </p>
                </div>
              </div>
              {openSubject.lessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีบทเรียนในผังการเรียน</p>
              ) : (
                <ol className="space-y-2">
                  {openSubject.lessons.map((l, i) => (
                    <li
                      key={l.id}
                      className={cn("rounded-2xl border bg-card p-4 shadow-sm", l.file ? "border-success" : "border-border")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-bold">
                          {i + 1}. {l.name}
                        </div>
                        <LessonDocActions
                          lesson={l}
                          profileId={profileId}
                          subjectId={openSubject.id}
                          gradeLevelId={open.gradeLevelId}
                        />
                      </div>
                      {l.topics.length > 0 && (
                        <ul className="mt-2 list-disc space-y-0.5 pl-9 text-xs text-muted-foreground">
                          {l.topics.map((t) => (
                            <li key={t.id}>{t.name}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <>
              <h3 className="text-base font-bold">{open.name}</h3>
              {open.subjects.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีวิชาที่แสดง</p>}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {open.subjects.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSubjectId(s.id)}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                  >
                    {subjectTile(s.areaId)}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-sm font-semibold text-foreground/70">{s.code}</div>
                      <div className="line-clamp-2 text-base font-bold leading-snug text-foreground">{s.name}</div>
                      <div className="text-sm text-foreground/80">{s.teachers.join(", ") || "ไม่ระบุครู"}</div>
                      <div className="text-sm font-medium text-foreground/70">{subjectCounts(s)}</div>
                    </div>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-lg bg-muted text-foreground">
                      <ChevronForward className="h-4 w-4" />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rooms.map((room) => {
            const lessons = room.subjects.flatMap((s) => s.lessons);
            return (
              <div
                key={room.id}
                className="relative flex flex-col rounded-2xl border border-border bg-card shadow-sm hover:shadow-md"
              >
                <button type="button" onClick={() => {
                    setRoomId(room.id);
                    setSubjectId("");
                  }} className="flex h-full min-h-32 items-center gap-3 rounded-2xl p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                      <BuildingIcon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 pr-6 text-base font-bold leading-snug text-foreground">{room.name}</div>
                      <div className="mt-1 truncate text-sm font-medium text-foreground/70">
                        {room.subjects.length} วิชา · {lessons.length} บท · {lessons.reduce((n, l) => n + l.topics.length, 0)} หัวข้อ
                      </div>
                    </div>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-lg bg-muted text-foreground">
                    <ChevronForward className="h-4 w-4" />
                  </span>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-2 top-2 text-foreground/70"
                  aria-label={`ตั้งค่าวิชาที่จะแสดง ${room.name}`}
                  onClick={() => setSettingsRoomId(room.id)}
                >
                  <SettingsOutlineIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <VisibleSubjectsSheet
        open={!!settingsRoom}
        onClose={() => setSettingsRoomId("")}
        profileId={profileId}
        roomName={settingsRoom?.name ?? ""}
        classroomId={settingsRoom?.id ?? ""}
        // This room's subjects only. One entry per name: a room can hold two subject rows with the same name.
        groups={[
          ...(settingsRoom?.subjects ?? []).reduce((m, s) => {
            const g = m.get(s.name) ?? { name: s.name, code: s.code, areaId: s.areaId, ids: new Set<string>(), grades: new Set([settingsRoom!.gradeCode]) };
            g.ids.add(s.id);
            return m.set(s.name, g);
          }, new Map<string, SubjectGroup>()).values(),
        ]}
        hiddenIds={hiddenIds}
      />
    </section>
  );
}

/** Teaching-document actions on a lesson card: open, queue for printing, link existing documents, upload a new one. */
function LessonDocActions({
  lesson,
  profileId,
  subjectId,
  gradeLevelId,
}: {
  lesson: OverviewLesson;
  profileId: string;
  subjectId: string;
  gradeLevelId: string;
}) {
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const link = useLinkPlanLessonFile();
  const unlink = useUnlinkPlanLessonFile();
  const deleteFile = useDeleteDocFile();
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries({ queryKey: ["dept_classroom_overview"] });

  // Close the document menu on an outside click or Esc.
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);
  const iconButton = (label: string, onClick: () => void, icon: React.ReactNode, aria?: React.AriaAttributes & { "aria-haspopup"?: "menu" }) => (
    <Button size="icon" variant="ghost" className="-my-1.5 shrink-0" aria-label={label} onClick={onClick} {...aria}>
      {icon}
    </Button>
  );

  return (
    <div className="-mr-2 flex shrink-0 items-center">
      {lesson.file && (
        <div ref={menuRef} className="relative">
          {iconButton(
            `เอกสารการสอน ${lesson.file.name}`,
            () => setMenuOpen((v) => !v),
            <DocumentTextIcon className="h-4 w-4" />,
            { "aria-haspopup": "menu", "aria-expanded": menuOpen },
          )}
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-card py-1 text-sm shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                onClick={async () => {
                  setMenuOpen(false);
                  if (!(await openDocFile(lesson.file!.path))) toast("เปิดเอกสารไม่สำเร็จ", "error");
                }}
              >
                <DocumentTextIcon className="h-4 w-4" /> ดูเอกสาร
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-destructive hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false);
                  if (!confirm(`เอาเอกสาร "${lesson.file!.name}" ออกจากบทเรียนนี้? (ไฟล์ยังอยู่ในระบบเอกสาร)`)) return;
                  unlink.mutate(lesson.file!.linkId, {
                    onSuccess: () => {
                      void refresh();
                      toast("เอาเอกสารออกแล้ว");
                    },
                    onError: () => toast("เอาเอกสารออกไม่สำเร็จ", "error"),
                  });
                }}
              >
                <TrashIcon className="h-4 w-4" /> ลบเอกสาร
              </button>
            </div>
          )}
        </div>
      )}
      {lesson.file && iconButton(`ส่ง ${lesson.file.name} เข้ารายการพิมพ์`, () => setPrinting(true), <PrintIcon className="h-4 w-4" />)}
      {iconButton(`เชื่อมต่อเอกสารกับบทเรียน ${lesson.name}`, () => setPicking(true), <LinkIcon className="h-4 w-4" />)}
      {iconButton(`อัปโหลดเอกสารของบทเรียน ${lesson.name}`, () => setUploading(true), <UploadOutlineIcon className="h-4 w-4" />)}

      {printing && lesson.file && <PrintDialog file={lesson.file} onClose={() => setPrinting(false)} />}
      <DocPicker
        open={picking}
        onClose={() => setPicking(false)}
        title={lesson.name}
        files={lesson.files}
        // Only your own uploads can be deleted for good (the DB also lets subject writers; this is a UI guard).
        canDelete={(c) => c.uploadedBy === profileId}
        onDelete={async (c) => {
          try {
            await deleteFile.mutateAsync({ id: c.id, file_path: c.filePath });
            await Promise.all(
              [["plan"], ["dept_classroom_overview"], ["doc_print_requests"]].map((queryKey) => qc.invalidateQueries({ queryKey })),
            );
            toast("ลบไฟล์แล้ว");
            return true;
          } catch {
            toast("ลบไฟล์ไม่สำเร็จ", "error");
            return false;
          }
        }}
        onApply={async (add, remove) => {
          try {
            await Promise.all([
              ...add.map((doc_file_id) => link.mutateAsync({ lesson_id: lesson.id, doc_file_id })),
              ...remove.map((linkId) => unlink.mutateAsync(linkId)),
            ]);
            await refresh();
            return true;
          } catch {
            toast("บันทึกเอกสารไม่สำเร็จ", "error");
            return false;
          }
        }}
      />
      {uploading && (
        <UploadDialog
          lesson={lesson}
          profileId={profileId}
          subjectId={subjectId}
          gradeLevelId={gradeLevelId}
          onClose={() => setUploading(false)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function PrintDialog({ file, onClose }: { file: { id: string; name: string }; onClose: () => void }) {
  const [copies, setCopies] = useState("1");
  const [note, setNote] = useState("");
  const { data: requests = [] } = usePrintRequests();
  const add = useAddPrintRequest();
  const toast = useToast();
  const queued = requests.some((r) => r.doc_file_id === file.id && r.status === "pending");
  const n = Number(copies);
  const valid = Number.isInteger(n) && n >= 1 && n <= 999;

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="ส่งเข้ารายการพิมพ์"
      description={file.name}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            className="flex-1"
            disabled={queued || !valid || add.isPending}
            onClick={() =>
              add.mutate(
                { doc_file_id: file.id, copies: n, note: note.trim() || null },
                {
                  onSuccess: () => {
                    toast("ส่งเข้ารายการพิมพ์แล้ว");
                    onClose();
                  },
                  onError: () => toast("ส่งเข้ารายการพิมพ์ไม่สำเร็จ", "error"),
                },
              )
            }
          >
            {add.isPending ? <Spinner className="h-3 w-3" /> : queued ? "อยู่ในคิวพิมพ์แล้ว" : "ส่งเข้าคิว"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="จำนวนชุด">
          <Input type="number" min={1} max={999} value={copies} onChange={(e) => setCopies(e.target.value)} />
        </Field>
        <Field label="หมายเหตุ">
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="เช่น พิมพ์สองหน้า" />
        </Field>
      </div>
    </Modal>
  );
}

function UploadDialog({
  lesson,
  profileId,
  subjectId,
  gradeLevelId,
  onClose,
  onDone,
}: {
  lesson: OverviewLesson;
  profileId: string;
  subjectId: string;
  gradeLevelId: string;
  onClose: () => void;
  onDone: () => unknown;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const upload = useUploadDocFile();
  const link = useLinkPlanLessonFile();
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setProgress(0);
    try {
      // The file hangs under the เอกสาร lesson with the same name, created on first use; then it is linked to the plan lesson.
      const lessonId = await findOrCreateDocLesson(subjectId, gradeLevelId, lesson.name);
      const docFileId = await upload.mutateAsync({
        file,
        lessonId,
        title: title.trim(),
        description: null,
        uploadedBy: profileId,
        onProgress: setProgress,
      });
      await link.mutateAsync({ lesson_id: lesson.id, doc_file_id: docFileId });
      await onDone();
      toast("อัปโหลดและเชื่อมเอกสารแล้ว");
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ", "error");
      setProgress(null);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && progress === null && onClose()}
      title="อัปโหลดเอกสาร"
      description={`เชื่อมกับบทเรียน "${lesson.name}"`}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={progress !== null} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" form="dept-doc-upload" className="flex-1" disabled={!file || !title.trim() || progress !== null}>
            {progress !== null ? <Spinner className="h-3 w-3" /> : "อัปโหลด"}
          </Button>
        </div>
      }
    >
      <form id="dept-doc-upload" className="space-y-4" onSubmit={submit}>
        <Field label="ไฟล์">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-input px-3 py-6 text-center transition-colors hover:bg-muted/50 focus-within:border-ring">
            <UploadOutlineIcon className="h-6 w-6 text-muted-foreground" />
            <span className="max-w-full truncate text-sm font-medium">{file ? file.name : "เลือกไฟล์"}</span>
            <span className="text-xs text-muted-foreground">PDF, Word, PowerPoint, Excel หรือรูปภาพ ไม่เกิน 30 MB</span>
            <input
              type="file"
              accept={DOC_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </label>
        </Field>
        <Field label="ชื่อเอกสาร">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </Field>
        {progress !== null && <p className="text-xs text-muted-foreground">กำลังอัปโหลด {progress}%</p>}
      </form>
    </Modal>
  );
}

type SubjectGroup = { name: string; code: string; areaId: string | null; ids: Set<string>; grades: Set<string> };
type ShownFilter = "all" | "on" | "off";

/** Choose which subjects the overview shows (ticked = shown); same drawer shape as ติดแท็กรายวิชา in CurriculumMap. */
function VisibleSubjectsSheet({
  open,
  onClose,
  profileId,
  roomName,
  classroomId,
  groups,
  hiddenIds,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string;
  roomName: string;
  classroomId: string;
  groups: SubjectGroup[];
  hiddenIds: string[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ShownFilter>("all");
  const [shownNames, setShownNames] = useState<Set<string>>(new Set());
  const save = useSetHiddenOverviewSubjects(profileId);
  const toast = useToast();
  const colors = useSubjectColors([]); // hue from กลุ่มสาระ only
  // A name counts as hidden when any of its subject rows is hidden.
  const isShown = (g: SubjectGroup) => ![...g.ids].some((id) => hiddenIds.includes(hiddenSubjectKey(classroomId, id)));

  // Start from the saved state each time the drawer opens.
  useEffect(() => {
    if (open) setShownNames(new Set(groups.filter(isShown).map((g) => g.name)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed on open only, not on every refetch
  }, [open]);

  const q = search.trim().toLowerCase();
  const shown = groups
    .filter((g) => !q || g.name.toLowerCase().includes(q))
    .filter((g) => filter === "all" || (filter === "on") === shownNames.has(g.name));
  const chips: [ShownFilter, string, number][] = [
    ["all", "ทั้งหมด", groups.length],
    ["on", "แสดงอยู่", groups.filter((g) => shownNames.has(g.name)).length],
    ["off", "ซ่อนอยู่", groups.filter((g) => !shownNames.has(g.name)).length],
  ];
  const changed = groups.some((g) => shownNames.has(g.name) !== isShown(g));

  function toggle(name: string) {
    setShownNames((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }

  function apply() {
    const hide = new Set<string>();
    const show = new Set<string>();
    for (const g of groups) {
      if (shownNames.has(g.name) === isShown(g)) continue;
      g.ids.forEach((id) => (shownNames.has(g.name) ? show : hide).add(id));
    }
    save.mutate(
      { classroomId, hide: [...hide], show: [...show] },
      { onSuccess: onClose, onError: () => toast("บันทึกไม่สำเร็จ", "error") },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSearch("");
          setFilter("all");
          onClose();
        }
      }}
      title="วิชาที่จะแสดง"
      description={`วิชาของ ${roomName} ในเทอมล่าสุด · การซ่อนมีผลเฉพาะห้องนี้ (เฉพาะคุณ)`}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            แสดง {shownNames.size} จาก {groups.length} วิชา
          </p>
          {shownNames.size < groups.length && (
            <button
              type="button"
              onClick={() => setShownNames(new Set(groups.map((g) => g.name)))}
              className="text-xs text-accent hover:underline"
            >
              แสดงทั้งหมด
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button onClick={apply} disabled={!changed || save.isPending}>
              {save.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อวิชา..."
            aria-label="ค้นหารายวิชา"
          />
        </div>
        <div className="scrollbar-hidden -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
          {chips.map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors",
                filter === key
                  ? "border-accent bg-accent/10 font-medium text-accent"
                  : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {label} ({n})
            </button>
          ))}
        </div>
        <ul className="space-y-2">
          {shown.map((g) => {
            const checked = shownNames.has(g.name);
            const grades = [...g.grades].sort();
            return (
              <li key={g.name}>
                <button
                  type="button"
                  onClick={() => toggle(g.name)}
                  aria-pressed={checked}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    checked ? "border-accent/50 bg-accent/5" : "border-border hover:bg-muted/50",
                  )}
                >
                  {checked ? (
                    <CheckboxIcon className="h-5 w-5 shrink-0 text-accent" />
                  ) : (
                    <SquareIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", colors.shade(g.areaId))}>
                    <BookIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1 font-sarabun leading-tight">
                    <p className="truncate text-xs text-muted-foreground">{g.code}</p>
                    <p className="truncate text-sm font-medium text-foreground">{g.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{grades.map(gradeShortLabel).join(" · ")}</p>
                  </div>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">ไม่พบรายวิชาที่ตรงเงื่อนไข</li>
          )}
        </ul>
      </div>
    </Sheet>
  );
}

/** Quick access to the full workspace at /time-tracking (history, ขอออกนอกโรงเรียน, approvals). */
function QuickClockSection({ profileId, departmentId }: { profileId: string; departmentId: string | null }) {
  const toast = useToast();
  const date = todayIso();
  const { data: record, isLoading, isError, refetch } = useMyTimeClock(profileId, date);
  const clockIn = useClockIn();
  const clockOut = useClockOut();

  function onClockIn() {
    clockIn.mutate(
      { profileId, departmentId, date },
      {
        onSuccess: () => toast("บันทึกเวลาเข้างานสำเร็จ"),
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  function onClockOut() {
    clockOut.mutate(
      { profileId, departmentId, date },
      {
        onSuccess: () => toast("บันทึกเวลาออกงานสำเร็จ"),
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <section>
      <h2 className={SECTION_TITLE}>เวลาทำงานวันนี้</h2>
      {isLoading ? (
        <div role="status" aria-label="กำลังโหลดเวลาทำงาน">
          <Skeleton className="mt-1 h-4 w-56" />
        </div>
      ) : isError && record === undefined ? (
        <LoadError onRetry={() => void refetch()} />
      ) : (
        <p className="mt-1 text-sm">
          {record?.clock_in_time ? (
            <>
              เข้างานเวลา <strong className="font-semibold">{bangkokTime(record.clock_in_time)}</strong>
              {record.clock_out_time && (
                <>
                  {" "}
                  ออกงานเวลา <strong className="font-semibold">{bangkokTime(record.clock_out_time)}</strong>
                </>
              )}
            </>
          ) : (
            "ยังไม่ได้บันทึกเวลาเข้างาน"
          )}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          disabled={isLoading || (isError && record === undefined) || !!record?.clock_in_time || clockIn.isPending}
          onClick={onClockIn}
        >
          {clockIn.isPending ? <Spinner className="h-3.5 w-3.5" /> : "เข้างาน"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isLoading || !record?.clock_in_time || !!record?.clock_out_time || clockOut.isPending}
          onClick={onClockOut}
        >
          {clockOut.isPending ? <Spinner className="h-3.5 w-3.5" /> : "ออกงาน"}
        </Button>
        <div className="ml-auto">
          <SeeAll to="/time-tracking" />
        </div>
      </div>
    </section>
  );
}

/** role="student"/"parent" only — full to-do list + submit flow lives at /assignments. */
export function AssignmentSummarySection({ student }: { student: Student }) {
  const itemsQuery = useMyAssignments(student.id);
  const scoresQuery = useMyItemScores(student.id);
  const submissionsQuery = useMySubmissions(student.id);
  const items = itemsQuery.data ?? [];
  const scores = scoresQuery.data;
  const submissions = submissionsQuery.data;
  const isLoading = itemsQuery.isLoading;
  // Missing scores/submissions would make every item read as "ยังไม่ส่ง", so any of the three failing is a failure.
  const failed =
    (itemsQuery.isError && !itemsQuery.data) ||
    (scoresQuery.isError && !scoresQuery.data) ||
    (submissionsQuery.isError && !submissionsQuery.data);
  const retry = () => {
    void itemsQuery.refetch();
    void scoresQuery.refetch();
    void submissionsQuery.refetch();
  };

  const counts = { missing: 0, submitted: 0, late: 0, graded: 0 };
  for (const item of items) {
    counts[assignmentStatus(item, submissions?.get(item.id) ?? null, scores?.has(item.id) ?? false)]++;
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className={SECTION_TITLE}>
          งานของ {student.first_name} {student.last_name}
        </h2>
        <SeeAll to="/assignments" />
      </div>
      {isLoading ? (
        <div role="status" aria-label="กำลังโหลดงาน">
          <Skeleton className="mt-1 h-4 w-48" />
        </div>
      ) : failed ? (
        <LoadError onRetry={retry} />
      ) : items.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">ยังไม่มีงาน</p>
      ) : (
        <p className="mt-1 text-sm">
          <strong className="font-semibold">{counts.missing + counts.late}</strong> ยังไม่ส่ง ·{" "}
          <strong className="font-semibold">{counts.submitted}</strong> ส่งแล้ว ·{" "}
          <strong className="font-semibold">{counts.graded}</strong> ตรวจแล้ว
        </p>
      )}
    </section>
  );
}

/** role="student"/"parent" only — teacher/admin get the full check-in workspace at /attendance instead. */
export function AttendanceSummarySection({ student }: { student: Student }) {
  const { start, end } = currentMonthRange();
  const { data, isLoading, isError, refetch } = useAttendanceRange({
    studentId: student.id,
    startDate: start,
    endDate: end,
  });
  const counts = summarizeAttendance(data ?? []);

  return (
    <section>
      <h2 className={SECTION_TITLE}>
        การมาเรียนของ {student.first_name} {student.last_name} · {monthLabel()}
      </h2>
      {isLoading ? (
        <div role="status" aria-label="กำลังโหลดการมาเรียน">
          <Skeleton className="mt-1 h-4 w-40" />
        </div>
      ) : isError && !data ? (
        <LoadError onRetry={() => void refetch()} />
      ) : (
        <p className="mt-1 text-sm">
          {STATUS_ORDER.map((st, i) => (
            <span key={st}>
              {i > 0 && " · "}
              <strong className="font-semibold">{counts[st]}</strong> {STATUS_LABEL[st]}
            </span>
          ))}{" "}
          วัน
        </p>
      )}
    </section>
  );
}

/** role="student"/"parent" only — teacher/admin get the roster workspace at /behavior instead. */
export function BehaviorScoreSection({ student }: { student: Student }) {
  const { start, end } = currentAcademicYearRange();
  const { data, isLoading, isError, refetch } = useBehaviorRecords({
    studentId: student.id,
    startDate: start,
    endDate: end,
  });
  const score = summarizeBehaviorScore(data ?? []);

  return (
    <section>
      <h2 className={SECTION_TITLE}>
        คะแนนพฤติกรรมของ {student.first_name} {student.last_name}
      </h2>
      {isLoading ? (
        <div role="status" aria-label="กำลังโหลดคะแนนพฤติกรรม">
          <Skeleton className="mt-1 h-4 w-32" />
        </div>
      ) : isError && !data ? (
        <LoadError onRetry={() => void refetch()} />
      ) : (
        <p className={cn("mt-1 text-sm", score < STARTING_SCORE ? "text-destructive" : "text-success")}>
          <strong className="text-lg font-semibold">{score}</strong> จาก {STARTING_SCORE} คะแนน
        </p>
      )}
    </section>
  );
}

/** role="student"/"parent" only — teacher/admin approve these at Attendance.tsx's "คำขอลา" view instead. */
export function StudentLeaveSection({ student, submittedBy }: { student: Student; submittedBy: string }) {
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useStudentLeaveRequests(student.id);
  const requests = data ?? [];
  const request = useRequestStudentLeave();
  const cancel = useCancelStudentLeaveRequest();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  function reset() {
    setStartDate("");
    setEndDate("");
    setReason("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate || !reason.trim()) return;
    request.mutate(
      { studentId: student.id, submittedBy, startDate, endDate, reason: reason.trim() },
      {
        onSuccess: () => {
          toast("ส่งคำขอลาสำเร็จ");
          reset();
          setOpen(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className={SECTION_TITLE}>
          การลาของ {student.first_name} {student.last_name}
        </h2>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          ขอลา
        </Button>
      </div>

      {isLoading && (
        <ul className="divide-y divide-border" role="status" aria-label="กำลังโหลดการลา">
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </li>
          ))}
        </ul>
      )}
      {isError && !data && <LoadError onRetry={() => void refetch()} />}
      {!isLoading && !isError && requests.length === 0 && (
        <p className="text-sm text-muted-foreground">ยังไม่มีคำขอลา</p>
      )}
      {requests.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {requests.slice(0, 5).map((r) => {
            const cancellable = r.status === "pending";
            return (
              <li key={r.id} className="space-y-1 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {leaveDate(r.start_date)} – {leaveDate(r.end_date)} ({r.days} วัน)
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", LEAVE_STATUS_STYLE[r.status])}>
                    {LEAVE_STATUS_LABEL[r.status]}
                  </span>
                </div>
                {cancellable && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!confirm("ยกเลิกคำขอลานี้?")) return;
                      cancel.mutate(r.id, {
                        onSuccess: () => toast("ยกเลิกคำขอลาแล้ว"),
                        onError: (err) => toast(err instanceof Error ? err.message : "ยกเลิกไม่สำเร็จ", "error"),
                      });
                    }}
                    disabled={cancel.isPending}
                  >
                    ยกเลิกคำขอ
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
        title={`ขอลา — ${student.first_name} ${student.last_name}`}
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              type="submit"
              form={`request-student-leave-${student.id}`}
              className="flex-1"
              disabled={!startDate || !endDate || !reason.trim() || request.isPending}
            >
              {request.isPending ? <Spinner className="h-3 w-3" /> : "ส่งคำขอ"}
            </Button>
          </div>
        }
      >
        <form id={`request-student-leave-${student.id}`} className="space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="วันเริ่ม">
              <Input
                type="date"
                value={startDate}
                min={todayIso()}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </Field>
            <Field label="วันสิ้นสุด">
              <Input
                type="date"
                value={endDate}
                min={startDate || todayIso()}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="เหตุผล">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="เช่น ลาป่วย มีไข้"
            />
          </Field>
        </form>
      </Sheet>
    </section>
  );
}
