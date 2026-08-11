import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Profile } from "@/lib/database.types";
import { compressImage } from "@/lib/image";
import { supabase } from "@/lib/supabase";

/**
 * Uploads to the public avatars bucket (object name = the target user's own
 * id) and points profiles.avatar_path at it. Self-service (AppShell) uploads
 * to your own id; admins editing someone else's row (EditUserSheet) rely on
 * the can_manage_users() storage policy from migration 0025 to write there too.
 */
export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, profileId }: { file: File; profileId: string }) => {
      const blob = await compressImage(file);
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(profileId, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { error } = await supabase.from("profiles").update({ avatar_path: profileId }).eq("id", profileId);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

/** Admin-only removal (EditUserSheet) — clears the pointer, leaves the storage object (upsert overwrites it on next upload). */
export function useRemoveAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", profileId);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

/** Cache-busted with updated_at so a re-upload shows immediately, not the CDN's stale copy. */
export function avatarUrl(profile: Pick<Profile, "avatar_path" | "updated_at">): string | null {
  if (!profile.avatar_path) return null;
  const { data } = supabase.storage.from("avatars").getPublicUrl(profile.avatar_path);
  return `${data.publicUrl}?v=${encodeURIComponent(profile.updated_at)}`;
}
