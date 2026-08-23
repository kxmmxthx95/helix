import type { Value } from "platejs";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";
import { examQuestionPlugins } from "./plateConfig";

/** Read-only render of a question prompt — same plugin set as QuestionEditor so formulas/images can't render differently between authoring and the live exam screen. */
export function QuestionPromptView({ value }: { value: Value }) {
  const editor = usePlateEditor({ plugins: examQuestionPlugins(), value }, [value]);

  return (
    <Plate editor={editor} readOnly>
      <PlateContent readOnly className="outline-none" />
    </Plate>
  );
}
