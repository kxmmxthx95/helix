import { BoldPlugin, HighlightPlugin, ItalicPlugin, UnderlinePlugin } from "@platejs/basic-nodes/react";
import { ListPlugin } from "@platejs/list/react";
import { EquationPlugin, InlineEquationPlugin } from "@platejs/math/react";
import { ImagePlugin } from "@platejs/media/react";
import type { Value } from "platejs";
import { ParagraphPlugin } from "platejs/react";
import { uploadExamQuestionImage } from "@/hooks/useExamBank";
import { EquationElement } from "./EquationElement";
import { ImageElement } from "./ImageElement";
import { BoldLeaf, HighlightLeaf, ItalicLeaf, UnderlineLeaf } from "./marks";
import { ParagraphElement } from "./ParagraphElement";

export const EMPTY_PROMPT: Value = [{ type: "p", children: [{ text: "" }] }];

/**
 * Shared by the authoring editor and the read-only view — same plugin set
 * both places so rendering can never drift between the two. Formula (KaTeX)
 * and image nodes only need a display component; only ImagePlugin needs the
 * upload hook.
 *
 * ensureQuestionId resolves the row an uploaded image's storage path attaches
 * to — a plain fixed id doesn't work here because Plate's ImagePlugin also
 * uploads on clipboard paste (see withImageUpload in @platejs/media),
 * bypassing the toolbar button's disabled-until-saved guard, so a new
 * question needs to lazily create its draft row right here on first upload
 * rather than reject. Defaults to always-rejecting for the read-only view,
 * which never edits so never uploads. onImageError surfaces failures from
 * every insert path since Plate itself doesn't catch uploadImage rejections.
 */
export function examQuestionPlugins(
  ensureQuestionId: () => Promise<string> = () => Promise.reject(new Error("อ่านอย่างเดียว")),
  onImageError?: (message: string) => void,
) {
  return [
    ParagraphPlugin.withComponent(ParagraphElement),
    BoldPlugin.withComponent(BoldLeaf),
    ItalicPlugin.withComponent(ItalicLeaf),
    UnderlinePlugin.withComponent(UnderlineLeaf),
    HighlightPlugin.withComponent(HighlightLeaf),
    ListPlugin,
    EquationPlugin.withComponent(EquationElement),
    InlineEquationPlugin.withComponent(EquationElement),
    ImagePlugin.configure({
      options: {
        uploadImage: async (dataUrl) => {
          try {
            const questionId = await ensureQuestionId();
            return await uploadExamQuestionImage(dataUrl as string, questionId);
          } catch (err) {
            onImageError?.(err instanceof Error ? err.message : "แทรกรูปไม่สำเร็จ");
            throw err;
          }
        },
      },
    }).withComponent(ImageElement),
  ];
}
