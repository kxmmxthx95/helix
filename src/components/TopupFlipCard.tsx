import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { useBarcodeImage } from "@/components/StudentQrCard";
import { Avatar } from "@/components/ui";
import { studentAvatarUrl } from "@/hooks/useAvatar";
import { useGradeLevels } from "@/hooks/useCurriculumStructure";
import { useStudentQr, type PortalStudent } from "@/hooks/useCardTopup";
import { useDepartments } from "@/hooks/useProfiles";
import { gradeShortLabel } from "@/lib/gradeLevels";
import { cn } from "@/lib/utils";

const FACE = "absolute inset-0 overflow-hidden rounded-3xl shadow-xl";

/**
 * Phone-only top-up card: tap to flip. Front = student details + payment barcode,
 * back = the top-up barcode (student code).
 */
export function TopupFlipCard({ kid }: { kid: PortalStudent }) {
  const reduce = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const { data: qr } = useStudentQr(kid.id);
  const frozen = qr?.status === "frozen";
  const barcode = useBarcodeImage(qr && !frozen ? qr.token : null, 6);
  const { data: departments = [] } = useDepartments();
  const { data: grades = [] } = useGradeLevels(kid.department_id);
  // Back = top-up barcode (the student code: not a secret, can only add money), shown even when the payment barcode is frozen.
  const topupBarcode = useBarcodeImage(kid.student_code, 6);
  const dept = departments.find((d) => d.id === kid.department_id)?.name;
  const grade = grades.find((g) => g.id === kid.grade_level_id);
  const toggle = () => setFlipped((f) => !f);

  const front = (
    <div className={cn(FACE, "flex flex-col justify-between gap-3 p-4 text-white")} style={{ backgroundImage: "linear-gradient(135deg,#ff7aa8,#ff2d55 60%,#c026d3)", backfaceVisibility: "hidden" }} aria-hidden={flipped}>
      <div className="flex items-center gap-3">
        <Avatar name={`${kid.first_name} ${kid.last_name}`} src={studentAvatarUrl(kid)} className="size-12 shrink-0 text-base ring-2 ring-white/70" />
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-bold leading-tight">
            {kid.first_name} {kid.last_name}
          </p>
          <p className="truncate text-xs text-white/85">
            {kid.student_code} · {[dept, grade && gradeShortLabel(grade.code)].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <div className="rounded-xl bg-white px-1 py-1.5">
        {barcode ? (
          <img src={barcode} alt={`บาร์โค้ดชำระเงินของ ${kid.first_name}`} className="mx-auto h-16 w-full object-contain" />
        ) : (
          <p className="flex h-16 items-center justify-center text-center text-xs text-neutral-500">
            {!qr ? "ยังไม่มีบาร์โค้ด — ติดต่อโรงเรียน" : frozen ? (qr.frozen_by === "school" ? "บาร์โค้ดถูกระงับโดยโรงเรียน" : "บาร์โค้ดถูกระงับ") : "…"}
          </p>
        )}
      </div>
    </div>
  );

  const back = (
    <div className={cn(FACE, "flex items-center justify-center bg-white p-3")} style={{ transform: reduce ? undefined : "rotateY(180deg)", backfaceVisibility: "hidden" }} aria-hidden={!flipped}>
      <div className="w-full space-y-2 text-center">
        <p className="text-sm font-semibold text-neutral-900">บาร์โค้ดเติมเงิน</p>
        {topupBarcode && <img src={topupBarcode} alt={`บาร์โค้ดเติมเงินของ ${kid.first_name}`} className="mx-auto h-20 w-full object-contain" />}
        <p className="text-xs text-neutral-500">รหัส {kid.student_code} · ให้แคชเชียร์สแกนเพื่อเติมเงิน</p>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-sm" style={{ perspective: 1200 }}>
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={flipped ? "บัตรเติมเงิน ด้านหลัง (บาร์โค้ดเติมเงิน) แตะเพื่อพลิกกลับ" : "บัตรเติมเงิน ด้านหน้า แตะเพื่อดูบาร์โค้ดเติมเงิน"}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            toggle();
          }
        }}
        className="relative aspect-[1.586/1] w-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: reduce ? 0 : flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 18 }}
      >
        {reduce ? (flipped ? back : front) : (
          <>
            {front}
            {back}
          </>
        )}
      </motion.div>
    </div>
  );
}
