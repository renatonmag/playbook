import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from "solid-js";
import { parseMarkdown } from "~/lib/parseMarkdown";
import {
  checklist,
  patterns,
  getListComponent,
  setChecklist,
  setPatterns,
} from "~/store/checklist";
import { DialogAddComponent } from "~/components/DialogAddComponent";
import { Button, buttonVariants } from "~/components/ui/button";
import SquarePen from "lucide-solid/icons/square-pen";
import PlusIcon from "lucide-solid/icons/plus";
import ExternalLink from "lucide-solid/icons/external-link";

import { ImageCaroulsel } from "~/components/ImageCarousel";
import { useStore } from "~/store/storeContext";
import { createAsync, A, useSearchParams } from "@solidjs/router";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import { Card, CardContent } from "~/components/ui/card";
import { ListsBadge } from "~/components/badges/ListsBadge";
import { useQuery } from "@tanstack/solid-query";
import { orpc } from "~/lib/orpc";
import { DialogAddStrategy } from "~/components/DialogAddStrategy";

export default function Home() {
  const [showItem, setShowItem] = createSignal<string>("");
  const [showStrategyId, setShowStrategyId] = createSignal<number | null>(null);
  const [store, actions] = useStore();

  let previewDiv: HTMLDivElement | undefined;

  const componentsList = useQuery(() =>
    orpc.component.listByUser.queryOptions({}),
  );

  const strategiesList = useQuery(() =>
    orpc.strategy.listByUser.queryOptions({}),
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedStrategyId = createMemo(() =>
    searchParams.strategy ? Number(searchParams.strategy) : null,
  );

  const selectStrategy = (id: number) => {
    const isSelected = selectedStrategyId() === id;
    setSearchParams({ strategy: isSelected ? undefined : String(id) });
    setShowStrategyId(isSelected ? null : id);
    if (!isSelected) setShowItem("");
  };

  createEffect(() => {
    if (previewDiv) {
      previewDiv.innerHTML = html() || "";
    }
  });

  const component = createMemo(() => {
    return componentsList?.data?.find((c) => c.id === store.displayComponentId);
  });

  const [search, setSearch] = createSignal("");

  let timer;
  const handleSearchInput = (e) => {
    clearTimeout(timer);
    const value = e.currentTarget.value;
    timer = setTimeout(() => {
      setSearch(value);
    }, 200);
  };

  const filteredItems = createMemo(() => {
    console.log(componentsList.data);
    const strategyId = selectedStrategyId();
    const query = search().toLowerCase();
    if (strategyId === null) return [];
    let items = componentsList.data ?? [];
    items = items.filter((c) => c.strategyId === strategyId);
    if (query)
      items = items.filter((item) => item.title.toLowerCase().includes(query));
    return items;
  });

  const addList = () => {
    setChecklist([
      ...checklist,
      { id: crypto.randomUUID(), title: "", components: [] },
    ]);
  };

  const [html] = createResource(
    () => component()?.markdown?.content || "",
    parseMarkdown,
  );

  const itemSelected = () => showItem() !== "";
  const selectedStrategy = createMemo(() =>
    strategiesList.data?.find((s) => s.id === showStrategyId()),
  );
  const panelOpen = () => itemSelected() || showStrategyId() !== null;

  return (
    <main class="flex w-full h-[calc(100vh-51px)] text-gray-800 p-1.5 gap-1 relative">
      <Show when={itemSelected()}>
        <Button
          as="A"
          class="absolute top-4 left-4"
          href={`/pattern/?pattern=${showItem()}`}
          variant="outline"
          size="icon"
        >
          <SquarePen />
        </Button>
      </Show>
      <Show when={itemSelected()}>
        <div class="w-2/3 py-4 flex flex-col h-full justify-start items-center overflow-y-auto">
          <div class="text-lg font-bold text-gray-700 mb-4">
            {component()?.title}
          </div>
          <ImageCaroulsel
            class="max-w-2xl"
            images={component()?.exemples || []}
          />
          <div
            class="prose w-full h-full mx-auto mt-5 wrap-break-word"
            innerHTML={html() || "Sem descrição..."}
          ></div>
        </div>
      </Show>
      <Show when={selectedStrategy()}>
        {(strategy) => (
          <div class="w-2/3 py-8 px-8 flex flex-col h-full justify-start overflow-y-auto gap-4">
            <div class="text-xl font-bold text-gray-700">{strategy().name}</div>
            <Show when={strategy().description}>
              <p class="text-gray-600 text-sm">{strategy().description}</p>
            </Show>
            <Button
              as="A"
              href={`/strategy/${strategy().id}`}
              variant="outline"
              class="w-fit gap-2"
            >
              <ExternalLink size={16} />
              Abrir estratégia
            </Button>
          </div>
        )}
      </Show>
      <div
        classList={{
          "flex flex-col gap-2 py-8 h-full mx-auto items-center relative": true,
          "w-1/3 items-start": panelOpen(),
          "w-full": !panelOpen(),
        }}
      >
        <div class="flex flex-col gap-6 items-center">
          <TextField class="grid w-full max-w-lg items-center mt-4">
            <TextFieldInput
              type="text"
              placeholder="Pesquisar..."
              value={search()}
              onInput={handleSearchInput}
            />
          </TextField>
          <Card class="w-lg max-w-lg h-fit">
            <CardContent class="flex flex-col gap-2 p-4 relative">
              <div class="text-lg font-bold text-gray-700">Estratégias</div>
              <div class="flex gap-2 flex-wrap items-center">
                <For each={strategiesList.data ?? []}>
                  {(strategy) => (
                    <button
                      onClick={() => selectStrategy(strategy.id)}
                      class={`px-3 py-1 rounded-md text-sm font-medium border transition-colors ${
                        selectedStrategyId() === strategy.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-input hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      {strategy.name}
                    </button>
                  )}
                </For>
                <DialogAddStrategy />
              </div>
            </CardContent>
          </Card>
          <Card class="w-lg max-w-lg h-fit">
            <CardContent class="flex flex-col gap-2 p-4 flex-wrap relative">
              <div class="text-lg font-bold text-gray-700">Padrões</div>
              <div class="flex gap-2 flex-wrap items-start">
                <For each={filteredItems() ?? []}>
                  {(component) => (
                    <ListsBadge
                      component={component}
                      loadComponent={actions.loadComponent}
                      setShowItem={(id) => {
                        setShowStrategyId(null);
                        setShowItem(id);
                      }}
                      deleteComponent={(id) => actions.deleteComponent(id)}
                    />
                  )}
                </For>
              </div>
            </CardContent>
          </Card>
          <DialogAddComponent strategyId={selectedStrategyId()} />
        </div>
      </div>
    </main>
  );
}
