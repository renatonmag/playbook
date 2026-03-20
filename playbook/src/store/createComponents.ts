import { onSuccess } from "@orpc/client";
import {
  createAsync,
  createAsyncStore,
  query,
  revalidate,
} from "@solidjs/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import { createEffect, createSignal, on, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { orpc } from "~/lib/orpc";

export default function createComponents(agent, actions, state, setState) {
  const [componentsSource, setComponentsSource] = createSignal("mine");

  const queryClient = useQueryClient();

  // const _componentsList = useQuery(() =>
  //   orpc.component.listByUser.queryOptions({}),
  // );

  const _updateComponent = useMutation(() =>
    orpc.component.update.mutationOptions({
      onSuccess: (res) => {
        queryClient.setQueryData(
          orpc.component.listByUser.queryKey(),
          (old: any[]) =>
            old?.map((c) => (c.id === res.id ? { ...c, ...res } : c)) ?? [],
        );
      },
    }),
  );

  const _deleteComponent = useMutation(() =>
    orpc.component.delete.mutationOptions({
      onSuccess: (res) => {
        queryClient.setQueryData(
          orpc.component.listByUser.queryKey(),
          (old: any[]) => old?.filter((c) => c.id !== res.id) ?? [],
        );
      },
    }),
  );

  const createComponent = useMutation(() =>
    orpc.component.create.mutationOptions({
      onSuccess: (res) => {
        queryClient.setQueryData(
          orpc.component.listByUser.queryKey(),
          (old) => {
            return [...(old || []), res];
          },
        );
      },
    }),
  );

  Object.assign(actions, {
    loadComponents(predicate) {
      setComponentsSource(predicate);
    },
    loadComponent(componentId) {
      setState("displayComponentId", componentId);
    },
    createComponent,
    updateComponent(id: number, data: Record<string, any>) {
      return _updateComponent.mutateAsync({ id, ...data });
    },
    deleteComponent(id: number) {
      return _deleteComponent.mutateAsync({ id });
    },
  });

  return null;
}
