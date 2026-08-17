import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ผูกบัญชี LINE — grill decision, 2026-08-17. The school's Messaging API
// channel is already live (no LINE Login channel), so linking happens by
// messaging a one-time code to the OA rather than an OAuth redirect — see
// supabase/functions/line-webhook, which matches the code to a profile.
// Link status itself is just profiles.line_user_id, already on the
// AuthProvider profile — no separate query needed to read it.

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — read off a phone screen
const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 15;

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

/** Generates a fresh code each call — simplest option, no need to track/reuse a still-valid one. */
export function useGenerateLinkCode() {
  return useMutation({
    mutationFn: async (profileId: string): Promise<string> => {
      const code = randomCode();
      const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();
      const { error } = await supabase.from("line_link_codes").insert({ code, profile_id: profileId, expires_at: expiresAt });
      if (error) throw error;
      return code;
    },
  });
}

export const LINE_LINK_CODE_TTL_MINUTES = CODE_TTL_MINUTES;
