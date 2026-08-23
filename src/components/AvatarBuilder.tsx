import { useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { useUploadAvatar } from "@/hooks/useAvatar";
import { compressImage } from "@/lib/image";
import {
  BG_COLORS,
  characterAvatarToFile,
  HAIR_COLORS,
  HAIR_STYLES,
  randomCharacterAvatar,
  renderCharacterAvatarSvg,
  SKIN_TONES,
  type CharacterAvatar,
} from "@/lib/characterAvatar";
import { cn } from "@/lib/utils";

const HAIR_STYLE_LABELS: Record<CharacterAvatar["hairStyle"], string> = {
  short: "สั้น",
  bowl: "ทรงหมวก",
  spiky: "ทรงหนาม",
  long: "ยาว",
  bald: "ไม่มีผม",
};

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
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  onSaved: () => void;
}) {
  const toast = useToast();
  const uploadAvatar = useUploadAvatar();
  const [opts, setOpts] = useState<CharacterAvatar>(randomCharacterAvatar);
  const svg = renderCharacterAvatarSvg(opts);
  const previewUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  async function save() {
    try {
      const blob = await compressImage(characterAvatarToFile(opts));
      await uploadAvatar.mutateAsync({ file: new File([blob], "avatar.jpg", { type: "image/jpeg" }), profileId });
      onSaved();
      onOpenChange(false);
    } catch {
      toast("บันทึก Avatar ไม่สำเร็จ", "error");
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="สร้าง Avatar"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setOpts(randomCharacterAvatar())}>
            สุ่มใหม่
          </Button>
          <Button className="flex-1" onClick={save} disabled={uploadAvatar.isPending}>
            {uploadAvatar.isPending ? <Spinner className="h-3 w-3" /> : "บันทึก"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex justify-center">
          <img src={previewUrl} alt="ตัวอย่าง Avatar" className="h-32 w-32 rounded-full ring-1 ring-border" />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">สีผิว</p>
          <div className="flex gap-2">
            {SKIN_TONES.map((c) => (
              <Swatch key={c} color={c} selected={opts.skin === c} onClick={() => setOpts({ ...opts, skin: c })} />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">ทรงผม</p>
          <div className="flex flex-wrap gap-1.5">
            {HAIR_STYLES.map((s) => (
              <Button
                key={s}
                size="xs"
                variant={opts.hairStyle === s ? "accent" : "outline"}
                onClick={() => setOpts({ ...opts, hairStyle: s })}
              >
                {HAIR_STYLE_LABELS[s]}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">สีผม</p>
          <div className="flex gap-2">
            {HAIR_COLORS.map((c) => (
              <Swatch
                key={c}
                color={c}
                selected={opts.hairColor === c}
                onClick={() => setOpts({ ...opts, hairColor: c })}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">สีพื้นหลัง</p>
          <div className="flex gap-2">
            {BG_COLORS.map((c) => (
              <Swatch key={c} color={c} selected={opts.bg === c} onClick={() => setOpts({ ...opts, bg: c })} />
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
