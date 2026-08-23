import { useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { CharacterSprite } from "@/components/CharacterSprite";
import { useUpdateCharacterOptions } from "@/hooks/useProfiles";
import type { CharacterOptions } from "@/lib/database.types";
import {
  DEFAULT_CHARACTER_OPTIONS,
  HAIR_LABEL,
  HAIR_OPTIONS,
  HAT_LABEL,
  HAT_OPTIONS,
  OUTFIT_COLOR_OPTIONS,
  OUTFIT_SWATCH,
  randomCharacterOptions,
  SKIN_OPTIONS,
  SKIN_SWATCH,
} from "@/lib/characterSprite";
import { cn } from "@/lib/utils";

function Swatch({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ backgroundColor: color }}
      className={cn(
        "h-7 w-7 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform",
        selected ? "scale-110 ring-accent" : "ring-transparent",
      )}
      aria-label={color}
    />
  );
}

export function AvatarBuilder({
  open,
  onOpenChange,
  profileId,
  initialOptions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  initialOptions: CharacterOptions | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const update = useUpdateCharacterOptions();
  const [opts, setOpts] = useState<CharacterOptions>(initialOptions ?? DEFAULT_CHARACTER_OPTIONS);

  function save() {
    update.mutate(
      { id: profileId, options: opts },
      {
        onSuccess: () => {
          onSaved();
          onOpenChange(false);
        },
        onError: (err) => toast(err instanceof Error ? err.message : "บันทึกตัวละครไม่สำเร็จ", "error"),
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="สร้างตัวละคร"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setOpts(randomCharacterOptions())}>
            สุ่มใหม่
          </Button>
          <Button className="flex-1" onClick={save} disabled={update.isPending}>
            {update.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex justify-center">
          <CharacterSprite options={opts} scale={4} />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">สีผิว</p>
          <div className="flex gap-2">
            {SKIN_OPTIONS.map((s) => (
              <Swatch key={s} color={SKIN_SWATCH[s]} selected={opts.skin === s} onClick={() => setOpts({ ...opts, skin: s })} />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">ทรงผม</p>
          <div className="flex flex-wrap gap-1.5">
            {HAIR_OPTIONS.map((h) => (
              <Button
                key={h}
                size="xs"
                variant={opts.hair === h ? "accent" : "outline"}
                onClick={() => setOpts({ ...opts, hair: h })}
              >
                {HAIR_LABEL[h]}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">สีเสื้อผ้า</p>
          <div className="flex gap-2">
            {OUTFIT_COLOR_OPTIONS.map((c) => (
              <Swatch
                key={c}
                color={OUTFIT_SWATCH[c]}
                selected={opts.outfitColor === c}
                onClick={() => setOpts({ ...opts, outfitColor: c })}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">หมวก</p>
          <div className="flex flex-wrap gap-1.5">
            {HAT_OPTIONS.map((h) => (
              <Button
                key={h ?? "none"}
                size="xs"
                variant={opts.hat === h ? "accent" : "outline"}
                onClick={() => setOpts({ ...opts, hat: h })}
              >
                {h ? HAT_LABEL[h] : "ไม่มี"}
              </Button>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          ภาพตัวละครจาก Liberated Pixel Cup (CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0)
        </p>
      </div>
    </Sheet>
  );
}
