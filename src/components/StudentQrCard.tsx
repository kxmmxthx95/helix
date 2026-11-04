import JsBarcode from "jsbarcode";
import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Button, Spinner } from "@/components/ui";
import { useIssueQr, useSetFrozen, useStudentQr } from "@/hooks/useCardTopup";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");

function useBarcodeImage(token: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return setSrc(null);
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, token, { format: "CODE128", width: 2, height: 110, margin: 16, displayValue: false });
    setSrc(canvas.toDataURL("image/png"));
  }, [token]);
  return src;
}

/**
 * บาร์โค้ดชำระเงิน — the student's POS credential (migration 0117). `admin` adds issue / reissue / freeze / print;
 * without it (parent, student) the barcode is view-only, with a full-screen view for the scanner.
 */
export function StudentQrCard({ studentId, studentName, admin = false }: { studentId: string; studentName: string; admin?: boolean }) {
  const toast = useToast();
  const { data: qr, isLoading } = useStudentQr(studentId);
  const issue = useIssueQr();
  const setFrozen = useSetFrozen();
  const [big, setBig] = useState(false);
  const frozen = qr?.status === "frozen";
  const src = useBarcodeImage(qr && !frozen ? qr.token : null);

  async function run(p: Promise<unknown>) {
    try {
      await p;
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  function print() {
    if (!src) return;
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    w.document.write(`<title>${studentName}</title><body style="text-align:center;font-family:sans-serif"><img src="${src}" style="width:360px"><p>${studentName}</p><script>onload=()=>print()</script>`);
    w.document.close();
  }

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-3">
      {qr ? (
        <div className="flex flex-col items-center gap-2">
          {src ? (
            <button type="button" aria-label="ขยายบาร์โค้ด" onClick={() => setBig(true)} className="rounded-xl border border-border bg-white p-1">
              <img src={src} alt={`บาร์โค้ดชำระเงินของ ${studentName}`} className="w-72 max-w-full" />
            </button>
          ) : (
            <p className="flex h-24 w-72 max-w-full items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
              {frozen ? (qr.frozen_by === "school" ? "บาร์โค้ดถูกระงับโดยโรงเรียน" : "บาร์โค้ดถูกระงับ") : "…"}
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">ยังไม่มีบาร์โค้ดชำระเงิน</p>
      )}

      {admin && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant={qr ? "outline" : "default"}
            disabled={issue.isPending}
            onClick={() => {
              if (qr && !window.confirm("สร้างบาร์โค้ดใหม่? บาร์โค้ดเดิมจะใช้ไม่ได้ทันที")) return;
              void run(issue.mutateAsync(studentId));
            }}
          >
            {qr ? "สร้างบาร์โค้ดใหม่" : "สร้างบาร์โค้ด"}
          </Button>
          {qr && (
            <Button type="button" variant="outline" disabled={setFrozen.isPending} onClick={() => void run(setFrozen.mutateAsync({ student_id: studentId, frozen: !frozen }))}>
              {frozen ? "เปิดใช้บาร์โค้ด" : "ระงับบาร์โค้ด"}
            </Button>
          )}
          {src && (
            <>
              <a href={src} download={`barcode-${studentName}.png`} className="inline-flex">
                <Button type="button" variant="outline" tabIndex={-1}>
                  บันทึกรูป
                </Button>
              </a>
              <Button type="button" variant="outline" onClick={print}>
                พิมพ์
              </Button>
            </>
          )}
        </div>
      )}

      <Modal open={big && !!src} onOpenChange={setBig} title={studentName} description="ยื่นให้เครื่องสแกนที่จุดขาย">
        {src && <img src={src} alt="บาร์โค้ดชำระเงิน" className="mx-auto w-full max-w-sm rounded-xl bg-white" />}
      </Modal>
    </div>
  );
}
