import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Plus, Search } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Button, Card, EmptyState, Field, Input, Pagination, Select, Spinner, Switch } from "@/components/ui";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import {
  useDepartmentStudentEnrollments,
  useGradeLevels,
  useStudyPlans,
} from "@/hooks/useCurriculumStructure";
import { useFillPageSize } from "@/hooks/useFillPageSize";
import { usePagination } from "@/hooks/usePagination";
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
  const [pickedGrade, setPickedGrade] = useState("");
  const { data: gradeLevels = [] } = useGradeLevels(pickedDept || null);

  useEffect(() => setPickedGrade(""), [pickedDept, subTab]);

  if (!me || !orgWide) {
    return <Card className="text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงเมนูนี้</Card>;
  }

  return (
    <div className="page-fill">
      <div className="grid shrink-0 grid-cols-3 gap-2">
        {departments.length > 0 && (
          <Select
            className="min-w-0"
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
          className="min-w-0"
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

        {subTab ? (
          <Select
            className="min-w-0"
            value={pickedGrade}
            onChange={(e) => setPickedGrade(e.target.value)}
            aria-label="ชั้น"
            placeholder="เลือกชั้น"
            disabled={!pickedDept || gradeLevels.length === 0}
          >
            {gradeLevels.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        ) : (
          <div className="min-w-0" aria-hidden />
        )}
      </div>

      {!pickedDept && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนก" description="เลือกแผนกด้านบนเพื่อจัดการสถานภาพ" />
        </div>
      )}
      {pickedDept && !subTab && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกเมนู" description="เลือกเมนูด้านบนเพื่อดำเนินการต่อ" />
        </div>
      )}

      {pickedDept && subTab === "promote" && pickedGrade && (
        <PromotionPanel
          departmentId={pickedDept}
          sourceGradeLevelId={pickedGrade}
          onPromoted={() => setPickedGrade("")}
        />
      )}
      {pickedDept && subTab === "classroom" && pickedGrade && (
        <ClassroomPanel departmentId={pickedDept} gradeLevelId={pickedGrade} />
      )}
      {pickedDept && subTab === "status" && pickedGrade && (
        <BulkStatusPanel departmentId={pickedDept} gradeLevelId={pickedGrade} />
      )}
      {pickedDept && subTab === "transfer" && (
        <TransferIntakePanel departmentId={pickedDept} gradeLevelId={pickedGrade} />
      )}
    </div>
  );
}

// ------------------------------------------------------------- promotion

function PromotionPanel({
  departmentId,
  sourceGradeLevelId,
  onPromoted,
}: {
  departmentId: string;
  sourceGradeLevelId: string;
  onPromoted: () => void;
}) {
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const { data: students = [] } = useStudents({ search: "", departmentId, status: "studying" });
  const promote = usePromoteStudents();

  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    setExcluded(new Set());
    setPreviewing(false);
  }, [departmentId, sourceGradeLevelId]);

  const source = gradeLevels.find((g) => g.id === sourceGradeLevelId);
  const target = source ? gradeLevels.find((g) => g.sort_order === source.sort_order + 1) : undefined;
  const isTop = !!source && !target;

  const inGrade = useMemo(
    () => students.filter((s) => s.grade_level_id === sourceGradeLevelId),
    [students, sourceGradeLevelId],
  );
  const promoting = inGrade.filter((s) => !excluded.has(s.id));

  const scrollRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const tableReady = !previewing && inGrade.length > 0;
  const previewReady = previewing && promoting.length > 0;
  const pageSize = useFillPageSize(scrollRef, tableReady);
  const previewPageSize = useFillPageSize(previewScrollRef, previewReady);
  const { page, setPage, pageCount, pageRows } = usePagination(
    inGrade,
    [sourceGradeLevelId, departmentId, pageSize],
    pageSize,
  );
  const {
    page: previewPage,
    setPage: setPreviewPage,
    pageCount: previewPageCount,
    pageRows: previewPageRows,
  } = usePagination(
    promoting,
    [sourceGradeLevelId, departmentId, previewPageSize, previewing],
    previewPageSize,
  );

  const allPageIncluded = pageRows.length > 0 && pageRows.every((s) => !excluded.has(s.id));

  function toggleExclude(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPage() {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (allPageIncluded) pageRows.forEach((s) => next.add(s.id));
      else pageRows.forEach((s) => next.delete(s.id));
      return next;
    });
  }

  function confirm() {
    promote.mutate(
      { studentIds: promoting.map((s) => s.id), targetGradeLevelId: target?.id ?? null },
      {
        onSuccess: () => {
          setPreviewing(false);
          setExcluded(new Set());
          onPromoted();
        },
      },
    );
  }

  if (!source) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {!previewing && (
        <>
          {inGrade.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState title="ไม่พบข้อมูล" description="ไม่มีนักเรียนกำลังศึกษาชั้นนี้" />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto lg:hidden">
                {pageRows.map((s) => {
                  const name = `${s.first_name} ${s.last_name}`;
                  const skipped = excluded.has(s.id);
                  return (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={!skipped}
                          onChange={() => toggleExclude(s.id)}
                          aria-label={`เลื่อน ${name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {s.student_code}
                            {s.prefix ? ` · ${s.prefix}` : ""}
                          </p>
                          {skipped ? (
                            <p className="mt-1 text-[10px] text-warning">ซ้ำชั้น — ไม่เลื่อน</p>
                          ) : null}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div className="table-panel hidden lg:flex">
                <div ref={scrollRef} className="table-panel-scroll">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="w-8 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={allPageIncluded}
                            onChange={toggleAllPage}
                            aria-label={allPageIncluded ? "ยกเลิกทั้งหมดในหน้า" : "เลือกทั้งหมดในหน้า"}
                          />
                        </th>
                        <th className="px-3 py-2 font-medium">รหัสนักเรียน</th>
                        <th className="px-3 py-2 font-medium">คำนำหน้า</th>
                        <th className="px-3 py-2 font-medium">รายชื่อ</th>
                        <th className="px-3 py-2 font-medium">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((s) => {
                        const name = `${s.first_name} ${s.last_name}`;
                        const skipped = excluded.has(s.id);
                        return (
                          <tr key={s.id} className="h-[40px] border-t border-border">
                            <td className="px-3 py-0">
                              <input
                                type="checkbox"
                                checked={!skipped}
                                onChange={() => toggleExclude(s.id)}
                                aria-label={`เลื่อน ${name}`}
                              />
                            </td>
                            <td className="px-3 py-0">{s.student_code}</td>
                            <td className="px-3 py-0 font-medium">{s.prefix ?? "—"}</td>
                            <td className="px-3 py-0 font-medium">{name}</td>
                            <td className="px-3 py-0">
                              {skipped ? (
                                <span className="text-[10px] text-warning">ซ้ำชั้น — ไม่เลื่อน</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <Pagination page={page} pageCount={pageCount} onChange={setPage} />
              <Button
                className="shrink-0 self-start"
                disabled={promoting.length === 0}
                onClick={() => setPreviewing(true)}
              >
                ตรวจสอบก่อนเลื่อน ({promoting.length} คน)
              </Button>
            </div>
          )}
        </>
      )}

      {previewing && (
        <>
          <p className="shrink-0 text-sm font-medium">
            ยืนยันเลื่อน {promoting.length} คน{" "}
            {isTop ? "→ จบการศึกษา" : `จาก ${source.name} → ${target!.name}`}
          </p>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto lg:hidden">
              {previewPageRows.map((s) => (
                <li key={s.id} className="rounded-lg border border-border p-3">
                  <p className="truncate text-sm font-medium">
                    {s.first_name} {s.last_name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.student_code}
                    {s.prefix ? ` · ${s.prefix}` : ""}
                  </p>
                </li>
              ))}
            </ul>

            <div className="table-panel hidden lg:flex">
              <div ref={previewScrollRef} className="table-panel-scroll">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">รหัสนักเรียน</th>
                      <th className="px-3 py-2 font-medium">คำนำหน้า</th>
                      <th className="px-3 py-2 font-medium">รายชื่อ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewPageRows.map((s) => (
                      <tr key={s.id} className="h-[40px] border-t border-border">
                        <td className="px-3 py-0">{s.student_code}</td>
                        <td className="px-3 py-0 font-medium">{s.prefix ?? "—"}</td>
                        <td className="px-3 py-0 font-medium">
                          {s.first_name} {s.last_name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <Pagination page={previewPage} pageCount={previewPageCount} onChange={setPreviewPage} />
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPreviewing(false)}>
                ย้อนกลับ
              </Button>
              <Button className="flex-1" onClick={confirm} disabled={promote.isPending}>
                {promote.isPending ? <Spinner className="h-3 w-3" /> : "ยืนยันเลื่อนชั้น"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- classroom

function ClassroomPanel({
  departmentId,
  gradeLevelId,
}: {
  departmentId: string;
  gradeLevelId: string;
}) {
  const { data: gradeLevels = [] } = useGradeLevels(departmentId);
  const { data: activeYear } = useActiveAcademicYear(departmentId);
  const { data: students = [] } = useStudents({ search: "", departmentId, status: "studying" });
  const { data: studyPlans = [] } = useStudyPlans();
  const { data: cohortEnrollments = [] } = useDepartmentStudentEnrollments(departmentId || null);
  const createRoom = useCreateClassroom();
  const setActive = useSetClassroomActive();
  const assign = useAssignClassroom();

  const [newRoomName, setNewRoomName] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetRoomId, setTargetRoomId] = useState("");
  const [pickedRoomId, setPickedRoomId] = useState("");
  const [homeroomOpen, setHomeroomOpen] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    setTargetRoomId("");
    setNewRoomName("");
    setSearch("");
    setPickedRoomId("");
    setHomeroomOpen(false);
  }, [gradeLevelId]);

  const academicYear = activeYear ?? new Date().getFullYear() + 543;
  const { data: classrooms = [] } = useClassrooms(gradeLevelId || null);
  const { data: enrollments = [] } = useCurrentClassroomEnrollments(gradeLevelId || null, academicYear);

  const gradeLevel = gradeLevels.find((g) => g.id === gradeLevelId);
  const query = search.trim().toLowerCase();
  const roomByStudent = useMemo(
    () => new Map(enrollments.map((e) => [e.student_id, e.classroom_id])),
    [enrollments],
  );
  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (s.grade_level_id !== gradeLevelId) return false;
      if (pickedRoomId && roomByStudent.get(s.id) !== pickedRoomId) return false;
      if (!query) return true;
      const hay = `${s.student_code} ${s.prefix ?? ""} ${s.first_name} ${s.last_name}`.toLowerCase();
      return hay.includes(query);
    });
  }, [students, gradeLevelId, query, pickedRoomId, roomByStudent]);
  const roomName = useMemo(() => new Map(classrooms.map((c) => [c.id, c.name])), [classrooms]);
  const planName = useMemo(() => new Map(studyPlans.map((p) => [p.id, p.name])), [studyPlans]);
  const planByStudent = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const e of cohortEnrollments) map.set(e.student_id, e.study_plan_id);
    return map;
  }, [cohortEnrollments]);
  const activeRooms = classrooms.filter((c) => c.is_active);
  const pickedRoom = classrooms.find((c) => c.id === pickedRoomId);

  useEffect(() => {
    if (pickedRoomId && !classrooms.some((c) => c.id === pickedRoomId)) {
      setPickedRoomId("");
      setHomeroomOpen(false);
    }
  }, [classrooms, pickedRoomId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const tableReady = filtered.length > 0;
  const pageSize = useFillPageSize(scrollRef, tableReady);
  const { page, setPage, pageCount, pageRows } = usePagination(
    filtered,
    [gradeLevelId, departmentId, query, pickedRoomId, pageSize],
    pageSize,
  );
  useEffect(() => {
    setSelected(new Set());
  }, [gradeLevelId, query, pickedRoomId]);

  const allPageSelected = pageRows.length > 0 && pageRows.every((s) => selected.has(s.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageRows.forEach((s) => next.delete(s.id));
      else pageRows.forEach((s) => next.add(s.id));
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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Select
          className="min-w-0 flex-1"
          value={pickedRoomId}
          onChange={(e) => setPickedRoomId(e.target.value)}
          aria-label="ห้อง"
          placeholder="เลือกห้อง"
        >
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {gradeLevel?.name}/{c.name}
              {c.is_active ? "" : " (ปิดใช้งาน)"}
            </option>
          ))}
        </Select>
        <Button
          variant="outline"
          size="sm"
          disabled={!pickedRoom}
          onClick={() => setHomeroomOpen(true)}
        >
          ครูประจำชั้น
        </Button>
        <form onSubmit={submitNewRoom} className="flex gap-2">
          <Input
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="เลขห้อง เช่น 1"
            className="w-28"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!newRoomName.trim() || createRoom.isPending}
            aria-label="เพิ่มห้อง"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </form>
        <Switch
          checked={pickedRoom?.is_active ?? false}
          disabled={!pickedRoom || setActive.isPending}
          label={pickedRoom?.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
          onChange={(is_active) =>
            pickedRoom && setActive.mutate({ id: pickedRoom.id, is_active })
          }
        />
      </div>

      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อหรือรหัสนักเรียน"
          className="pl-9"
          type="search"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="ไม่พบข้อมูล"
            description={query ? "ไม่พบนักเรียนตามคำค้น" : "ไม่มีนักเรียนกำลังศึกษาชั้นนี้"}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="table-panel">
            <div ref={scrollRef} className="table-panel-scroll">
              <table className="w-full min-w-[40rem] text-xs">
                <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleAll}
                        aria-label={allPageSelected ? "ล้างที่เลือก" : "เลือกทั้งหมด"}
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">รหัสนักเรียน</th>
                    <th className="px-3 py-2 font-medium">คำนำหน้า</th>
                    <th className="px-3 py-2 font-medium">รายชื่อ</th>
                    <th className="px-3 py-2 font-medium">แผนการเรียน</th>
                    <th className="px-3 py-2 font-medium">ห้อง</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s) => {
                    const roomId = roomByStudent.get(s.id);
                    const name = `${s.first_name} ${s.last_name}`;
                    const hasPlan = planByStudent.has(s.id);
                    const studyPlanId = planByStudent.get(s.id);
                    return (
                      <tr key={s.id} className="h-[40px] border-t border-border">
                        <td className="px-3 py-0">
                          <input
                            type="checkbox"
                            checked={selected.has(s.id)}
                            onChange={() => toggle(s.id)}
                            aria-label={`เลือก ${name}`}
                          />
                        </td>
                        <td className="px-3 py-0">{s.student_code}</td>
                        <td className="px-3 py-0 font-medium">{s.prefix ?? "—"}</td>
                        <td className="px-3 py-0 font-medium">{name}</td>
                        <td className="px-3 py-0">
                          {!hasPlan
                            ? "—"
                            : studyPlanId
                              ? (planName.get(studyPlanId) ?? "—")
                              : "ทั่วไป"}
                        </td>
                        <td className="px-3 py-0">
                          {roomId ? (
                            <span className="flex items-center gap-1.5">
                              <span className="size-2 rounded-full bg-success" />
                              <span className="text-xs">
                                {gradeLevel?.name}/{roomName.get(roomId) ?? "—"}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">ยังไม่จัดห้อง</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          <div className="flex shrink-0 gap-2">
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
        </div>
      )}

      <HomeroomSheet
        open={homeroomOpen && !!pickedRoom}
        onClose={() => setHomeroomOpen(false)}
        classroomId={pickedRoom?.id ?? null}
        classroomLabel={pickedRoom ? `${gradeLevel?.name}/${pickedRoom.name}` : ""}
        departmentId={departmentId}
        academicYear={academicYear}
      />
    </div>
  );
}

function HomeroomSheet({
  open,
  onClose,
  classroomId,
  classroomLabel,
  departmentId,
  academicYear,
}: {
  open: boolean;
  onClose: () => void;
  classroomId: string | null;
  classroomLabel: string;
  departmentId: string;
  academicYear: number;
}) {
  const [filterDept, setFilterDept] = useState(departmentId);
  const [addingTeacherId, setAddingTeacherId] = useState("");

  useEffect(() => {
    setAddingTeacherId("");
    setFilterDept(departmentId);
  }, [classroomId, departmentId, open]);

  // DB doesn't enforce same-department (grill decision); filter defaults to the
  // room's department but can widen so a teacher from another dept can be set.
  const { data: departments = [] } = useDepartments();
  const { data: teachers = [] } = useProfiles({
    search: "",
    departmentId: "",
    role: "teacher",
    active: "true",
  });
  const { data: homerooms = [] } = useHomeroomTeachers(classroomId, academicYear);
  const setTeacher = useSetHomeroomTeacher();
  const removeTeacher = useRemoveHomeroomTeacher();

  const teacherName = useMemo(() => new Map(teachers.map((t) => [t.id, profileFullName(t)])), [teachers]);
  const assignedIds = useMemo(() => new Set(homerooms.map((h) => h.teacher_id)), [homerooms]);
  const pickable = teachers.filter(
    (t) => !assignedIds.has(t.id) && (!filterDept || t.department_id === filterDept),
  );

  function addTeacher() {
    if (!classroomId || !addingTeacherId) return;
    setTeacher.mutate(
      { classroom_id: classroomId, teacher_id: addingTeacherId, academic_year: academicYear },
      { onSuccess: () => setAddingTeacherId("") },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      side="right"
      title="ครูประจำชั้น"
      description={`${classroomLabel} · ปีการศึกษา ${academicYear}`}
    >
      <div className="space-y-3">
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
        <Select
          value={filterDept}
          onChange={(e) => {
            setFilterDept(e.target.value);
            setAddingTeacherId("");
          }}
          aria-label="แผนก"
        >
          <option value="">ทุกแผนก</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
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
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------- bulk status

function BulkStatusPanel({
  departmentId,
  gradeLevelId,
}: {
  departmentId: string;
  gradeLevelId: string;
}) {
  const [search, setSearch] = useState("");
  const { data: students = [] } = useStudents({ search, departmentId, status: "" });
  const bulkSet = useBulkSetStudentStatus();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetStatus, setTargetStatus] = useState<StudentStatus>("transferred");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const rows = useMemo(
    () => (gradeLevelId ? students.filter((s) => s.grade_level_id === gradeLevelId) : students),
    [students, gradeLevelId],
  );

  useEffect(() => setSelected(new Set()), [departmentId, gradeLevelId, search]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const tableReady = rows.length > 0;
  const pageSize = useFillPageSize(scrollRef, tableReady);
  const { page, setPage, pageCount, pageRows } = usePagination(
    rows,
    [departmentId, gradeLevelId, search, pageSize],
    pageSize,
  );
  const allPageSelected = pageRows.length > 0 && pageRows.every((s) => selected.has(s.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageRows.forEach((s) => next.delete(s.id));
      else pageRows.forEach((s) => next.add(s.id));
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

  function changeOne(studentId: string, name: string, status: StudentStatus, current: StudentStatus) {
    if (status === current) return;
    if (!confirm(`เปลี่ยนสถานะของ "${name}" เป็น "${STATUS_LABEL[status]}"?`)) return;
    setPendingId(studentId);
    bulkSet.mutate(
      { studentIds: [studentId], status },
      { onSettled: () => setPendingId(null) },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อหรือรหัสนักเรียน"
          className="pl-9"
          type="search"
        />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่พบข้อมูล" description="ไม่มีนักเรียนตามเงื่อนไขที่เลือก" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="table-panel">
            <div ref={scrollRef} className="table-panel-scroll">
              <table className="w-full min-w-[40rem] text-xs">
                <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleAll}
                        aria-label={allPageSelected ? "ล้างที่เลือก" : "เลือกทั้งหมด"}
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">รหัสนักเรียน</th>
                    <th className="px-3 py-2 font-medium">คำนำหน้า</th>
                    <th className="px-3 py-2 font-medium">รายชื่อ</th>
                    <th className="px-3 py-2 font-medium">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s) => {
                    const name = `${s.first_name} ${s.last_name}`;
                    return (
                      <tr key={s.id} className="h-[40px] border-t border-border">
                        <td className="px-3 py-0">
                          <input
                            type="checkbox"
                            checked={selected.has(s.id)}
                            onChange={() => toggle(s.id)}
                            aria-label={`เลือก ${name}`}
                          />
                        </td>
                        <td className="px-3 py-0">{s.student_code}</td>
                        <td className="px-3 py-0 font-medium">{s.prefix ?? "—"}</td>
                        <td className="px-3 py-0 font-medium">{name}</td>
                        <td className="px-3 py-0">
                          <Select
                            className="h-6 min-w-[7rem] px-1.5 text-[10px]"
                            aria-label={`สถานะของ ${name}`}
                            value={s.status}
                            disabled={pendingId === s.id || bulkSet.isPending}
                            onChange={(e) =>
                              changeOne(s.id, name, e.target.value as StudentStatus, s.status)
                            }
                          >
                            {(Object.keys(STATUS_LABEL) as StudentStatus[]).map((st) => (
                              <option key={st} value={st}>
                                {STATUS_LABEL[st]}
                              </option>
                            ))}
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          <div className="flex shrink-0 gap-2">
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
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- transfer-in
// Case tracker only, not a workflow engine (grill decision, 2026-08-09) —
// classroom assignment and cohort enrollment stay on their own tabs/pages
// (ClassroomPanel above, Enrollment.tsx), each already reusable for a
// single ad-hoc student. This panel just remembers source_school and
// shows whether those two steps are done, derived live rather than stored.

function TransferIntakePanel({
  departmentId,
  gradeLevelId,
}: {
  departmentId: string;
  gradeLevelId: string;
}) {
  const [creating, setCreating] = useState(false);
  const { data: intakes = [] } = useTransferIntakes();
  const { data: students = [] } = useStudents({ search: "", departmentId, status: "" });

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const deptIntakes = useMemo(
    () =>
      intakes.filter((i) => {
        const s = studentById.get(i.student_id);
        if (!s) return false;
        if (gradeLevelId && s.grade_level_id !== gradeLevelId) return false;
        return true;
      }),
    [intakes, studentById, gradeLevelId],
  );
  const studentIds = useMemo(() => deptIntakes.map((i) => i.student_id), [deptIntakes]);
  const { data: progress } = useTransferProgress(studentIds);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {deptIntakes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="ยังไม่มีเคสรับย้ายเข้า"
            description='จัดห้อง: ไปแท็บ "จัดห้องเรียน" · ลงทะเบียน: ไปหน้า "ลงทะเบียน"'
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="h-3.5 w-3.5" />
                ย้ายเข้า
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-end">
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" />
              ย้ายเข้า
            </Button>
          </div>
          <Card className="divide-y divide-border p-0">
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
        </>
      )}

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
