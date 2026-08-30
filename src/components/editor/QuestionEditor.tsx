import { useListToolbarButton, useListToolbarButtonState } from "@platejs/list/react";
import { insertInlineEquation } from "@platejs/math";
import { insertImageFromFiles } from "@platejs/media";
import type { Value } from "platejs";
import { Plate, PlateContent, useEditorRef, usePlateEditor } from "platejs/react";
import { useRef, useState } from "react";
import { BoldIcon, FormulaIcon, HighlightIcon, ImageIcon, ItalicIcon, ListIcon, UnderlineIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { examQuestionPlugins } from "./plateConfig";
import { FormulaDrawer } from "./FormulaDrawer";

/**
 * Controlled Plate.js editor for the โจทย์ field —
 * bold/italic/underline/highlight/bullet-list/KaTeX formula/image.
 *
 * ensureQuestionId resolves (creating a draft row on first call if needed)
 * the question id an uploaded image's storage path attaches to — see
 * examQuestionPlugins in plateConfig for why this can't just be a plain id.
 *
 * compact drops every button but formula/image and shrinks the box — for a
 * short field like an answer choice, where a full toolbar + 192px box per
 * option (times 4+ choices) would dwarf the actual question.
 */
export function QuestionEditor({
  value,
  onChange,
  ensureQuestionId,
  compact = false,
  placeholder = "พิมพ์โจทย์…",
}: {
  value: Value;
  onChange: (value: Value) => void;
  ensureQuestionId: () => Promise<string>;
  compact?: boolean;
  placeholder?: string;
}) {
  const toast = useToast();
  const editor = usePlateEditor({ plugins: examQuestionPlugins(ensureQuestionId, (message) => toast(message, "error")), value });

  return (
    <Plate editor={editor} onChange={({ value: next }) => onChange(next)}>
      <Toolbar compact={compact} />
      <PlateContent
        className={cn(
          "rounded-lg border border-input bg-background px-2.5 py-2 text-xs outline-none transition-colors focus-visible:border-ring",
          compact ? "min-h-9" : "min-h-48",
        )}
        placeholder={placeholder}
      />
    </Plate>
  );
}

/** useListToolbarButtonState/useEditorRef need the Plate store from context — must render as a child of <Plate>, not alongside it. */
function Toolbar({ compact }: { compact: boolean }) {
  const editor = useEditorRef();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const listState = useListToolbarButtonState({ nodeType: "disc" });
  const listButton = useListToolbarButton(listState);

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-0.5 p-1">
      {!compact && (
        <>
          <Button size="icon" variant="ghost" aria-label="ตัวหนา" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.tf.toggleMark("bold")}>
            <BoldIcon className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="ตัวเอียง" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.tf.toggleMark("italic")}>
            <ItalicIcon className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="ขีดเส้นใต้" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.tf.toggleMark("underline")}>
            <UnderlineIcon className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="ไฮไลต์" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.tf.toggleMark("highlight")}>
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
        </>
      )}
      <Button
        size="icon"
        variant="ghost"
        aria-label="สูตร"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setFormulaOpen(true)}
      >
        <FormulaIcon className="h-3 w-3" />
      </Button>
      <FormulaDrawer
        open={formulaOpen}
        onOpenChange={setFormulaOpen}
        onInsert={(latex) => insertInlineEquation(editor, latex)}
      />
      <Button
        size="icon"
        variant="ghost"
        aria-label="แทรกรูปภาพ"
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
  );
}
