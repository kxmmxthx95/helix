import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { startAutoFlush, type Op } from "@/lib/outbox";
import { supabase } from "@/lib/supabase";

async function send(op: Op) {
  const table = supabase.from(op.table);
  const { id, ...values } = op.payload as { id?: string } & Record<string, unknown>;

  const { error } =
    op.type === "insert"
      ? await table.insert(values as never)
      : op.type === "update"
        ? await table.update(values as never).eq("id", id!)
        : await table.delete().eq("id", id!);

  if (error) throw error;
}

/**
 * Replays offline writes on reconnect, then refetches so the UI shows what
 * the server actually accepted rather than the optimistic guess.
 */
export function useOutboxSync() {
  const qc = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const stop = startAutoFlush(send);

    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void qc.invalidateQueries();
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      stop();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [qc]);

  return { online };
}
