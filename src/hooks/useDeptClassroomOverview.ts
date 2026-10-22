import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { profileFullName } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// Dashboard ผู้บริหารแผนก: ห้อง → วิชา (teaching_assignments) → บทเรียน/หัวข้อย่อย (ผังการเรียน, via
// plan_lesson_subjects tags, same grade level as the room). Read-only; scope comes from RLS.

export type OverviewLesson = { id: string; name: string; topics: { id: string; name: string }[] };
export type OverviewSubject = { id: string; name: string; areaId: string | null; teachers: string[]; lessons: OverviewLesson[] };
export type OverviewClassroom = { id: string; name: string; gradeCode: string; subjects: OverviewSubject[] };

type Teacher = { prefix: string | null; first_name: string; last_name: string };
type AssignmentRow = {
  subject_id: string;
  subject: { name_th: string; learning_area_id: string | null };
  teacher: Teacher | null;
  classroom: { id: string; name: string; grade_level: { id: string; code: string; name: string; sort_order: number } };
};
type TagRow = {
  subject_id: string;
  lesson: {
    id: string;
    grade_level_id: string;
    name: string;
    sort_order: number;
    topics: { id: string; name: string; sort_order: number }[];
  };
};

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

export function useDeptClassroomOverview(departmentId: string | null, academicYear: number | null, term: number | null) {
  return useQuery({
    queryKey: ["dept_classroom_overview", departmentId, academicYear, term],
    enabled: !!departmentId && academicYear != null,
    queryFn: async (): Promise<OverviewClassroom[]> => {
      let q = supabase
        .from("teaching_assignments")
        .select(
          "subject_id, subject:subjects!inner(name_th, learning_area_id), teacher:profiles(prefix, first_name, last_name), classroom:classrooms!inner(id, name, grade_level:grade_levels!inner(id, code, name, sort_order, department_id))",
        )
        .eq("classroom.grade_level.department_id", departmentId!)
        .eq("classroom.is_active", true)
        .eq("academic_year", academicYear!);
      q = term === null ? q.is("term", null) : q.eq("term", term);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data as unknown as AssignmentRow[];

      const subjectIds = [...new Set(rows.map((r) => r.subject_id))];
      let tags: TagRow[] = [];
      if (subjectIds.length) {
        const { data: t, error: tErr } = await supabase
          .from("plan_lesson_subjects")
          .select("subject_id, lesson:plan_lessons!inner(id, grade_level_id, name, sort_order, topics:plan_topics(id, name, sort_order))")
          .in("subject_id", subjectIds);
        if (tErr) throw tErr;
        tags = t as unknown as TagRow[];
      }

      const rooms = new Map<string, { gradeSort: number; gradeCode: string; label: string; subjects: Map<string, OverviewSubject> }>();
      for (const r of rows) {
        const { classroom: c } = r;
        const room = rooms.get(c.id) ?? { gradeSort: c.grade_level.sort_order, gradeCode: c.grade_level.code, label: `${c.grade_level.name}/${c.name}`, subjects: new Map() };
        rooms.set(c.id, room);
        const subject =
          room.subjects.get(r.subject_id) ??
          {
            id: r.subject_id,
            name: r.subject.name_th,
            areaId: r.subject.learning_area_id,
            teachers: [],
            lessons: tags
              .filter((t) => t.subject_id === r.subject_id && t.lesson.grade_level_id === c.grade_level.id)
              .map((t) => t.lesson)
              .sort(bySort)
              .map((l) => ({ id: l.id, name: l.name, topics: [...l.topics].sort(bySort) })),
          };
        room.subjects.set(r.subject_id, subject);
        if (r.teacher) subject.teachers.push(profileFullName(r.teacher));
      }

      return [...rooms.entries()]
        .sort(([, a], [, b]) => a.gradeSort - b.gradeSort || a.label.localeCompare(b.label, "th", { numeric: true }))
        .map(([id, room]) => ({
          id,
          name: room.label,
          gradeCode: room.gradeCode,
          subjects: [...room.subjects.values()].sort((a, b) => a.name.localeCompare(b.name, "th")),
        }));
    },
  });
}

// ------------------------------------------------------------- hidden subjects (migration 0097)
// Per-user list of subjects hidden from the overview, applied to every room.

const hiddenKey = (profileId: string | null) => ["dept_overview_hidden_subjects", profileId] as const;

export function useHiddenOverviewSubjects(profileId: string | null) {
  return useQuery({
    queryKey: hiddenKey(profileId),
    enabled: !!profileId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from("dept_overview_hidden_subjects").select("subject_id");
      if (error) throw error;
      return data.map((r) => r.subject_id);
    },
  });
}

/** Apply a batch edit: `hide` ids are added to the hidden list, `show` ids removed. */
export function useSetHiddenOverviewSubjects(profileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ hide, show }: { hide: string[]; show: string[] }) => {
      if (hide.length) {
        const { error } = await supabase
          .from("dept_overview_hidden_subjects")
          .upsert(hide.map((subject_id) => ({ profile_id: profileId, subject_id })));
        if (error) throw error;
      }
      if (show.length) {
        const { error } = await supabase
          .from("dept_overview_hidden_subjects")
          .delete()
          .eq("profile_id", profileId)
          .in("subject_id", show);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: hiddenKey(profileId) }),
  });
}
