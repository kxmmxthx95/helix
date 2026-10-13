import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { BookIcon, CheckmarkCircleIcon, ChevronForward, HomeIcon, Plus, Search, TimeIcon, Users, X } from "@/components/icons";
import { Avatar, Button, EmptyState, Input, Pagination, Select, Skeleton } from "@/components/ui";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { avatarUrl } from "@/hooks/useAvatar";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments } from "@/hooks/useProfiles";
import { useProfilesByIds } from "@/hooks/usePractice";
import { useStudents } from "@/hooks/useStudents";
import {
  useClassroomsByDepartment,
  useCurrentClassroomEnrollmentsByDepartment,
  useHomeroomClassroomsByTeacher,
  useHomeroomTeachersByDepartment,
  useRemoveHomeroomTeacher,
} from "@/hooks/useStatusManagement";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { isOrgWide } from "@/lib/roles";
import type { Classroom, Student } from "@/lib/database.types";
import { EditStudentSheet } from "@/routes/Roster";
import { HomeroomSheet } from "@/routes/StatusManagement";

/** อ่านอย่างเดียว — org-wide list ของทุกห้องเรียนในแผนก, ตรงข้ามกับ ClassroomPanel ใน StatusManagement.tsx ที่จัดการทีละระดับชั้นและมี CRUD. */
export function Classrooms() {
  const { profile: me } = useAuth();
  if (!me) return null;

  const orgWide = isOrgWide(me.roles);
  const isHomeroomTeacherOnly = !orgWide && !me.roles.includes("dept_head");

  const { data: departments = [] } = useDepartments();
  const [pickedDept, setPickedDept] = useState("");
  const departmentId = orgWide ? pickedDept : (me.department_id ?? "");
  const { data: activeYear } = useActiveAcademicYear(departmentId || null);
  const academicYear = activeYear ?? new Date().getFullYear() + 543;

  const { data: gradeLevels = [] } = useGradeLevels(departmentId || null);
  const { data: classrooms = [], isLoading } = useClassroomsByDepartment(departmentId || null);
  const { data: homeroomTeachers = [] } = useHomeroomTeachersByDepartment(departmentId || null, academicYear);
  const { data: enrollments = [] } = useCurrentClassroomEnrollmentsByDepartment(departmentId || null);
  const { data: myHomeroomClassroomIds = [] } = useHomeroomClassroomsByTeacher(
    isHomeroomTeacherOnly ? me.id : null,
    academicYear,
  );

  const teacherIds = [...new Set(homeroomTeachers.map((h) => h.teacher_id))];
  const { data: teacherProfiles = [] } = useProfilesByIds(teacherIds);
  const teacherById = new Map(
    teacherProfiles.map((p) => [p.id, { name: `${p.first_name} ${p.last_name}`, avatar: avatarUrl(p) }]),
  );
  const teacherByClassroomId = new Map(homeroomTeachers.map((h) => [h.classroom_id, h.teacher_id]));
  const homeroomsByClassroomId = new Map<string, typeof homeroomTeachers>();
  for (const h of homeroomTeachers) {
    homeroomsByClassroomId.set(h.classroom_id, [...(homeroomsByClassroomId.get(h.classroom_id) ?? []), h]);
  }
  const removeTeacher = useRemoveHomeroomTeacher();

  const gradeLevelById = new Map(gradeLevels.map((g) => [g.id, g]));
  const studentCountByClassroomId = new Map<string, number>();
  for (const e of enrollments) {
    studentCountByClassroomId.set(e.classroom_id, (studentCountByClassroomId.get(e.classroom_id) ?? 0) + 1);
  }

  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const searchTerm = search.trim().toLowerCase();
  const hasFilter = !!(search || gradeFilter || statusFilter);

  const scoped = isHomeroomTeacherOnly
    ? classrooms.filter((c) => myHomeroomClassroomIds.includes(c.id))
    : classrooms;
  const filtered = scoped.filter((c) => {
    if (gradeFilter && c.grade_level_id !== gradeFilter) return false;
    if (statusFilter && c.is_active !== (statusFilter === "active")) return false;
    if (!searchTerm) return true;
    const grade = gradeLevelById.get(c.grade_level_id);
    return `${grade ? gradeShortLabel(grade.code) : ""} ${c.name}`.toLowerCase().includes(searchTerm);
  });
  const activeCount = scoped.filter((c) => c.is_active).length;
  const totalStudents = scoped.reduce((n, c) => n + (studentCountByClassroomId.get(c.id) ?? 0), 0);
  const sorted = [...filtered].sort((a, b) => {
    const gradeA = gradeLevelById.get(a.grade_level_id)?.sort_order ?? Infinity;
    const gradeB = gradeLevelById.get(b.grade_level_id)?.sort_order ?? Infinity;
    if (gradeA !== gradeB) return gradeA - gradeB;
    return a.name.localeCompare(b.name);
  });

  const { page, setPage, pageCount, pageRows } = usePagination(sorted, [departmentId, search, gradeFilter, statusFilter]);

  const department = departments.find((d) => d.id === departmentId);

  const [openClassroomId, setOpenClassroomId] = useState("");
  const [homeroomClassroomId, setHomeroomClassroomId] = useState("");
  const homeroomClassroom = classrooms.find((c) => c.id === homeroomClassroomId) ?? null;
  const openClassroom = classrooms.find((c) => c.id === openClassroomId) ?? null;
  if (openClassroom) {
    const grade = gradeLevelById.get(openClassroom.grade_level_id);
    const openClassroomTeacherId = teacherByClassroomId.get(openClassroom.id);
    const openClassroomTeacher = openClassroomTeacherId ? teacherById.get(openClassroomTeacherId) : null;
    return (
      <ClassroomRoster
        classroom={openClassroom}
        departmentId={departmentId}
        label={grade ? `${gradeShortLabel(grade.code)}/${openClassroom.name}` : openClassroom.name}
        teacher={openClassroomTeacher ?? null}
        onBack={() => setOpenClassroomId("")}
      />
    );
  }

  return (
    <div className="page-fill">
      <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard tone="accent" icon={<BookIcon className="h-5 w-5" />} label="ทั้งหมด" value={scoped.length} unit="ห้องเรียน" />
        <StatCard tone="success" icon={<CheckmarkCircleIcon className="h-5 w-5" />} label="กำลังใช้งาน" value={activeCount} unit="ห้องเรียน" />
        <StatCard tone="warning" icon={<TimeIcon className="h-5 w-5" />} label="ปิดใช้งาน" value={scoped.length - activeCount} unit="ห้องเรียน" />
        <StatCard tone="muted" icon={<Users className="h-5 w-5" />} label="จำนวนนักเรียนรวม" value={totalStudents} unit="คน" />
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {orgWide && (
          <Select
            className="w-auto min-w-36"
            value={pickedDept}
            onChange={(e) => {
              setPickedDept(e.target.value);
              setGradeFilter("");
            }}
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
        <Select className="w-auto min-w-32" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} aria-label="ระดับชั้น">
          <option value="">ทุกระดับชั้น</option>
          {gradeLevels.map((g) => (
            <option key={g.id} value={g.id}>
              {gradeShortLabel(g.code)}
            </option>
          ))}
        </Select>
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาห้องเรียน..."
            aria-label="ค้นหาห้องเรียน"
          />
        </div>
        <Select
          className="w-auto min-w-28"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")}
          aria-label="สถานะ"
        >
          <option value="">ทุกสถานะ</option>
          <option value="active">ใช้งานอยู่</option>
          <option value="inactive">ปิดใช้งาน</option>
        </Select>
        <Button
          variant="outline"
          disabled={!hasFilter}
          onClick={() => {
            setSearch("");
            setGradeFilter("");
            setStatusFilter("");
          }}
        >
          รีเซ็ต
        </Button>
      </div>

      {orgWide && !departmentId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนก" description="เลือกแผนกเพื่อดูรายชื่อห้องเรียนทั้งหมด" icon={HomeIcon} />
        </div>
      ) : isLoading ? (
        <div role="status" aria-label="กำลังโหลด" className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[32rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                <th className="px-3 py-2 font-medium">ห้องเรียน</th>
                <th className="px-3 py-2 font-medium">แผนก</th>
                <th className="px-3 py-2 font-medium">ครูประจำชั้น</th>
                <th className="px-3 py-2 font-medium">จำนวนนักเรียน</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-3">
                    <Skeleton className="h-4 w-10 rounded-full" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-3 w-16" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-3 w-20" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-3 w-6" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-4 w-14 rounded-full" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="ไม่มีห้องเรียน"
            description={
              isHomeroomTeacherOnly
                ? "คุณยังไม่ได้เป็นครูประจำชั้นห้องใด"
                : department
                  ? "ยังไม่มีห้องเรียนในแผนกนี้"
                  : "ยังไม่มีห้องเรียน"
            }
            icon={HomeIcon}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[32rem] text-xs">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                  <th className="px-3 py-2 font-medium">ห้องเรียน</th>
                  <th className="px-3 py-2 font-medium">แผนก</th>
                  <th className="px-3 py-2 font-medium">ครูประจำชั้น</th>
                  <th className="px-3 py-2 font-medium">จำนวนนักเรียน</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => {
                  const grade = gradeLevelById.get(c.grade_level_id);
                  const homerooms = homeroomsByClassroomId.get(c.id) ?? [];
                  const studentCount = studentCountByClassroomId.get(c.id) ?? 0;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setOpenClassroomId(c.id)}
                      className="cursor-pointer border-t border-border hover:bg-muted active:bg-muted"
                    >
                      <td className="px-3 py-3">
                        {grade && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                            {gradeShortLabel(grade.code)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {grade ? `${gradeShortLabel(grade.code)}/${c.name}` : c.name}
                      </td>
                      <td className="px-3 py-3">{department?.name ?? "—"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-1 flex-col gap-1">
                            {homerooms.length === 0 && "—"}
                            {homerooms.map((h) => {
                              const t = teacherById.get(h.teacher_id);
                              if (!t) return null;
                              return (
                                <div key={h.id} className="flex items-center gap-2">
                                  <Avatar name={t.name} src={t.avatar} className="h-6 w-6 text-[9px]" />
                                  <span className="min-w-0 truncate">{t.name}</span>
                                  {orgWide && (
                                    <button
                                      type="button"
                                      aria-label={`ลบ ${t.name}`}
                                      disabled={removeTeacher.isPending}
                                      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`ลบ ${t.name} ออกจากครูประจำชั้น?`)) removeTeacher.mutate(h.id);
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {orgWide && (
                            <Button
                              size="icon"
                              variant="outline"
                              aria-label="เพิ่มครูประจำชั้น"
                              onClick={(e) => {
                                e.stopPropagation();
                                setHomeroomClassroomId(c.id);
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">{studentCount}</td>
                      <td className="px-3 py-3">
                        <span
                          className={
                            c.is_active
                              ? "inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success"
                              : "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                          }
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {c.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                        </span>
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

      <HomeroomSheet
        open={!!homeroomClassroom}
        onClose={() => setHomeroomClassroomId("")}
        classroomId={homeroomClassroom?.id ?? null}
        classroomLabel={
          homeroomClassroom
            ? `${gradeShortLabel(gradeLevelById.get(homeroomClassroom.grade_level_id)?.code ?? "")}/${homeroomClassroom.name}`
            : ""
        }
        departmentId={departmentId}
        academicYear={academicYear}
      />
    </div>
  );
}

function StatCard({
  tone,
  icon,
  label,
  value,
  unit,
}: {
  tone: "accent" | "success" | "warning" | "muted";
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
}) {
  const toneClass = {
    accent: "bg-accent/10 text-accent",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <div className={`flex items-center gap-3 rounded-2xl p-3 ${toneClass}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/70">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-foreground">
          <span className="font-heading text-xl font-semibold">{value.toLocaleString("th-TH")}</span>{" "}
          <span className="text-xs text-muted-foreground">{unit}</span>
        </p>
      </div>
    </div>
  );
}

/** อ่านอย่างเดียว — รายชื่อนักเรียนที่กำลังเรียนอยู่ในห้องนี้ตอนนี้ (ไม่กรอง academic_year เดียวกับตัวนับจำนวนด้านบน), reuse useStudents({ classroomId }) เดียวกับ Roster.tsx. */
function ClassroomRoster({
  classroom,
  departmentId,
  label,
  teacher,
  onBack,
}: {
  classroom: Classroom;
  departmentId: string;
  label: string;
  teacher: { name: string; avatar: string | null } | null;
  onBack: () => void;
}) {
  const { data: students = [], isLoading } = useStudents({
    search: "",
    departmentId,
    status: "studying",
    classroomId: classroom.id,
  });
  const { page, setPage, pageCount, pageRows } = usePagination(students, [classroom.id]);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ChevronForward className="h-3 w-3 rotate-180" /> {label}
        </Button>
        {teacher && (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">ครูประจำชั้น</p>
              <p className="text-xs font-medium">{teacher.name}</p>
            </div>
            <Avatar name={teacher.name} src={teacher.avatar} className="h-7 w-7 text-[9px]" />
          </div>
        )}
      </div>

      {isLoading ? (
        <div role="status" aria-label="กำลังโหลด" className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[20rem] text-xs">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">รหัสนักเรียน</th>
                <th className="px-3 py-2 font-medium">คำนำหน้า</th>
                <th className="px-3 py-2 font-medium">ชื่อ-สกุล</th>
                <th className="px-3 py-2 font-medium">เบอร์โทรศัพท์</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-3">
                    <Skeleton className="h-3 w-16" />
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-3 w-10" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Skeleton className="h-3 w-20" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : students.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่มีนักเรียน" description="ห้องนี้ยังไม่มีนักเรียน" icon={HomeIcon} />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[20rem] text-xs">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">รหัสนักเรียน</th>
                  <th className="px-3 py-2 font-medium">คำนำหน้า</th>
                  <th className="px-3 py-2 font-medium">ชื่อ-สกุล</th>
                  <th className="px-3 py-2 font-medium">เบอร์โทรศัพท์</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setViewingStudent(s)}
                    className="cursor-pointer border-t border-border hover:bg-muted active:bg-muted"
                  >
                    <td className="px-3 py-3">{s.student_code}</td>
                    <td className="px-3 py-3">{s.prefix ?? "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={`${s.first_name} ${s.last_name}`}
                          src={s.profile ? avatarUrl(s.profile) : null}
                          className="h-6 w-6 text-[9px]"
                        />
                        {s.first_name} {s.last_name}
                      </div>
                    </td>
                    <td className="px-3 py-3">{s.phone ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}

      <EditStudentSheet target={viewingStudent} onClose={() => setViewingStudent(null)} forceReadOnly />
    </div>
  );
}
