import { useMemo } from "react";
import { useExamQuestionsOf, type ExamQuestionWithChoices } from "@/hooks/useExamBank";
import { sheetProblems, sheetRows, type SheetRow } from "@/lib/answerSheet";

/** The questions of a room in exam order with what the answer sheet needs from them; only fetched while `enabled`. */
export function useAnswerSheetData(questionIds: string[], subjectIds: string[], enabled: boolean) {
  const { data: bank = [], isLoading } = useExamQuestionsOf(enabled ? [...new Set(subjectIds)] : []);
  return useMemo(() => {
    const byId = new Map(bank.map((q) => [q.id, q]));
    const ordered: ExamQuestionWithChoices[] = questionIds.map((id) => byId.get(id)).filter((q): q is ExamQuestionWithChoices => !!q);
    const rows: SheetRow[] = sheetRows(ordered);
    const loaded = enabled && !isLoading && ordered.length === questionIds.length;
    return {
      ordered,
      rows,
      /** Printed numbers of the short-answer questions the teacher marks by hand. */
      manualNumbers: ordered.flatMap((q, i) => (q.question_type === "short_answer" ? [i + 1] : [])),
      loaded,
      problems: loaded ? sheetProblems(rows) : [],
    };
  }, [bank, isLoading, questionIds, enabled]);
}
