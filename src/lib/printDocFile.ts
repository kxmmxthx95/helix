import { docFileSignedUrl } from "@/hooks/useDocuments";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

export type PrintResult = "printing" | "opened" | "error";

/**
 * Opens the browser print dialog for a stored document. The bucket is private and cross-origin, so the file is
 * fetched into a same-origin blob and printed from a hidden iframe. Only PDFs and images can be printed this
 * way; any other type is opened in a new tab instead (the user prints it from its own app).
 */
export async function printDocFile(path: string, fileName: string): Promise<PrintResult> {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const mime = MIME_BY_EXT[ext];
  // A blank tab must be opened synchronously (popup blockers) — only needed for the fallback.
  const tab = mime ? null : window.open("", "_blank");

  const url = await docFileSignedUrl(path);
  if (!url) {
    tab?.close();
    return "error";
  }
  if (!mime) {
    if (tab) tab.location.href = url;
    else window.location.href = url;
    return "opened";
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return "error";
    const blobUrl = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: mime }));
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    const cleanup = () => {
      frame.remove();
      URL.revokeObjectURL(blobUrl);
    };
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        // the dialog is modal in most browsers; keep the frame a while for those where it is not.
        setTimeout(cleanup, 60_000);
      }
    };
    frame.src = blobUrl;
    document.body.appendChild(frame);
    return "printing";
  } catch {
    return "error";
  }
}
