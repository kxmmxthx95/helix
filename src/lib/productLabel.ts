import JsBarcode from "jsbarcode";
import type { PosProduct } from "@/lib/database.types";

type Labelled = Pick<PosProduct, "code" | "name" | "price">;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function barcodeSvg(code: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, code, { format: "CODE128", height: 50, fontSize: 14, margin: 4 });
  svg.setAttribute("style", "width:100%;height:auto");
  return svg.outerHTML;
}

/** Prints labels from a hidden iframe so the app's own page styles never leak in. One product = one label; many = A4 sheet, 3 per row. */
export function printLabels(products: Labelled[]) {
  const labels = products
    .map(
      (p) => `<div class="l"><div class="n">${esc(p.name)}</div>${barcodeSvg(p.code)}<div class="p">${p.price} บาท</div></div>`,
    )
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    @page{size:A4;margin:8mm}
    body{margin:0;font-family:system-ui,"Noto Sans Thai",sans-serif}
    .g{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
    .l{border:.3mm dashed #999;padding:3mm;text-align:center;break-inside:avoid}
    .n{font-size:11pt;font-weight:600;line-height:1.2}.p{font-size:13pt;font-weight:700}
  </style><div class="g">${labels}</div>`;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

/** Label as a PNG file (name, barcode, price) for other label-printing software. */
export function downloadLabelPng(p: Labelled) {
  const bars = document.createElement("canvas");
  JsBarcode(bars, p.code, { format: "CODE128", height: 120, fontSize: 28, margin: 12 });
  const w = Math.max(bars.width, 480);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = bars.height + 150;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#000";
  g.textAlign = "center";
  g.font = "600 36px system-ui, 'Noto Sans Thai', sans-serif";
  g.fillText(p.name, w / 2, 52, w - 24);
  g.drawImage(bars, (w - bars.width) / 2, 70);
  g.font = "700 44px system-ui, 'Noto Sans Thai', sans-serif";
  g.fillText(`${p.price} บาท`, w / 2, c.height - 20);
  c.toBlob((b) => {
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `${p.code}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
}
