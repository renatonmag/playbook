import {
  createResource,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from "solid-js";
import { ImageCaroulsel } from "~/components/ImageCarousel";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
import { X } from "lucide-solid/icons/index";
import { action } from "@solidjs/router";

export default function Trade() {
  const [store, actions] = useStore();
  const [selectedComps, setSelectedComps] = createSignal<string[]>([]);
  const [hoverItem1, setHoverItem1] = createSignal<string>("");
  const [hoverItem2, setHoverItem2] = createSignal<string>("");
  const [showItem, setShowItem] = createSignal<string>("");

  const [html] = createResource(
    () => store.components.component?.markdown?.content || "",
    parseMarkdown,
  );

  return (
    <main class="flex w-full h-[calc(100vh-51px)] text-gray-800 p-1.5 gap-1">
      <div class="w-1/3">
        <Card class="w-lg max-w-lg h-fit">
          <CardContent class="flex gap-2 p-4 items-start flex-wrap mx-auto relative">
            <For each={store.components.components}>
              {(component) => (
                <Badge
                  classList={{
                    "cursor-pointer": true,
                    "gap-3 py-2": hoverItem1() === component.id,
                  }}
                  onMouseDown={() => {
                    setHoverItem1(component.id);
                  }}
                >
                  <Switch fallback={<div>Loading...</div>}>
                    <Match when={hoverItem1() === component.id}>
                      <Button
                        variant={"secondary"}
                        onMouseDown={() => {
                          actions.loadComponent(component.id);
                          setShowItem(component.id);
                        }}
                      >
                        Mostrar
                      </Button>
                      <Button
                        variant={"secondary"}
                        onMouseDown={() => {
                          setSelectedComps((state) => [...state, component.id]);
                        }}
                      >
                        Adicionar
                      </Button>
                      <Button
                        variant={"secondary"}
                        size={"icon"}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setHoverItem1("");
                        }}
                      >
                        <X />
                      </Button>
                    </Match>
                    <Match when={hoverItem1() !== component.id}>
                      {component.title}
                    </Match>
                  </Switch>
                </Badge>
              )}
            </For>
          </CardContent>
        </Card>
      </div>
      <div class="w-1/3">
        <Card class="w-lg max-w-lg h-fit">
          <CardContent class="flex gap-2 p-4 flex-wrap items-start mx-auto relative">
            <For
              each={store.components.components?.filter((e) =>
                selectedComps().includes(e.id),
              )}
            >
              {(component) => (
                <Badge
                  classList={{
                    "cursor-pointer": true,
                    "gap-3 py-2": hoverItem2() === component.id,
                  }}
                  onMouseDown={() => {
                    setHoverItem2(component.id);
                  }}
                >
                  <Switch fallback={<div>Loading...</div>}>
                    <Match when={hoverItem2() === component.id}>
                      <Button
                        variant={"secondary"}
                        onMouseDown={() => {
                          actions.loadComponent(component.id);
                          setShowItem(component.id);
                        }}
                      >
                        Mostrar
                      </Button>
                      <Button
                        variant={"secondary"}
                        onMouseDown={() => {
                          setSelectedComps((state) =>
                            state.filter((e) => e !== component.id),
                          );
                        }}
                      >
                        Remover
                      </Button>
                      <Button
                        variant={"secondary"}
                        size={"icon"}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setHoverItem2("");
                        }}
                      >
                        <X />
                      </Button>
                    </Match>
                    <Match when={hoverItem2() !== component.id}>
                      {component.title}
                    </Match>
                  </Switch>
                </Badge>
              )}
            </For>
          </CardContent>
        </Card>
      </div>
      <div class="w-1/3">
        <Show when={showItem() === store.components.component?.id}>
          <div class="pt-4 flex flex-col h-full relative justify-start items-center">
            <div class="text-lg font-bold text-gray-700 mb-4 sticky top-0">
              {store.components.component?.title}
            </div>
            <div class="flex flex-col h-full w-full justify-start items-center overflow-y-auto">
              <ImageCaroulsel
                class="max-w-lg"
                images={store.components.component?.exemples || []}
              />
              <div
                class="prose w-full h-full mx-auto wrap-break-word"
                innerHTML={html() || "Sem descrição..."}
              ></div>
            </div>
          </div>
        </Show>
      </div>
    </main>
  );
}
