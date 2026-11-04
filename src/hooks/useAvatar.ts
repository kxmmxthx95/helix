import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Profile, Student } from "@/lib/database.types";
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

/** Student photo (students/<id> in the avatars bucket), cache-busted like avatarUrl. */
export function studentAvatarUrl(student: Pick<Student, "avatar_path" | "updated_at">): string | null {
  if (!student.avatar_path) return null;
  const { data } = supabase.storage.from("avatars").getPublicUrl(student.avatar_path);
  return `${data.publicUrl}?v=${encodeURIComponent(student.updated_at)}`;
}

export const BANNER_MAX_BYTES = 5 * 1024 * 1024; // mirrors the banners bucket's file_size_limit (migration 0122)
const BANNER_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Home-card cover: validate, shrink to 1600px JPEG, overwrite banners/<profileId>, point profiles.banner_path at it. */
export function useUploadBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, profileId }: { file: File; profileId: string }) => {
      if (!BANNER_TYPES.includes(file.type)) throw new Error("รองรับเฉพาะไฟล์ JPG, PNG, WebP");
      if (file.size > BANNER_MAX_BYTES) throw new Error("ไฟล์ใหญ่เกิน 5 MB");
      const blob = await compressImage(file, 1600, 0.82);
      const { error: upErr } = await supabase.storage
        .from("banners")
        .upload(profileId, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { error } = await supabase.from("profiles").update({ banner_path: profileId }).eq("id", profileId);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

/** Clears the pointer; the storage object stays (the next upload overwrites it). */
export function useRemoveBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase.from("profiles").update({ banner_path: null }).eq("id", profileId);
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

/** Cache-busted with updated_at, like avatarUrl. */
export function bannerUrl(profile: Pick<Profile, "banner_path" | "updated_at">): string | null {
  if (!profile.banner_path) return null;
  const { data } = supabase.storage.from("banners").getPublicUrl(profile.banner_path);
  return `${data.publicUrl}?v=${encodeURIComponent(profile.updated_at)}`;
}
