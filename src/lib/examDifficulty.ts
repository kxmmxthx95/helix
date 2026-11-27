import type { ExamQuestionDifficulty } from "@/lib/database.types";

/** Small on purpose: the exam pages need these labels without pulling in the whole question-bank editor. */
export const DIFFICULTY_LABEL: Record<ExamQuestionDifficulty, string> = {
  easy: "ง่าย",
  medium: "ปานกลาง",
  hard: "ยาก",
};

export const DIFFICULTY_BADGE_CLASS: Record<ExamQuestionDifficulty, string> = {
  easy: "bg-success/15 text-success",
  medium: "bg-accent/15 text-accent",
  hard: "bg-destructive/15 text-destructive",
};
