import { useListToolbarButton, useListToolbarButtonState } from "@platejs/list/react";
import { insertInlineEquation } from "@platejs/math";
import { insertImageFromFiles } from "@platejs/media";
import type { Value } from "platejs";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";
import { useRef } from "react";
import { BoldIcon, FormulaIcon, HighlightIcon, ImageIcon, ListIcon, UnderlineIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { examQuestionPlugins } from "./plateConfig";

/** Controlled Plate.js editor for the โจทย์ field — bold/underline/highlight/bullet-list/KaTeX formula/image. Image upload needs a saved question id, see the toolbar's disabled state below. */
export function QuestionEditor({
  value,
  onChange,
  questionId,
}: {
  value: Value;
  onChange: (value: Value) => void;
  questionId: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editor = usePlateEditor({ plugins: examQuestionPlugins(questionId), value });
  const listState = useListToolbarButtonState({ nodeType: "disc" });
  const listButton = useListToolbarButton(listState);

  return (
    <Plate editor={editor} onChange={({ value: next }) => onChange(next)}>
      <div className="mb-1.5 flex flex-wrap items-center gap-0.5 rounded-lg border border-border p-1">
        <Button size="icon" variant="ghost" aria-label="ตัวหนา" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.tf.bold.toggle()}>
          <BoldIcon className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" aria-label="ขีดเส้นใต้" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.tf.underline.toggle()}>
          <UnderlineIcon className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" aria-label="ไฮไลต์" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.tf.highlight.toggle()}>
          <HighlightIcon className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="รายการ"
          aria-pressed={listButton.props.pressed}
          onClick={listButton.props.onClick}
          onMouseDown={listButton.props.onMouseDown}
        >
          <ListIcon className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="สูตร"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const tex = window.prompt("สูตร (LaTeX)");
            if (tex) insertInlineEquation(editor, tex);
          }}
        >
          <FormulaIcon className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="แทรกรูปภาพ"
          disabled={!questionId}
          title={questionId ? undefined : "บันทึกข้อสอบก่อนจึงจะแทรกรูปได้"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="h-3 w-3" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) insertImageFromFiles(editor, e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <PlateContent
        className="min-h-24 rounded-lg border border-input bg-background px-2.5 py-2 text-xs outline-none transition-colors focus-visible:border-ring"
        placeholder="พิมพ์โจทย์…"
      />
    </Plate>
  );
}
