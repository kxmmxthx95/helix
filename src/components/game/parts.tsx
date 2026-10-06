import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { GraduationCap } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { useSetCharacterClass } from "@/hooks/useStudents";
import { CHARACTER_CLASSES, characterSrc, isCharacterClass, type CharacterClass } from "@/lib/game";
import { cn } from "@/lib/utils";

/** Art lives in public/game/ (user-supplied); until a file exists the plain icon shows instead. */
export function GameIcon({
  name,
  fallback: Fallback,
  className,
}: {
  name: string;
  fallback: (p: { className?: string }) => React.JSX.Element;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Fallback className={className} />;
  return <img src={`/game/${name}.webp`} alt="" draggable={false} className={className} onError={() => setFailed(true)} />;
}

function CharacterArt({ cls, prefix, className }: { cls: CharacterClass; prefix: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={cn("flex items-center justify-center rounded-full bg-white/60 text-primary", className)}>
        <GraduationCap className="h-10" />
      </div>
    );
  }
  return (
    <img
      src={characterSrc(cls, prefix)}
      alt=""
      draggable={false}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

/** Idle bob + squash on tap. cls=null renders the silhouette that opens the picker. */
export function Character({
  cls,
  prefix,
  onClick,
  className,
}: {
  cls: CharacterClass | null;
  prefix: string | null;
  onClick?: () => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const controls = useAnimationControls();
  const silhouette = cls === null;

  return (
    <button
      type="button"
      aria-label={silhouette ? "เลือกอาชีพตัวละคร" : "ตัวละคร"}
      className={cn("relative flex flex-col items-center outline-none", className)}
      onClick={() => {
        if (!reduce) void controls.start({ y: [0, -36, 0], scaleY: [1, 0.9, 1.06, 1], transition: { duration: 0.5 } });
        onClick?.();
      }}
    >
      <motion.div animate={controls}>
        <motion.div
          animate={reduce ? undefined : { y: [0, -6, 0], scaleY: [1, 1.02, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          style={{ originY: 1 }}
        >
          <CharacterArt
            cls={cls ?? "math"}
            prefix={prefix}
            className={cn("h-[min(19rem,42dvh)] w-auto drop-shadow-lg", silhouette && "brightness-0 opacity-40")}
          />
        </motion.div>
      </motion.div>
      <div className="-mt-3 h-3 w-24 rounded-full bg-black/25 blur-sm" aria-hidden />
      {silhouette && (
        <span className="absolute inset-x-0 top-1/2 text-center text-sm font-bold text-white [text-shadow:0_2px_0_rgb(43_15_58)]">
          แตะเพื่อเลือกอาชีพ
        </span>
      )}
    </button>
  );
}

export function ClassPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { myStudent, refreshMyStudent } = useAuth();
  const toast = useToast();
  const save = useSetCharacterClass();
  if (!myStudent) return null;
  const current = isCharacterClass(myStudent.character_class) ? myStudent.character_class : null;

  function pick(characterClass: CharacterClass) {
    save.mutate(
      { studentId: myStudent!.id, characterClass },
      {
        onSuccess: async () => {
          await refreshMyStudent();
          onOpenChange(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="เลือกอาชีพตัวละคร">
      <div className="grid grid-cols-2 gap-3">
        {CHARACTER_CLASSES.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={save.isPending}
            onClick={() => pick(c.id)}
            className={cn(
              "tappable flex flex-col items-center gap-1 rounded-2xl border-2 bg-card p-2",
              current === c.id ? "border-primary" : "border-border",
            )}
          >
            <CharacterArt cls={c.id} prefix={myStudent.prefix} className="h-28 w-auto" />
            <span className="text-xs font-bold">{c.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
