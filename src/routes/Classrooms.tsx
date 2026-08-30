import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { HomeIcon } from "@/components/icons";
import { EmptyState, Input, Pagination, Select, Spinner } from "@/components/ui";
import { useActiveAcademicYear } from "@/hooks/useAcademicTerms";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { usePagination } from "@/hooks/usePagination";
import { useDepartments } from "@/hooks/useProfiles";
import { useProfilesByIds } from "@/hooks/usePractice";
import {
  useClassroomsByDepartment,
  useCurrentClassroomEnrollmentsByDepartment,
  useHomeroomClassroomsByTeacher,
  useHomeroomTeachersByDepartment,
} from "@/hooks/useStatusManagement";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { isOrgWide } from "@/lib/roles";

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
  const teacherNameById = new Map(teacherProfiles.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const teacherByClassroomId = new Map(homeroomTeachers.map((h) => [h.classroom_id, h.teacher_id]));

  const gradeLevelById = new Map(gradeLevels.map((g) => [g.id, g]));
  const studentCountByClassroomId = new Map<string, number>();
  for (const e of enrollments) {
    studentCountByClassroomId.set(e.classroom_id, (studentCountByClassroomId.get(e.classroom_id) ?? 0) + 1);
  }

  const [search, setSearch] = useState("");
  const searchTerm = search.trim().toLowerCase();

  const scoped = isHomeroomTeacherOnly
    ? classrooms.filter((c) => myHomeroomClassroomIds.includes(c.id))
    : classrooms;
  const filtered = searchTerm
    ? scoped.filter((c) => {
        const grade = gradeLevelById.get(c.grade_level_id);
        const hay = `${grade ? gradeShortLabel(grade.code) : ""} ${c.name}`.toLowerCase();
        return hay.includes(searchTerm);
      })
    : scoped;
  const sorted = [...filtered].sort((a, b) => {
    const gradeA = gradeLevelById.get(a.grade_level_id)?.sort_order ?? Infinity;
    const gradeB = gradeLevelById.get(b.grade_level_id)?.sort_order ?? Infinity;
    if (gradeA !== gradeB) return gradeA - gradeB;
    return a.name.localeCompare(b.name);
  });

  const { page, setPage, pageCount, pageRows } = usePagination(sorted, [departmentId, search]);

  const department = departments.find((d) => d.id === departmentId);

  return (
    <div className="page-fill">
      <div className="shrink-0 space-y-1.5">
        <div className="flex gap-2">
          {orgWide && (
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
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาห้องเรียน"
              aria-label="ค้นหาห้องเรียน"
            />
          </div>
        </div>
      </div>

      {orgWide && !departmentId ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title="เลือกแผนก" description="เลือกแผนกเพื่อดูรายชื่อห้องเรียนทั้งหมด" icon={HomeIcon} />
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-5 w-5 text-muted-foreground" />
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
                  const teacherId = teacherByClassroomId.get(c.id);
                  const teacherName = teacherId ? teacherNameById.get(teacherId) : null;
                  const studentCount = studentCountByClassroomId.get(c.id) ?? 0;
                  return (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-3 py-3">
                        {grade && (
                          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                            {gradeShortLabel(grade.code)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {grade ? `${gradeShortLabel(grade.code)}/${c.name}` : c.name}
                      </td>
                      <td className="px-3 py-3">{department?.name ?? "—"}</td>
                      <td className="px-3 py-3">{teacherName ?? "—"}</td>
                      <td className="px-3 py-3">{studentCount}</td>
                      <td className="px-3 py-3">
                        <span
                          className={
                            c.is_active
                              ? "rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] text-success"
                              : "rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          }
                        >
                          {c.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
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
    </div>
  );
}
