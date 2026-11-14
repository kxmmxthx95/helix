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

const GRADIENT = "linear-gradient(135deg,#ff7aa8,#ff2d55 60%,#c026d3)";
const FACE = "absolute inset-0 overflow-hidden rounded-3xl shadow-xl";

/** Credit-card style EMV chip, drawn in CSS: gold plate with contact grooves. */
function Chip() {
  return (
    <div aria-hidden className="my-auto h-9 w-12 self-end overflow-hidden rounded-md border border-amber-700/40 shadow-sm" style={{ backgroundImage: "linear-gradient(135deg,#fde68a,#d6a537 50%,#f5d57a)" }}>
      <div className="relative h-full w-full">
        <i className="absolute inset-x-0 top-1/3 border-t border-amber-800/40" />
        <i className="absolute inset-x-0 top-2/3 border-t border-amber-800/40" />
        <i className="absolute inset-y-0 left-1/3 border-l border-amber-800/40" />
        <i className="absolute inset-y-0 left-2/3 border-l border-amber-800/40" />
        <i className="absolute inset-[30%_33%] rounded-sm border border-amber-800/40" />
      </div>
    </div>
  );
}

/**
 * Phone-only top-up card: tap to flip. Front = student details, back = the payment barcode.
 */
export function TopupFlipCard({ kid }: { kid: PortalStudent }) {
  const reduce = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const { data: qr } = useStudentQr(kid.id);
  const frozen = qr?.status === "frozen";
  const barcode = useBarcodeImage(qr && !frozen ? qr.token : null, 0);
  const { data: departments = [] } = useDepartments();
  const { data: grades = [] } = useGradeLevels(kid.department_id);
  const dept = departments.find((d) => d.id === kid.department_id)?.name;
  const grade = grades.find((g) => g.id === kid.grade_level_id);
  const toggle = () => setFlipped((f) => !f);

  const front = (
    <div className={cn(FACE, "flex flex-col gap-3 p-4 text-white")} style={{ backgroundImage: GRADIENT, backfaceVisibility: "hidden" }} aria-hidden={flipped}>
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
      <Chip />
      <img src="/logo.webp" alt="Helix" className="h-6 w-auto self-start invert" />
    </div>
  );

  const back = (
    <div className={cn(FACE, "flex items-center justify-center p-4")} style={{ backgroundImage: GRADIENT, transform: reduce ? undefined : "rotateY(180deg)", backfaceVisibility: "hidden" }} aria-hidden={!flipped}>
      <div className="w-full rounded-xl bg-white px-3 py-3">
        {barcode ? (
          <>
            <img src={barcode} alt={`บาร์โค้ดชำระเงินของ ${kid.first_name}`} className="mx-auto h-28 w-full object-contain" />
            <p className="mt-1.5 break-all text-center font-mono text-xs tracking-[0.2em] text-neutral-700">{qr?.token}</p>
          </>
        ) : (
          <p className="flex h-16 items-center justify-center text-center text-xs text-neutral-500">
            {!qr ? "ยังไม่มีบาร์โค้ด — ติดต่อโรงเรียน" : frozen ? (qr.frozen_by === "school" ? "บาร์โค้ดถูกระงับโดยโรงเรียน" : "บาร์โค้ดถูกระงับ") : "…"}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-sm" style={{ perspective: 1200 }}>
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={flipped ? "บัตรเติมเงิน ด้านหลัง (บาร์โค้ด) แตะเพื่อพลิกกลับ" : "บัตรเติมเงิน ด้านหน้า แตะเพื่อดูบาร์โค้ด"}
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
