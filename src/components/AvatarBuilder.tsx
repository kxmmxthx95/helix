import { useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { CharacterSprite } from "@/components/CharacterSprite";
import { useUpdateCharacterOptions } from "@/hooks/useProfiles";
import type { CharacterOptions } from "@/lib/database.types";
import { CHARACTER_IDS, DEFAULT_CHARACTER_OPTIONS, randomCharacterOptions } from "@/lib/characterSprite";
import { cn } from "@/lib/utils";

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
      title="เลือกตัวละคร"
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
      <div className="space-y-4">
        <div className="flex justify-center">
          <CharacterSprite options={opts} scale={4} />
        </div>

        <div className="grid grid-cols-6 gap-1.5">
          {CHARACTER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              title={id}
              onClick={() => setOpts({ characterId: id })}
              className={cn(
                "tappable flex items-center justify-center rounded-md border-2 p-1",
                opts.characterId === id ? "border-accent bg-accent/10" : "border-transparent",
              )}
            >
              <img
                src={`/ninja/characters/${id}/walk.png`}
                alt={id}
                className="h-8 w-8"
                style={{
                  imageRendering: "pixelated",
                  objectFit: "none",
                  objectPosition: "0 0",
                  width: 16,
                  height: 16,
                }}
              />
            </button>
          ))}
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          ภาพตัวละครจาก Ninja Adventure Asset Pack (CC0)
        </p>
      </div>
    </Sheet>
  );
}
