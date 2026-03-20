import { For } from "solid-js";
import { Button } from "~/components/ui/button";
import { useStore } from "~/store/storeContext";
import { A } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { orpc } from "~/lib/orpc";

export default function TradeSessions() {
  const [store, actions] = useStore();
  const sessionsQuery = useQuery(() => orpc.trade.listByUser.queryOptions({}));
  return (
    <main class="flex w-full h-[calc(100vh-52px)] justify-center text-gray-800 p-1.5 gap-1">
      <div class="w-1/3 flex flex-col items-center justify-start gap-4 pt-4 overflow-y-auto">
        <div class="text-lg font-bold text-gray-700">Sessions</div>
        <For each={sessionsQuery.data}>
          {(session) => (
            <Button as={A} href={`/trade/${session.id}`} class="w-1/3">
              {session.createdAt.toLocaleString()}
            </Button>
          )}
        </For>
        <Button
          class="w-1/3"
          onMouseDown={() =>
            actions.createSession.mutate({
              setups: [
                {
                  version: 0,
                  id: crypto.randomUUID(),
                  selectedComps: [],
                  result: "",
                },
              ],
            })
          }
        >
          Create session
        </Button>
      </div>
    </main>
  );
}
