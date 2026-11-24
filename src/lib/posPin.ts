import { supabase } from "@/lib/supabase";

/** localStorage key of the terminal this device is bound to (set when an admin pairs it on /pos-login). */
export const POS_TERMINAL_KEY = "helix-pos-terminal";

/** Calls the pos-pin Edge Function; unwraps the JSON error body that supabase-js hides behind a generic message. */
export async function posPin<T>(body: Record<string, string | undefined>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("pos-pin", { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}
