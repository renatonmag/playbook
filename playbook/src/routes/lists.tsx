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
import { createAsync } from "@solidjs/router";

export default function Home() {
  const [checklistID, setChecklistID] = createSignal<string>("");
  const [state, _] = useStore();

  let previewDiv: HTMLDivElement | undefined;

  createEffect(() => {
    if (previewDiv) {
      previewDiv.innerHTML = html() || "";
    }
  });

  const addList = () => {
    setChecklist([
      ...checklist,
      { id: crypto.randomUUID(), title: "", components: [] },
    ]);
  };

  const [html] = createResource(
    () => getListComponent(checklistID())?.markdown,
    parseMarkdown,
  );

  const checklistSelected = () => checklistID() !== "";

  return (
    <main class="flex w-full h-[calc(100vh-50px)] text-gray-800 p-1.5 gap-1">
      <Show when={checklistSelected()}>
        <div class="w-1/2 py-8 flex flex-col h-full relative justify-start items-center">
          <Button
            as="a"
            class="absolute top-4 left-4"
            href={`/pattern/?pattern=${checklistID()}`}
            variant="outline"
            size="icon"
          >
            <SquarePen />
          </Button>
          <div class="text-lg font-bold text-gray-700 mb-4">
            {getListComponent(checklistID())?.title}
          </div>
          <ImageCaroulsel
            class="max-w-2xl"
            images={getListComponent(checklistID())?.images || []}
          />
          <div
            class="prose w-full h-full mx-auto wrap-break-word"
            innerHTML={html() || "Sem descrição..."}
          ></div>
        </div>
      </Show>
      <div class="flex flex-col gap-2 w-1/2 py-8 h-full mx-auto items-center relative">
        <Button
          as="a"
          class="absolute top-4 right-4"
          href={"trade"}
          variant="outline"
          size="icon"
        >
          <Play />
        </Button>
        <div class="flex flex-col gap-2">
          <For each={state.components.components}>
            {(component, index) => {
              return (
                <div
                  onMouseDown={() => setChecklistID(component.id)}
                  classList={{
                    "py-2 px-4": true,
                    [buttonVariants({ variant: "secondary", size: "md" })]:
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
