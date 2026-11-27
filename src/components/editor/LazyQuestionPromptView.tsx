import type { Value } from "platejs";
import { lazy, Suspense } from "react";

// The rich-text engine behind a question prompt (Plate, formulas, images) is ~800 KB: keep it out of the exam page's own chunk.
const load = () => import("@/components/editor/QuestionPromptView").then((m) => ({ default: m.QuestionPromptView }));
const Inner = lazy(load);

/** Start downloading the viewer ahead of its first use (call when a list is about to open, or when a student's exam page mounts). */
export const preloadQuestionPromptView = () => void load().catch(() => {}); // a failed warm-up must not become an unhandled rejection; the real render reports its own error

/** Same as QuestionPromptView, loaded on demand; shows a small placeholder until it is ready. */
export function QuestionPromptView({ value }: { value: Value }) {
  return (
    <Suspense fallback={<span aria-hidden className="inline-block h-4 w-24 animate-pulse rounded bg-muted align-middle" />}>
      <Inner value={value} />
    </Suspense>
  );
}
