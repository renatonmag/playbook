import { createEffect, onCleanup } from "solid-js";
import { supabase } from "~/lib/supabase";
import type { Setup2 } from "~/db/schema";

type Options = {
  sessionId: () => number | undefined;
  onUpdate: (newSetups2: Setup2[]) => void;
};

export function useSessionRealtime(options: Options) {
  createEffect(() => {
    const id = options.sessionId();
    if (!id) return;

    const channel = supabase
      .channel(`session:${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "setups",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          console.log("postgres_changes", payload);
          const newSetups2 = (payload.new as any)?.setups2;
          if (Array.isArray(newSetups2)) {
            options.onUpdate(newSetups2);
          }
        },
      )
      .subscribe((status, err) => {
        if (err) console.error(`[realtime] session:${id} error:`, err);
        else console.log(`[realtime] session:${id} status:`, status);
      });

    onCleanup(() => {
      supabase.removeChannel(channel);
    });
  });
}
