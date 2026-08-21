import { BoldPlugin, HighlightPlugin, UnderlinePlugin } from "@platejs/basic-nodes/react";
import { ListPlugin } from "@platejs/list/react";
import { EquationPlugin } from "@platejs/math/react";
import { ImagePlugin } from "@platejs/media/react";
import type { Value } from "platejs";
import { ParagraphPlugin } from "platejs/react";
import { uploadExamQuestionImage } from "@/hooks/useExamBank";
import { EquationElement } from "./EquationElement";
import { ImageElement } from "./ImageElement";
import { BoldLeaf, HighlightLeaf, UnderlineLeaf } from "./marks";
import { ParagraphElement } from "./ParagraphElement";

export const EMPTY_PROMPT: Value = [{ type: "p", children: [{ text: "" }] }];

/** Shared by the authoring editor and the read-only view — same plugin set both places so rendering can never drift between the two. Formula (KaTeX) and image nodes only need a display component; only ImagePlugin needs the upload hook, wired here once against a fixed question id (or null while a question hasn't been saved yet — see QuestionEditor). */
export function examQuestionPlugins(questionId: string | null) {
  return [
    ParagraphPlugin.withComponent(ParagraphElement),
    BoldPlugin.withComponent(BoldLeaf),
    UnderlinePlugin.withComponent(UnderlineLeaf),
    HighlightPlugin.withComponent(HighlightLeaf),
    ListPlugin,
    EquationPlugin.withComponent(EquationElement),
    ImagePlugin.configure({
      options: {
        uploadImage: async (dataUrl) => {
          if (!questionId) return dataUrl as string;
          return uploadExamQuestionImage(dataUrl as string, questionId);
        },
      },
    }).withComponent(ImageElement),
  ];
}
