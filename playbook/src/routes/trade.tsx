import { createResource, createSignal, For, Show } from "solid-js";
import { ImageCaroulsel } from "~/components/ImageCarousel";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { parseMarkdown } from "~/lib/parseMarkdown";
import {
  checklist,
  selectedComponentsID,
  selectComponent,
  getListComponent,
  deselectComponent,
} from "~/store/checklist";
import { useStore } from "~/store/storeContext";

export default function Trade() {
  const [store, actions] = useStore();
  const [selectedComps, setSelectedComps] = createSignal<string[]>([]);

  // const [html] = createResource(
  //   () => getListComponent(checklistID()[1])?.markdown,
  //   parseMarkdown,
  // );

  return (
    <main class="flex w-full h-[calc(100vh-50px)] text-gray-800 p-1.5 gap-1">
      <div class="w-1/3">
        <Card class="w-lg max-w-lg h-fit">
          <CardContent class="flex gap-2 p-4 flex-wrap mx-auto relative">
            <For each={store.components.components}>
              {(component) => <Badge>{component.title}</Badge>}
            </For>
          </CardContent>
        </Card>
      </div>
      <div class="w-1/3">
        <Card class="w-lg max-w-lg h-fit">
          <CardContent class="flex gap-2 p-4 flex-wrap mx-auto relative">
            <For each={store.components.components}>
              {(component) => <Badge>{component.title}</Badge>}
            </For>
          </CardContent>
        </Card>
      </div>
      <div class="w-1/3"></div>

      {/* <Show when={checklistSelected()}>
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
      </Show>  */}
    </main>
  );
}
