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
import Play from "lucide-solid/icons/play";

import { ImageCaroulsel } from "~/components/ImageCarousel";
import { useStore } from "~/store/storeContext";
import { createAsync, A } from "@solidjs/router";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import { Card, CardContent } from "~/components/ui/card";
import { ComponentBadge } from "~/components/ComponentBadge";

export default function Home() {
  const [showItem, setShowItem] = createSignal<string>("");
  const [store, actions] = useStore();

  let previewDiv: HTMLDivElement | undefined;

  createEffect(() => {
    if (previewDiv) {
      previewDiv.innerHTML = html() || "";
    }
  });

  const component = createMemo(() => {
    return store.components?.data?.find(
      (c) => c.id === store.displayComponentId,
    );
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
    const query = search().toLowerCase();
    if (!query) return store.components.data;

    return store.components.data.filter((item) =>
      item.title.toLowerCase().includes(query),
    );
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
      <div
        classList={{
          "flex flex-col gap-2 py-8 h-full mx-auto items-center relative": true,
          "w-1/3 items-start": itemSelected(),
          "w-full": !itemSelected(),
        }}
      >
        <Button
          as="a"
          class="absolute top-4 right-4"
          href={"trade"}
          variant="outline"
          size="icon"
        >
          <Play />
        </Button>
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
            <CardContent class="flex flex-col gap-2 p-4 flex-wrap relative">
              <div class="text-lg font-bold text-gray-700">Padrões</div>
              <div class="flex gap-2 flex-wrap items-start">
                <For each={filteredItems() ?? []}>
                  {(component) => (
                    <ComponentBadge
                      component={component}
                      loadComponent={actions.loadComponent}
                      setShowItem={setShowItem}
                      location="lists"
                      // addSelectedComps={addSelectedComps}
                      // addDetails={addDetails}
                      // addContext={addContext}
                      // selectedSetup={selectedSetup}
                      // removeComps={removeSelectedComps}
                    />
                  )}
                </For>
              </div>
            </CardContent>
          </Card>
          <DialogAddComponent />
        </div>
      </div>
    </main>
  );
}
