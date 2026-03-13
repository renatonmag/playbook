import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import { produce } from "immer";
import { createEffect } from "solid-js";
import { orpc } from "~/lib/orpc";

export default function createTradeSessions(agent, actions, state, setState) {
  const queryClient = useQueryClient();

  // const query = useQuery(() => orpc.trade.listByUser.queryOptions({}));

  // createEffect(() => {
  //   console.log("query", query.data);
  // });

  const createSession = useMutation(() =>
    orpc.trade.create.mutationOptions({
      onSuccess: (res) => {
        queryClient.setQueryData(orpc.trade.listByUser.queryKey(), (old) => {
          return [...(old || []), res];
        });
      },
    }),
  );
  const updateSession = useMutation(() =>
    orpc.trade.update.mutationOptions({
      onMutate: async (variables) => {
        await queryClient.cancelQueries({
          queryKey: ["trade", "session", String(variables.id)],
        });
      },
      onSuccess: (res) => {
        queryClient.setQueryData(
          ["trade", "session", String(res.id)],
          (old: any) => {
            if (!old) return old;
            return { ...old, setups2: res.setups2 };
          },
        );
        queryClient.setQueryData(
          orpc.trade.listByUser.queryKey(),
          produce((draft) => {
            if (!draft) return [];
            const entry = draft.find((e) => e.id === res.id);
            if (entry) entry.setups2 = res.setups2;
            return draft || [];
          }),
        );
      },
    }),
  );

  const updateSessionStrategies = useMutation(() =>
    orpc.trade.updateStrategies.mutationOptions({
      onSuccess: (res) => {
        queryClient.setQueryData(
          orpc.trade.listByUser.queryKey(),
          produce((draft) => {
            if (!draft) return [];
            const entry = draft.find((e) => e.id === res.id);
            if (entry) entry.strategies = res.strategies;
            return draft;
          }),
        );
      },
    }),
  );

  Object.assign(actions, {
    createSession,
    updateSession,
    updateSessionStrategies,
  });

  return null;
}
