import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import { produce } from "immer";
import { createEffect } from "solid-js";
import { orpc } from "~/lib/orpc";

export default function createTradeSessions(agent, actions, state, setState) {
  const queryClient = useQueryClient();

  const query = useQuery(() => orpc.trade.listByUser.queryOptions({}));

  createEffect(() => {
    console.log("query", query.data);
  });

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
      onSuccess: (res) => {
        queryClient.setQueryData(
          orpc.trade.listByUser.queryKey(),
          produce((draft) => {
            if (!draft) return [];
            draft.find((e) => e.id === res.id).setups = res.setups;
            return draft || [];
          }),
        );
      },
    }),
  );

  Object.assign(actions, {
    createSession,
    updateSession,
  });

  return query;
}
