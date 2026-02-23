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

export default function Home() {
  const [checklistID, setChecklistID] = createSignal<string>("");
  const [store, actions] = useStore();

  let previewDiv: HTMLDivElement | undefined;

  createEffect(() => {
    if (previewDiv) {
      previewDiv.innerHTML = html() || "";
    }
  });

  const component = createMemo(() => {
    return store.components?.find((c) => c.id === store.displayComponentId);
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

  const checklistSelected = () => checklistID() !== "";

  return (
    <main class="flex w-full h-[calc(100vh-51px)] text-gray-800 p-1.5 gap-1 relative">
      <Show when={checklistSelected()}>
        <Button
          as="A"
          class="absolute top-4 left-4"
          href={`/pattern/?pattern=${checklistID()}`}
          variant="outline"
          size="icon"
        >
          <SquarePen />
        </Button>
      </Show>
      <Show when={checklistSelected()}>
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
          "w-1/3": checklistSelected(),
          "w-full": !checklistSelected(),
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
        <div class="flex flex-col gap-2 items-center">
          <For each={store.components}>
            {(component, index) => {
              return (
                <div
                  onMouseDown={() => {
                    setChecklistID(component.id);
                    actions.loadComponent(component.id);
                  }}
                  classList={{
                    "py-2 px-4 w-fit": true,
                    [buttonVariants({ variant: "default", size: "md" })]:
                      component.id === checklistID(),
                  }}
                >
                  {component.title}
                </div>
              );
            }}
          </For>
          <DialogAddComponent />
        </div>
      </div>
    </main>
  );
}
