import { DocumentTextIcon } from "@/components/icons";
import { subjectShade, type AreaHue } from "@/lib/subjectColor";
import { cn } from "@/lib/utils";

// Tile colour by file type: PDF red, images green, Word blue, Excel/CSV cyan, PowerPoint orange, else grey.
const HUE_BY_EXT: Record<string, AreaHue> = {
  pdf: "rose",
  jpg: "emerald",
  jpeg: "emerald",
  png: "emerald",
  gif: "emerald",
  webp: "emerald",
  heic: "emerald",
  doc: "blue",
  docx: "blue",
  xls: "cyan",
  xlsx: "cyan",
  csv: "cyan",
  ppt: "orange",
  pptx: "orange",
};

export const fileExt = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

/** 44px file-type tile: document icon over the extension, tinted by type. */
export function FileTile({ fileName, className }: { fileName: string; className?: string }) {
  const ext = fileExt(fileName);
  const hue = HUE_BY_EXT[ext];
  return (
    <span
      className={cn(
        "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl",
        hue ? subjectShade(hue, 1) : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <DocumentTextIcon className="h-4 w-4" />
      <span className="text-[9px] font-medium uppercase">{ext.slice(0, 4) || "FILE"}</span>
    </span>
  );
}
