import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus, Search } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useDepartments, useProfiles } from "@/hooks/useProfiles";
import {
  useAssignClassroom,
  useBulkSetStudentStatus,
  useClassrooms,
  useCreateClassroom,
  useCurrentClassroomEnrollments,
  useHomeroomTeachers,
  usePromoteStudents,
  useRemoveHomeroomTeacher,
  useSetClassroomActive,
  useSetHomeroomTeacher,
} from "@/hooks/useStatusManagement";
import { useStudents } from "@/hooks/useStudents";
import {
  useCreateTransferIntake,
  useTransferIntakes,
  useTransferProgress,
} from "@/hooks/useTransferIntakes";
import { profileFullName, type StudentStatus } from "@/lib/database.types";
import { isOrgWide } from "@/lib/roles";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<StudentStatus, string> = {
  studying: "กำลังศึกษา",
  transferred: "ย้ายออก",
  graduated: "จบการศึกษา",
  dropped: "พ้นสภาพ",
};

type SubTab = "promote" | "classroom" | "status" | "transfer";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "promote", label: "เลื่อนชั้นประจำปี" },
  { key: "classroom", label: "จัดห้องเรียน" },
  { key: "status", label: "เปลี่ยนสถานะ" },
  { key: "transfer", label: "รับย้ายเข้า" },
];

export function StatusManagement() {
  const { profile: me } = useAuth();
  const { data: departments = [] } = useDepartments();
  const orgWide = me ? isOrgWide(me.roles) : false;

  const [pickedDept, setPickedDept] = useState("");
  const [subTab, setSubTab] = useState<SubTab | "">("");

  if (!me || !orgWide) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }

  return (
    <div className="space-y-4">
      {departments.length > 0 && (
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
      )}

      <Select
        className="w-auto min-w-[12rem]"
        value={subTab}
        onChange={(e) => setSubTab(e.target.value as SubTab)}
        aria-label="เมนูจัดการสถานภาพ"
        placeholder="เลือกเมนู"
      >
        {SUB_TABS.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </Select>

      {pickedDept && subTab === "promote" && <PromotionPanel departmentId={pickedDept} />}
      {pickedDept && subTab === "classroom" && <ClassroomPanel departmentId={pickedDept} />}
      {pickedDept && subTab === "status" && <BulkStatusPanel departmentId={pickedDept} />}
      {pickedDept && subTab === "transfer" && <TransferIntakePanel departmentId={pickedDept} />}
    </div>
  );
}

// ------------------------------------------------------------- promotion

function PromotionPanel({ departmentId }: { departmentId: string }) {
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const { data: students = [] } = useStudents({ search: "", departmentId, status: "studying" });
  const promote = usePromoteStudents();

  const [sourceId, setSourceId] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    setSourceId("");
    setExcluded(new Set());
    setPreviewing(false);
  }, [departmentId]);

  const source = gradeLevels.find((g) => g.id === sourceId);
  const target = source ? gradeLevels.find((g) => g.sort_order === source.sort_order + 1) : undefined;
  const isTop = !!source && !target;

  const inGrade = useMemo(() => students.filter((s) => s.grade_level_id === sourceId), [students, sourceId]);
  const promoting = inGrade.filter((s) => !excluded.has(s.id));

  function pickSource(id: string) {
    setSourceId(id);
    setExcluded(new Set());
    setPreviewing(false);
  }

  function toggleExclude(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    promote.mutate(
      { studentIds: promoting.map((s) => s.id), targetGradeLevelId: target?.id ?? null },
      {
        onSuccess: () => {
          setPreviewing(false);
          setSourceId("");
          setExcluded(new Set());
        },
      },
    );
  }

  return (
    <Card className="space-y-4">
      <Field label="ชั้นต้นทาง">
        <Select value={sourceId} onChange={(e) => pickSource(e.target.value)}>
          <option value="">— เลือกชั้น —</option>
          {gradeLevels.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>

      {source && !previewing && (
        <>
          <p className="text-sm text-muted-foreground">
            {isTop
              ? `นักเรียนที่ติ๊กไว้จะจบการศึกษา (${source.name})`
              : `นักเรียนที่ติ๊กไว้จะเลื่อนจาก ${source.name} ไป ${target!.name}`}
          </p>
          {inGrade.length === 0 && (
            <p className="text-sm text-muted-foreground">ไม่มีนักเรียนกำลังศึกษาชั้นนี้</p>
          )}
          {inGrade.length > 0 && (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
              {inGrade.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={!excluded.has(s.id)}
                    onChange={() => toggleExclude(s.id)}
                  />
                  <span className="flex-1">
                    {s.first_name} {s.last_name}{" "}
                    <span className="text-xs text-muted-foreground">({s.student_code})</span>
                  </span>
                  {excluded.has(s.id) && (
                    <span className="text-xs text-warning">ซ้ำชั้น — ไม่เลื่อน</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Button disabled={promoting.length === 0} onClick={() => setPreviewing(true)}>
            ตรวจสอบก่อนเลื่อน ({promoting.length} คน)
          </Button>
        </>
      )}

      {source && previewing && (
        <>
          <p className="text-sm font-medium">
            ยืนยันเลื่อน {promoting.length} คน{" "}
            {isTop ? "→ จบการศึกษา" : `จาก ${source.name} → ${target!.name}`}
          </p>
          <ul className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
            {promoting.map((s) => (
              <li key={s.id} className="py-1.5">
                {s.first_name} {s.last_name}{" "}
                <span className="text-xs text-muted-foreground">({s.student_code})</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPreviewing(false)}>
              ย้อนกลับ
            </Button>
            <Button className="flex-1" onClick={confirm} disabled={promote.isPending}>
              {promote.isPending ? <Spinner className="h-3 w-3" /> : "ยืนยันเลื่อนชั้น"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------- classroom

function ClassroomPanel({ departmentId }: { departmentId: string }) {
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const { data: activeYear } = useActiveAcademicYear(departmentId);
  const { data: students = [] } = useStudents({ search: "", departmentId, status: "studying" });
  const createRoom = useCreateClassroom();
  const setActive = useSetClassroomActive();
  const assign = useAssignClassroom();

  const [gradeLevelId, setGradeLevelId] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetRoomId, setTargetRoomId] = useState("");

  useEffect(() => setGradeLevelId(""), [departmentId]);
  useEffect(() => {
    setSelected(new Set());
    setTargetRoomId("");
    setNewRoomName("");
  }, [gradeLevelId]);

  const academicYear = activeYear ?? new Date().getFullYear() + 543;
  const { data: classrooms = [] } = useClassrooms(gradeLevelId || null);
  const { data: enrollments = [] } = useCurrentClassroomEnrollments(gradeLevelId || null, academicYear);

  const gradeLevel = gradeLevels.find((g) => g.id === gradeLevelId);
  const inGrade = useMemo(
    () => students.filter((s) => s.grade_level_id === gradeLevelId),
    [students, gradeLevelId],
  );
  const roomByStudent = useMemo(
    () => new Map(enrollments.map((e) => [e.student_id, e.classroom_id])),
    [enrollments],
  );
  const roomName = useMemo(() => new Map(classrooms.map((c) => [c.id, c.name])), [classrooms]);
  const activeRooms = classrooms.filter((c) => c.is_active);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitNewRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoomName.trim() || !gradeLevelId) return;
    createRoom.mutate(
      { grade_level_id: gradeLevelId, name: newRoomName.trim() },
      { onSuccess: () => setNewRoomName("") },
    );
  }

  function submitAssign() {
    if (selected.size === 0 || !targetRoomId) return;
    assign.mutate(
      [...selected].map((student_id) => ({
        student_id,
        classroom_id: targetRoomId,
        academic_year: academicYear,
      })),
      { onSuccess: () => setSelected(new Set()) },
    );
  }

  return (
    <div className="space-y-4">
      <Field label="ชั้น">
        <Select value={gradeLevelId} onChange={(e) => setGradeLevelId(e.target.value)}>
          <option value="">— เลือกชั้น —</option>
          {gradeLevels.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>

      {gradeLevelId && (
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold">ห้องเรียนของ{gradeLevel?.name}</h3>
            <ul className="divide-y divide-border text-sm">
              {classrooms.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className={c.is_active ? "" : "text-muted-foreground line-through"}>
                    {gradeLevel?.name}/{c.name}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActive.mutate({ id: c.id, is_active: !c.is_active })}
                  >
                    {c.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </Button>
                </li>
              ))}
              {classrooms.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">ยังไม่มีห้อง</p>
              )}
            </ul>
            <form onSubmit={submitNewRoom} className="flex gap-2">
              <Input
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="เลขห้อง เช่น 1"
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={createRoom.isPending} aria-label="เพิ่มห้อง">
                <Plus className="h-3 w-3" />
              </Button>
            </form>
          </Card>

          <Card className="space-y-3">
            <h3 className="text-sm font-semibold">จัดนักเรียนเข้าห้อง (ปีการศึกษา {academicYear})</h3>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto text-xs">
              {inGrade.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-1.5">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  <span className="flex-1">
                    {s.first_name} {s.last_name}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {roomByStudent.has(s.id)
                      ? `${gradeLevel?.name}/${roomName.get(roomByStudent.get(s.id)!) ?? "—"}`
                      : "ยังไม่จัดห้อง"}
                  </span>
                </li>
              ))}
              {inGrade.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">ไม่มีนักเรียนกำลังศึกษาชั้นนี้</p>
              )}
            </ul>
            <div className="flex gap-2">
              <Select value={targetRoomId} onChange={(e) => setTargetRoomId(e.target.value)} className="flex-1">
                <option value="">— เลือกห้องปลายทาง —</option>
                {activeRooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {gradeLevel?.name}/{c.name}
                  </option>
                ))}
              </Select>
              <Button onClick={submitAssign} disabled={selected.size === 0 || !targetRoomId || assign.isPending}>
                {assign.isPending ? <Spinner className="h-3 w-3" /> : `ย้าย ${selected.size} คน`}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {gradeLevelId && (
        <HomeroomCard
          departmentId={departmentId}
          gradeLevelName={gradeLevel?.name ?? ""}
          activeRooms={activeRooms}
          academicYear={academicYear}
        />
      )}
    </div>
  );
}

function HomeroomCard({
  departmentId,
  gradeLevelName,
  activeRooms,
  academicYear,
}: {
  departmentId: string;
  gradeLevelName: string;
  activeRooms: { id: string; name: string }[];
  academicYear: number;
}) {
  const [roomId, setRoomId] = useState("");
  const [addingTeacherId, setAddingTeacherId] = useState("");

  useEffect(() => {
    setRoomId("");
    setAddingTeacherId("");
  }, [activeRooms]);

  // Default filter to the room's own department — DB doesn't enforce it (grill
  // decision), but same-department is the normal case and a much shorter list.
  const { data: teachers = [] } = useProfiles({ search: "", departmentId, role: "teacher", active: "true" });
  const { data: homerooms = [] } = useHomeroomTeachers(roomId || null, academicYear);
  const setTeacher = useSetHomeroomTeacher();
  const removeTeacher = useRemoveHomeroomTeacher();

  const teacherName = useMemo(() => new Map(teachers.map((t) => [t.id, profileFullName(t)])), [teachers]);
  const assignedIds = useMemo(() => new Set(homerooms.map((h) => h.teacher_id)), [homerooms]);
  const pickable = teachers.filter((t) => !assignedIds.has(t.id));
  const room = activeRooms.find((c) => c.id === roomId);

  function addTeacher() {
    if (!roomId || !addingTeacherId) return;
    setTeacher.mutate(
      { classroom_id: roomId, teacher_id: addingTeacherId, academic_year: academicYear },
      { onSuccess: () => setAddingTeacherId("") },
    );
  }

  return (
    <Card className="space-y-3">
      <h3 className="text-sm font-semibold">ครูประจำชั้น (ปีการศึกษา {academicYear})</h3>
      <Field label="ห้อง">
        <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">— เลือกห้อง —</option>
          {activeRooms.map((c) => (
            <option key={c.id} value={c.id}>
              {gradeLevelName}/{c.name}
            </option>
          ))}
        </Select>
      </Field>

      {room && (
        <>
          <ul className="divide-y divide-border text-sm">
            {homerooms.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>{teacherName.get(h.teacher_id) ?? "—"}</span>
                <Button variant="outline" size="sm" onClick={() => removeTeacher.mutate(h.id)}>
                  ลบ
                </Button>
              </li>
            ))}
            {homerooms.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">ยังไม่มีครูประจำชั้น</p>
            )}
          </ul>
          <div className="flex gap-2">
            <Select value={addingTeacherId} onChange={(e) => setAddingTeacherId(e.target.value)} className="flex-1">
              <option value="">— เลือกครู —</option>
              {pickable.map((t) => (
                <option key={t.id} value={t.id}>
                  {profileFullName(t)}
                </option>
              ))}
            </Select>
            <Button onClick={addTeacher} disabled={!addingTeacherId || setTeacher.isPending}>
              {setTeacher.isPending ? <Spinner className="h-3 w-3" /> : "เพิ่ม"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------- bulk status

function BulkStatusPanel({ departmentId }: { departmentId: string }) {
  const [search, setSearch] = useState("");
  const { data: students = [] } = useStudents({ search, departmentId, status: "" });
  const bulkSet = useBulkSetStudentStatus();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetStatus, setTargetStatus] = useState<StudentStatus>("transferred");

  useEffect(() => setSelected(new Set()), [departmentId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (selected.size === 0) return;
    if (!confirm(`เปลี่ยนสถานะ ${selected.size} คน เป็น "${STATUS_LABEL[targetStatus]}"?`)) return;
    bulkSet.mutate(
      { studentIds: [...selected], status: targetStatus },
      { onSuccess: () => setSelected(new Set()) },
    );
  }

  return (
    <Card className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อหรือรหัสนักเรียน"
          className="pl-9"
          type="search"
        />
      </div>

      <ul className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
        {students.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-1.5">
            <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
            <span className="flex-1">
              {s.first_name} {s.last_name}{" "}
              <span className="text-xs text-muted-foreground">({s.student_code})</span>
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {STATUS_LABEL[s.status]}
            </span>
          </li>
        ))}
        {students.length === 0 && <p className="py-2 text-sm text-muted-foreground">ไม่มีนักเรียน</p>}
      </ul>

      <div className="flex gap-2">
        <Select
          value={targetStatus}
          onChange={(e) => setTargetStatus(e.target.value as StudentStatus)}
          className="flex-1"
        >
          {(Object.keys(STATUS_LABEL) as StudentStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Button onClick={submit} disabled={selected.size === 0 || bulkSet.isPending}>
          {bulkSet.isPending ? <Spinner className="h-3 w-3" /> : `เปลี่ยนสถานะ ${selected.size} คน`}
        </Button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------- transfer-in
// Case tracker only, not a workflow engine (grill decision, 2026-08-09) —
// classroom assignment and cohort enrollment stay on their own tabs/pages
// (ClassroomPanel above, Enrollment.tsx), each already reusable for a
// single ad-hoc student. This panel just remembers source_school and
// shows whether those two steps are done, derived live rather than stored.

function TransferIntakePanel({ departmentId }: { departmentId: string }) {
  const [creating, setCreating] = useState(false);
  const { data: intakes = [] } = useTransferIntakes();
  const { data: students = [] } = useStudents({ search: "", departmentId, status: "" });

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const deptIntakes = useMemo(
    () => intakes.filter((i) => studentById.has(i.student_id)),
    [intakes, studentById],
  );
  const studentIds = useMemo(() => deptIntakes.map((i) => i.student_id), [deptIntakes]);
  const { data: progress } = useTransferProgress(studentIds);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">เคสรับย้ายเข้า</h3>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          เพิ่มเคสใหม่
        </Button>
      </div>

      <Card className="divide-y divide-border p-0">
        {deptIntakes.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">ยังไม่มีเคสรับย้ายเข้าในแผนกนี้</p>
        )}
        {deptIntakes.map((intake) => {
          const student = studentById.get(intake.student_id);
          const hasClassroom = progress?.hasClassroom.has(intake.student_id) ?? false;
          const hasCohort = progress?.hasCohort.has(intake.student_id) ?? false;
          return (
            <div key={intake.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div>
                  {student ? `${student.first_name} ${student.last_name}` : "—"}{" "}
                  <span className="text-xs text-muted-foreground">({student?.student_code ?? "—"})</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  จาก {intake.source_school} · รับเข้า {intake.intake_date}
                </div>
              </div>
              <TransferStatusBadge done={hasClassroom} doneLabel="จัดห้องแล้ว" pendingLabel="ยังไม่จัดห้อง" />
              <TransferStatusBadge done={hasCohort} doneLabel="ลงทะเบียนแล้ว" pendingLabel="ยังไม่ลงทะเบียน" />
            </div>
          );
        })}
      </Card>

      <p className="text-xs text-muted-foreground">
        จัดห้อง: ไปแท็บ "จัดห้องเรียน" ด้านบน · ลงทะเบียนเข้าหลักสูตร: ไปหน้า "ลงทะเบียน"
      </p>

      <NewIntakeSheet open={creating} onClose={() => setCreating(false)} departmentId={departmentId} />
    </div>
  );
}

function TransferStatusBadge({
  done,
  doneLabel,
  pendingLabel,
}: {
  done: boolean;
  doneLabel: string;
  pendingLabel: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs",
        done ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {done ? doneLabel : pendingLabel}
    </span>
  );
}

function NewIntakeSheet({
  open,
  onClose,
  departmentId,
}: {
  open: boolean;
  onClose: () => void;
  departmentId: string;
}) {
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [sourceSchool, setSourceSchool] = useState("");
  const [intakeDate, setIntakeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const { data: students = [] } = useStudents({ search, departmentId, status: "" });
  const { data: existing = [] } = useTransferIntakes();
  const create = useCreateTransferIntake();

  const alreadyCase = useMemo(() => new Set(existing.map((i) => i.student_id)), [existing]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setStudentId("");
      setSourceSchool("");
      setIntakeDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId || !sourceSchool.trim()) return;
    create.mutate(
      { student_id: studentId, source_school: sourceSchool.trim(), intake_date: intakeDate },
      { onSuccess: onClose },
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="เพิ่มเคสรับย้ายเข้า">
      <form onSubmit={submit} className="space-y-4">
        <Field label="นักเรียน (สร้าง profile ที่หน้ารายชื่อนักเรียนก่อน)">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อหรือรหัสนักเรียน"
              className="pl-9"
              type="search"
            />
          </div>
          <div className="mt-2 max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {students.map((s) => (
              <label
                key={s.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted",
                  alreadyCase.has(s.id) && "opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="transfer-student"
                  checked={studentId === s.id}
                  disabled={alreadyCase.has(s.id)}
                  onChange={() => setStudentId(s.id)}
                />
                <span className="flex-1">
                  {s.first_name} {s.last_name}{" "}
                  <span className="text-muted-foreground">({s.student_code})</span>
                </span>
                {alreadyCase.has(s.id) && <span className="text-muted-foreground">มีเคสแล้ว</span>}
              </label>
            ))}
            {students.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">ไม่พบนักเรียน</p>
            )}
          </div>
        </Field>

        <Field label="โรงเรียนเดิม">
          <Input value={sourceSchool} onChange={(e) => setSourceSchool(e.target.value)} required />
        </Field>

        <Field label="วันที่รับเอกสาร">
          <Input type="date" value={intakeDate} onChange={(e) => setIntakeDate(e.target.value)} required />
        </Field>

        <Button
          type="submit"
          className="w-full"
          disabled={!studentId || !sourceSchool.trim() || create.isPending}
        >
          {create.isPending ? <Spinner className="h-3 w-3" /> : "บันทึกเคส"}
        </Button>
      </form>
    </Sheet>
  );
}
