import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";

/** In-app confirmation pop-up (native confirm() is skipped or auto-accepted in some embedded browsers). */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "ลบ",
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      title={title}
      description={description}
      centered
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {null}
    </Modal>
  );
}
