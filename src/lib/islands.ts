import { useMemo } from "react";
import {
  assignmentStatus,
  useMyAssignments,
  useMyItemScores,
  useMySubmissions,
  type MyAssignment,
} from "@/hooks/useAssignments";
import { useLearningAreas } from "@/hooks/useCurriculum";
import { useSubjectsByIds } from "@/hooks/useExamBank";
import { useMyCurrentClassroom } from "@/hooks/useExams";
import { useMySubjects } from "@/hooks/usePractice";
import type {
  AssignmentSubmission,
  LearningArea,
  Student,
  Subject,
} from "@/lib/database.types";

export type IslandSubject = Pick<
  Subject,
  "id" | "code" | "name_th" | "learning_area_id"
>;
export type Island = {
  subject: IslandSubject;
  areaCode: string;
  total: number;
  submitted: number;
  pending: MyAssignment[];
  next: MyAssignment | null;
};

/** areaCodes: learning_area_id -> code (sub-areas already resolved to the parent's code). */
export function areaCodeMap(
  areas: Pick<LearningArea, "id" | "code" | "parent_id">[],
): Map<string, string> {
  const byId = new Map(areas.map((a) => [a.id, a]));
  return new Map(
    areas.map((a) => [
      a.id,
      (a.parent_id ? byId.get(a.parent_id)?.code : null) ?? a.code,
    ]),
  );
}

const dueKey = (a: MyAssignment) => a.due_date ?? "9999-12-31";

export function islandsFor(
  subjects: IslandSubject[],
  assignments: MyAssignment[],
  submissions: Map<string, AssignmentSubmission>,
  scores: Map<string, unknown> = new Map(),
  areaCodes: Map<string, string> = new Map(),
): Island[] {
  const islands = subjects.map((subject): Island => {
    const mine = assignments.filter((a) => a.subjectId === subject.id);
    const status = (a: MyAssignment) =>
      assignmentStatus(a, submissions.get(a.id) ?? null, scores.has(a.id));
    const pending = mine
      .filter((a) => ["missing", "late"].includes(status(a)))
      .sort((a, b) => dueKey(a).localeCompare(dueKey(b)));
    return {
      subject,
      areaCode: areaCodes.get(subject.learning_area_id) ?? "other",
      total: mine.length,
      submitted: mine.length - pending.length,
      pending,
      next: pending[0] ?? null,
    };
  });
  return islands.sort((a, b) => {
    if (!a.next !== !b.next) return a.next ? -1 : 1;
    return a.next && b.next
      ? dueKey(a.next).localeCompare(dueKey(b.next)) ||
          a.subject.code.localeCompare(b.subject.code)
      : a.subject.code.localeCompare(b.subject.code);
  });
}

export function useMyIslands(student: Student | null) {
  const classroomQ = useMyCurrentClassroom(student?.id ?? null);
  const classroom = classroomQ.data;
  const subjectIdsQ = useMySubjects(
    classroom?.classroomId ?? null,
    classroom?.academicYear ?? null,
  );
  const subjectIds = subjectIdsQ.data ?? [];
  const subjectsQ = useSubjectsByIds(subjectIds);
  const subjects = subjectsQ.data;
  const { data: areas } = useLearningAreas();
  const { data: assignments } = useMyAssignments(student?.id ?? null);
  const { data: submissions } = useMySubmissions(student?.id ?? null);
  const { data: scores } = useMyItemScores(student?.id ?? null);
  const islands = useMemo(
    () =>
      islandsFor(
        subjects ?? [],
        assignments ?? [],
        submissions ?? new Map(),
        scores,
        areaCodeMap(areas ?? []),
      ),
    [subjects, assignments, submissions, scores, areas],
  );
  return {
    islands,
    // Disabled queries stay pending forever: only wait on the ones that can run (no classroom / no subjects = empty state).
    isLoading:
      !student ||
      classroomQ.isPending ||
      (!!classroom && subjectIdsQ.isPending) ||
      (subjectIds.length > 0 && subjectsQ.isPending) ||
      !assignments,
  };
}
