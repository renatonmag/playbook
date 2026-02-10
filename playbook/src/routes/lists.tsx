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
import { checklist, setChecklist } from "~/store/checklist";
import { DialogAddComponent } from "~/components/DialogAddComponent";
import { Button, buttonVariants } from "~/components/button";
import SquarePen from "lucide-solid/icons/square-pen";
import PlusIcon from "lucide-solid/icons/plus";
import { ImageCaroulsel } from "~/components/ImageCarousel";

export default function Home() {
  const [markdown, setMarkdown] = createSignal("");
  const [checklistID, setChecklistID] = createSignal<string[]>(["", ""]);

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

  const findComponent = (listId: string, componentId: string) => {
    return checklist
      .find((item) => item.id === listId)
      ?.components.find((component) => component.id === componentId);
  };

  const [html] = createResource(
    () => findComponent(checklistID()[0], checklistID()[1])?.markdown,
    parseMarkdown,
  );

  const checklistSelected = () =>
    checklistID()[0] !== "" && checklistID()[1] !== "";

  return (
    <main class="flex w-full h-[calc(100vh-50px)] text-gray-800 p-1.5 gap-1">
      <Show when={checklistSelected()}>
        <div class="w-1/2 py-8 flex flex-col h-full relative justify-start items-center">
          <Button
            as="a"
            class="absolute top-4 left-4"
            href={`/l/${checklistID()[0]}/p/${checklistID()[1]}`}
            variant="outline"
            size="icon"
          >
            <SquarePen />
          </Button>
          <div class="text-lg font-bold text-gray-700 mb-4">
            {findComponent(checklistID()[0], checklistID()[1])?.title}
          </div>
          <ImageCaroulsel
          class="max-w-2xl"
            images={
              findComponent(checklistID()[0], checklistID()[1])?.images || []
            }
          />
          <div
            class="prose w-full h-full mx-auto wrap-break-word"
            innerHTML={html() || "Sem descrição..."}
          ></div>
        </div>
      </Show>
      <div class="flex flex-col gap-2 w-1/2 py-8 h-full mx-auto items-center">
        <For each={checklist}>
          {(item) => (
            <div class="flex gap-2">
              <For each={item.components}>
                {(component, index) => {
                  return (
                    <span
                      onClick={() => setChecklistID([item.id, component.id])}
                      classList={{
                        "py-2 px-4": true,
                        [buttonVariants({ variant: "secondary", size: "md" })]:
                          component.id === checklistID()[1],
                      }}
                    >
                      {component.title}
                    </span>
                  );
                }}
              </For>
              <Show when={item.components.length === 0}>
                <div
                  classList={{
                    [buttonVariants({ variant: "secondary", size: "sm" })]:
                      true,
                    "w-50": true,
                  }}
                ></div>
              </Show>
              <DialogAddComponent
                setComponentName={(componentName) => {
                  setChecklist((_item) => _item.id === item.id, "components", [
                    ...item.components,
                    {
                      id: crypto.randomUUID(),
                      title: componentName,
                      markdown: "",
                    },
                  ]);
                }}
              />
            </div>
          )}
        </For>
        <Button variant="outline" size="icon" onClick={addList}>
          <PlusIcon />
        </Button>
      </div>
    </main>
  );
}
