import { createResource, createSignal, For, Show } from "solid-js";
import { ImageCaroulsel } from "~/components/ImageCarousel";
import { parseMarkdown } from "~/lib/parseMarkdown";
import {
  checklist,
  selectedComponentsID,
  selectComponent,
  getListComponent,
  deselectComponent,
} from "~/store/checklist";

export default function Trade() {
  const [checklistID, setChecklistID] = createSignal<string[]>(["", ""]);
  const checklistSelected = () =>
    checklistID()[0] !== "" && checklistID()[1] !== "";

  const [html] = createResource(
    () => getListComponent(checklistID()[0], checklistID()[1])?.markdown,
    parseMarkdown,
  );

  return (
    <main class="flex w-full h-[calc(100vh-50px)] text-gray-800 p-1.5 gap-1">
      <div
        classList={{
          "flex flex-col gap-2 py-8 h-full mx-auto items-center relative": true,
          "w-1/2": !checklistSelected(),
          "w-1/3": checklistSelected(),
        }}
      >
        <For each={checklist}>
          {(item) => {
            if (item.components.length === 0) return <></>;
            return (
              <div class="flex gap-2">
                <For each={item.components}>
                  {(component) => {
                    return (
                      <span
                        onMouseDown={() =>
                          selectComponent(item.id, component.id)
                        }
                        class="py-2 px-4"
                      >
                        {component.title}
                      </span>
                    );
                  }}
                </For>
              </div>
            );
          }}
        </For>
      </div>
      <div
        classList={{
          "flex flex-col gap-2 w-1/2 py-8 h-full mx-auto items-center relative": true,
          "w-1/2": !checklistSelected(),
          "w-1/3": checklistSelected(),
        }}
      >
        <For each={selectedComponentsID}>
          {(item) => {
            return (
              <div class="flex gap-2">
                <For each={item.components}>
                  {(component) => {
                    return (
                      <span
                        onMouseDown={() => setChecklistID([item.id, component])}
                        onDblClick={() => deselectComponent(item.id, component)}
                        class="py-2 px-4"
                      >
                        {getListComponent(item.id, component)?.title}
                      </span>
                    );
                  }}
                </For>
              </div>
            );
          }}
        </For>
      </div>
      <Show when={checklistSelected()}>
        <div class="w-1/3 py-8 flex flex-col h-full relative justify-start items-center">
          <div class="text-lg font-bold text-gray-700 mb-4">
            {getListComponent(checklistID()[0], checklistID()[1])?.title}
          </div>
          <ImageCaroulsel
            class="max-w-lg"
            images={
              getListComponent(checklistID()[0], checklistID()[1])?.images || []
            }
          />
          <div
            class="prose w-full h-full mx-auto wrap-break-word"
            innerHTML={html() || "Sem descrição..."}
          ></div>
        </div>
      </Show>
    </main>
  );
}
