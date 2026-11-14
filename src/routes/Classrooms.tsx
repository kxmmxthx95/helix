import { useRef, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { BarChartIcon, BookIcon, CheckmarkCircleIcon, DownloadIcon, PrintIcon, ChevronForward, HomeIcon, Plus, Search, SlidersHorizontal, TimeIcon, Users, X } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { Sheet } from "@/components/Sheet";
import { Avatar, Button, EmptyState, Field, FormSection, Input, Pagination, Select, Skeleton } from "@/components/ui";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { avatarUrl, studentAvatarUrl } from "@/hooks/useAvatar";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments } from "@/hooks/useProfiles";
import { useProfilesByIds, useTeacherContact } from "@/hooks/usePractice";
import { useLearningAreas } from "@/hooks/useCurriculum";
import { fetchClassroomStudents, useStudents } from "@/hooks/useStudents";
import { downloadRosterPdf, rosterHtml } from "@/lib/rosterPdf";
import {
  useClassroomsByDepartment,
  useCurrentClassroomEnrollmentsByDepartment,
  useHomeroomClassroomsByTeacher,
  useHomeroomTeachersByDepartment,
  useRemoveHomeroomTeacher,
} from "@/hooks/useStatusManagement";
import { departmentTone, gradeShortLabel, levelTone } from "@/lib/gradeLevels";
import { isDeptHead, isOrgWide } from "@/lib/roles";
import type { Classroom, Student } from "@/lib/database.types";
import { EditStudentSheet, studentGender } from "@/routes/Roster";
import { HomeroomSheet } from "@/routes/StatusManagement";

/** อ่านอย่างเดียว — org-wide list ของทุกห้องเรียนในแผนก, ตรงข้ามกับ ClassroomPanel ใน StatusManagement.tsx ที่จัดการทีละระดับชั้นและมี CRUD. */
export function Classrooms() {
  const { profile } = useAuth();
  // Guard in a wrapper: an early return above the hooks breaks hook order when the profile reloads.
  return profile ? <ClassroomsList me={profile} /> : null;
}

function ClassroomsList({ me }: { me: NonNullable<ReturnType<typeof useAuth>["profile"]> }) {

  const orgWide = isOrgWide(me.roles);
  const isHomeroomTeacherOnly = !orgWide && !isDeptHead(me.roles);

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
    teacherProfiles.map((p) => [p.id, { id: p.id, name: `${p.first_name} ${p.last_name}`, avatar: avatarUrl(p) }]),
  );
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const activeFilterCount = [gradeFilter, statusFilter].filter(Boolean).length;
  const resetFilters = () => {
    setSearch("");
    setGradeFilter("");
    setStatusFilter("");
  };

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
    const openClassroomTeachers = (homeroomsByClassroomId.get(openClassroom.id) ?? []).flatMap((h) => teacherById.get(h.teacher_id) ?? []);
    return (
      <ClassroomRoster
        classroom={openClassroom}
        departmentId={departmentId}
        label={grade ? `${gradeShortLabel(grade.code)}/${openClassroom.name}` : openClassroom.name}
        gradeLabel={grade ? gradeShortLabel(grade.code) : undefined}
        teachers={openClassroomTeachers}
        classroomLabelsOf={(teacherId) =>
          homeroomTeachers
            .filter((h) => h.teacher_id === teacherId)
            .flatMap((h) => {
              const c = classrooms.find((x) => x.id === h.classroom_id);
              const g = c && gradeLevelById.get(c.grade_level_id);
              return c ? `${g ? gradeShortLabel(g.code) + "/" : ""}${c.name}` : [];
            })
        }
        onBack={() => setOpenClassroomId("")}
      />
    );
  }

  const [preview, setPreview] = useState<{ label: string; students: Student[] } | null>(null);
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const openRosterPreview = async (c: Classroom) => {
    const grade = gradeLevelById.get(c.grade_level_id);
    const label = grade ? `${gradeShortLabel(grade.code)}/${c.name}` : c.name;
    try {
      setPreview({ label, students: await fetchClassroomStudents(c.id) });
    } catch {
      alert("สร้างใบรายชื่อไม่สำเร็จ");
    }
  };

  const homeroomCell = (c: Classroom) => {
    const homerooms = homeroomsByClassroomId.get(c.id) ?? [];
    return (
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
    );
  };

  /** Dept / grade / status selects: inline on desktop, inside the filter drawer on phones. */
  const filterSelects = (cls: string, wrap?: (label: string, el: React.ReactElement) => React.ReactNode) => {
    const w = wrap ?? ((_: string, el: React.ReactElement) => el);
    return (
      <>
        {orgWide &&
          w(
            "แผนก",
            <Select
              className={cls}
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
            </Select>,
          )}
        {w(
          "ระดับชั้น",
          <Select
            className={cls}
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            disabled={!departmentId}
            aria-label="ระดับชั้น"
            title={departmentId ? undefined : "เลือกแผนกก่อน"}
          >
            <option value="">ทุกระดับชั้น</option>
            {gradeLevels.map((g) => (
              <option key={g.id} value={g.id}>
                {gradeShortLabel(g.code)}
              </option>
            ))}
          </Select>,
        )}
        {w(
          "สถานะ",
          <Select
            className={cls}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")}
            aria-label="สถานะ"
          >
            <option value="">ทุกสถานะ</option>
            <option value="active">ใช้งานอยู่</option>
            <option value="inactive">ปิดใช้งาน</option>
          </Select>,
        )}
      </>
    );
  };

  return (
    <div className="page-fill page-flush min-h-0 shrink-0 pb-5">
      <div className="flex shrink-0 flex-wrap gap-2">
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
        <div className="hidden gap-2 lg:flex">{filterSelects("w-auto")}</div>
        <Button variant="outline" className="hidden lg:inline-flex" disabled={!hasFilter} onClick={resetFilters}>
          รีเซ็ต
        </Button>
        <Button variant="outline" size="icon" className="relative shrink-0 lg:hidden" onClick={() => setFiltersOpen(true)} aria-label="ตัวกรอง">
          <SlidersHorizontal className="h-3 w-3" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-accent-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
        <Button variant="outline" size="icon" className="shrink-0 lg:hidden" onClick={() => setStatsOpen(true)} aria-label="สรุปห้องเรียน">
          <BarChartIcon className="h-3 w-3" />
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
          <ul className="space-y-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:hidden">
            {pageRows.map((c) => {
              const grade = gradeLevelById.get(c.grade_level_id);
              const studentCount = studentCountByClassroomId.get(c.id) ?? 0;
              return (
                <li key={c.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenClassroomId(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenClassroomId(c.id);
                      }
                    }}
                    className="rounded-xl bg-card p-3.5 shadow-card transition-colors active:bg-muted"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{grade ? `${gradeShortLabel(grade.code)}/${c.name}` : c.name}</p>
                        <div className="mt-1 flex min-w-0 items-center gap-1.5">
                          {department && (
                            <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${departmentTone(department.id)}`}>
                              {department.name}
                            </span>
                          )}
                          <span className="truncate text-xs text-muted-foreground">{studentCount} คน</span>
                        </div>
                      </div>
                      <span className="mt-0.5 flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <span className={c.is_active ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-muted-foreground"} />
                        {c.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5 text-xs">
                      <div className="min-w-0">{homeroomCell(c)}</div>
                      <button
                        type="button"
                        aria-label="พิมพ์ใบรายชื่อนักเรียน"
                        title="พิมพ์ใบรายชื่อนักเรียน"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openRosterPreview(c);
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                        <PrintIcon className="h-4 w-4" />
                        </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card lg:block">
            <table className="w-full min-w-[32rem] text-xs">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">ระดับชั้น</th>
                  <th className="px-3 py-2 font-medium">ห้องเรียน</th>
                  <th className="px-3 py-2 font-medium">แผนก</th>
                  <th className="px-3 py-2 font-medium">ครูประจำชั้น</th>
                  <th className="px-3 py-2 font-medium">จำนวนนักเรียน</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="w-10 px-3 py-2"><span className="sr-only">พิมพ์</span></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => {
                  const grade = gradeLevelById.get(c.grade_level_id);
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
                      <td className="px-3 py-3">
                        {department ? (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${departmentTone(department.id)}`}>{department.name}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3">{homeroomCell(c)}</td>
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
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          aria-label="พิมพ์ใบรายชื่อนักเรียน"
                          title="พิมพ์ใบรายชื่อนักเรียน"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openRosterPreview(c);
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <PrintIcon className="h-4 w-4" />
                        </button>
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

      <div className="mt-auto hidden shrink-0 grid-cols-4 gap-2 lg:grid">
        <StatCard tone="accent" icon={<BookIcon className="h-5 w-5" />} label="ทั้งหมด" value={scoped.length} unit="ห้องเรียน" />
        <StatCard tone="success" icon={<CheckmarkCircleIcon className="h-5 w-5" />} label="กำลังใช้งาน" value={activeCount} unit="ห้องเรียน" />
        <StatCard tone="warning" icon={<TimeIcon className="h-5 w-5" />} label="ปิดใช้งาน" value={scoped.length - activeCount} unit="ห้องเรียน" />
        <StatCard tone="muted" icon={<Users className="h-5 w-5" />} label="จำนวนนักเรียนรวม" value={totalStudents} unit="คน" />
      </div>

      <Sheet open={statsOpen} onOpenChange={setStatsOpen} title="สรุปห้องเรียน" bottomOnPhone>
        <div className="grid grid-cols-2 gap-2">
          <StatCard tone="accent" icon={<BookIcon className="h-5 w-5" />} label="ทั้งหมด" value={scoped.length} unit="ห้องเรียน" />
          <StatCard tone="success" icon={<CheckmarkCircleIcon className="h-5 w-5" />} label="กำลังใช้งาน" value={activeCount} unit="ห้องเรียน" />
          <StatCard tone="warning" icon={<TimeIcon className="h-5 w-5" />} label="ปิดใช้งาน" value={scoped.length - activeCount} unit="ห้องเรียน" />
          <StatCard tone="muted" icon={<Users className="h-5 w-5" />} label="จำนวนนักเรียนรวม" value={totalStudents} unit="คน" />
        </div>
      </Sheet>

      <Modal
        open={preview !== null}
        onOpenChange={(o) => !o && setPreview(null)}
        title={`ใบรายชื่อ ${preview?.label ?? ""}`}
        className="max-w-4xl"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => preview && void downloadRosterPdf(preview.label, preview.students)}>
              <DownloadIcon className="mr-2 h-4 w-4" />
              ดาวน์โหลด PDF
            </Button>
            <Button className="flex-1" onClick={() => previewFrame.current?.contentWindow?.print()}>
              <PrintIcon className="mr-2 h-4 w-4" />
              พิมพ์
            </Button>
          </div>
        }
      >
        {preview && <iframe ref={previewFrame} srcDoc={rosterHtml(preview.label, preview.students)} title="ตัวอย่างใบรายชื่อ" className="h-[60vh] w-full rounded-lg border border-border" />}
      </Modal>

      <Modal
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="ตัวกรอง"
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={activeFilterCount === 0}
              onClick={() => {
                setGradeFilter("");
                setStatusFilter("");
              }}
            >
              ล้างตัวกรอง
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              ดูผลลัพธ์
            </Button>
          </div>
        }
      >
        <FormSection>{filterSelects("", (label, el) => <Field label={label}>{el}</Field>)}</FormSection>
      </Modal>

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

export function StatCard({
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
  gradeLabel,
  teachers,
  classroomLabelsOf,
  onBack,
}: {
  classroom: Classroom;
  departmentId: string;
  label: string;
  gradeLabel?: string;
  teachers: { id: string; name: string; avatar: string | null }[];
  classroomLabelsOf: (teacherId: string) => string[];
  onBack: () => void;
}) {
  const { data: students = [], isLoading } = useStudents({
    search: "",
    departmentId,
    status: "studying",
    classroomId: classroom.id,
  });
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [viewingTeacherId, setViewingTeacherId] = useState<string | null>(null);

  return (
    <div className="page-fill">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ChevronForward className="h-3 w-3 rotate-180" /> {label}
        </Button>
        {teachers.length > 0 && (
          <div className="flex min-w-0 flex-col items-end gap-1">
            <p className="text-[10px] text-muted-foreground">ครูประจำชั้น</p>
            {teachers.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setViewingTeacherId(t.id)}
                aria-label={`ดูข้อมูล ${t.name}`}
                className="tappable flex min-w-0 items-center gap-2"
              >
                <p className="truncate text-xs font-medium">{t.name}</p>
                <Avatar name={t.name} src={t.avatar} className="h-7 w-7 text-[9px]" />
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div role="status" aria-label="กำลังโหลด" className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="ไม่มีนักเรียน" description="ห้องนี้ยังไม่มีนักเรียน" icon={HomeIcon} />
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2 lg:hidden">
            {students.map((s) => {
              const fullName = `${s.first_name} ${s.last_name}`;
              const gender = studentGender(s.prefix);
              return (
                <li key={s.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setViewingStudent(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setViewingStudent(s);
                      }
                    }}
                    className="rounded-xl bg-card p-3.5 shadow-card transition-colors active:bg-muted"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar name={fullName} src={studentAvatarUrl(s) ?? (s.profile ? avatarUrl(s.profile) : null)} className="h-11 w-11 text-sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{fullName}</p>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="truncate text-xs text-muted-foreground">{s.student_code}</span>
                          {gradeLabel && (
                            <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${levelTone(gradeLabel)}`}>{gradeLabel}</span>
                          )}
                          {gender && (
                            <span
                              className={
                                gender === "ชาย"
                                  ? "inline-flex shrink-0 items-center rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300"
                                  : "inline-flex shrink-0 items-center rounded-full bg-pink-500/15 px-2 py-0.5 text-[10px] font-medium text-pink-700 dark:text-pink-300"
                              }
                            >
                              {gender}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="table-panel hidden rounded-none border-t border-border shadow-none lg:flex">
            <div className="table-panel-scroll scrollbar-hidden">
              <table className="w-full text-[13px]">
                <thead className="text-left text-xs">
                  <tr>
                    <th className="px-4 py-3">นักเรียน</th>
                    <th className="px-4 py-3">ชั้น</th>
                    <th className="px-4 py-3">เบอร์โทรศัพท์</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const fullName = `${s.first_name} ${s.last_name}`;
                    return (
                      <tr key={s.id} onClick={() => setViewingStudent(s)} className="h-14 cursor-pointer border-t border-border first:border-t-0">
                        <td className="px-4 py-0">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar name={fullName} src={studentAvatarUrl(s) ?? (s.profile ? avatarUrl(s.profile) : null)} className="h-9 w-9 text-xs" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {s.prefix && `${s.prefix} `}
                                {fullName}
                              </p>
                              <p className="font-mono text-xs tabular-nums text-muted-foreground">{s.student_code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-0">
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${levelTone(gradeLabel)}`}>{gradeLabel ?? "—"}</span>
                        </td>
                        <td className="px-4 py-0 text-muted-foreground">{s.phone ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <TeacherSheet teacherId={viewingTeacherId} classrooms={viewingTeacherId ? classroomLabelsOf(viewingTeacherId) : []} onClose={() => setViewingTeacherId(null)} />
      <EditStudentSheet target={viewingStudent} onClose={() => setViewingStudent(null)} forceReadOnly />
    </div>
  );
}

/** Homeroom teacher drawer — contact-level info only. */
function TeacherSheet({ teacherId, classrooms, onClose }: { teacherId: string | null; classrooms: string[]; onClose: () => void }) {
  const { data: t, isLoading } = useTeacherContact(teacherId);
  const { data: departments = [] } = useDepartments();
  const { data: areas = [] } = useLearningAreas();
  const name = t ? `${t.prefix ?? ""}${t.first_name} ${t.last_name}` : "";
  const rows: [string, React.ReactNode][] = t
    ? [
        ["รหัสครู", t.teacher_code ?? "—"],
        ["แผนก", departments.find((d) => d.id === t.department_id)?.name ?? "—"],
        ["กลุ่มสาระ", areas.find((a) => a.id === t.learning_area_id)?.name ?? "—"],
        ["เบอร์โทรศัพท์", t.phone ? <a href={`tel:${t.phone}`} className="text-accent">{t.phone}</a> : "—"],
        ["อีเมล", t.email ? <a href={`mailto:${t.email}`} className="break-all text-accent">{t.email}</a> : "—"],
        ["ครูประจำชั้น", classrooms.length ? classrooms.join(", ") : "—"],
      ]
    : [];
  return (
    <Sheet open={teacherId !== null} onOpenChange={(o) => !o && onClose()} title="ครูประจำชั้น" bottomOnPhone closable>
      {isLoading || !t ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={`${t.first_name} ${t.last_name}`} src={avatarUrl(t)} className="h-14 w-14 text-base" />
            <p className="min-w-0 text-base font-semibold">{name}</p>
          </div>
          <dl className="divide-y divide-border rounded-xl bg-muted px-4 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 py-3">
                <dt className="shrink-0">{k}</dt>
                <dd className="min-w-0 text-right text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Sheet>
  );
}
