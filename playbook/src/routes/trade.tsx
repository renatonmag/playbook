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
import { Question } from "~/db/schema";

export default function Trade() {
  const [store, actions] = useStore();
  const [selectedComps, setSelectedComps] = createSignal<string[]>([]);
  const [detailsComps, setDetailsComps] = createSignal<number[]>([]);
  const [contextComps, setContextComps] = createSignal<number[]>([]);
  const [hoverItem1, setHoverItem1] = createSignal<string>("");
  const [hoverItem2, setHoverItem2] = createSignal<string>("");
  const [showItem, setShowItem] = createSignal<string>("");
  const [showAnswers, setShowAnswers] = createSignal<string>("");

  const component = createMemo(() => {
    return store.components.data?.find(
      (e: any) => e.id === store.displayComponentId,
    );
  });

  const addDetails = (id: number) => {
    setDetailsComps((state) => [...state, id]);
  };
  const removeDetails = (id: number) => {
    setDetailsComps((state) => state.filter((e) => e !== id));
  };

  const addContext = (id: number) => {
    setContextComps((state) => [...state, id]);
  };
  const removeContext = (id: number) => {
    setContextComps((state) => state.filter((e) => e !== id));
  };

  createEffect(() => {
    console.log("detailsComps", detailsComps());
    console.log("contextComps", contextComps());
  });

  const decideQuestioFunction = (question: Question, answerId: number) => {
    switch (question.questionFunction) {
      case "Especificação":
        return;
      case "Detalhe":
        if (detailsComps().includes(answerId)) return;
        addDetails(answerId);
        return;
      case "Contexto":
        if (contextComps().includes(answerId)) return;
        addContext(answerId);
        return;
      default:
        return;
    }
  };

  const [html] = createResource(
    () => component()?.markdown?.content || "",
    parseMarkdown,
  );

  return (
    <main class="flex w-full h-[calc(100vh-51px)] text-gray-800 p-1.5 gap-1">
      <div class="w-1/3">
        <Card class="w-lg max-w-lg h-fit">
          <CardContent class="flex flex-col gap-2 p-4 flex-wrap mx-auto relative">
            <div class="text-lg font-bold text-gray-700">Padrões</div>
            <div class="flex gap-2 flex-wrap items-start">
              <For each={store.components.data ?? []}>
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
                            setSelectedComps((state) => [
                              ...state,
                              component.id,
                            ]);
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
            </div>
          </CardContent>
        </Card>
      </div>
      <div class="w-1/3">
        <Card class="w-lg max-w-lg h-fit">
          <CardContent class="flex flex-col gap-2 p-4 flex-wrap items-start mx-auto relative">
            <div class="text-lg font-bold text-gray-700">Setup</div>
            <div class="flex gap-2 flex-wrap items-start">
              <For
                each={store.components.data?.filter((e: any) =>
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
            </div>
            <div class="text-lg font-bold text-gray-700">Detalhes</div>
            <div class="flex gap-2 flex-wrap items-start">
              <For
                each={
                  store.components.data?.filter((e: any) =>
                    detailsComps().includes(e.id),
                  ) || []
                }
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
                            removeDetails(component.id);
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
            </div>
            <div class="text-lg font-bold text-gray-700">Contexto</div>
            <div class="flex gap-2 flex-wrap items-start">
              <For
                each={store.components.data?.filter((e: any) =>
                  contextComps().includes(e.id),
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
                            removeContext(component.id);
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
            </div>
            <div class="text-lg font-bold text-gray-700 mt-2">
              Direcionamentos:
            </div>
            <div class="flex flex-col gap-3">
              <For
                each={store.components.data?.filter((e: any) =>
                  selectedComps().includes(e.id),
                )}
              >
                {(component) => (
                  // <Show when={component.questions.length > 0}>
                  <div class="flex flex-col gap-2">
                    <div class="text-sm font-bold text-gray-700">
                      {component.title}
                    </div>
                    <div class="flex flex-col gap-2">
                      <For each={component.questions}>
                        {(question) => (
                          <div class="flex flex-col gap-1">
                            <div
                              class="text-sm text-gray-700 cursor-pointer"
                              onMouseDown={() => {
                                setShowAnswers(question.id);
                              }}
                            >
                              {question.question}
                            </div>
                            <Show when={showAnswers() === question.id}>
                              <div class="flex gap-2 mb-2">
                                <For each={question.answers}>
                                  {(answer) => (
                                    <Button
                                      variant={"secondary"}
                                      size={"sm"}
                                      onMouseDown={() => {
                                        decideQuestioFunction(
                                          question,
                                          answer.consequence.id,
                                        );
                                      }}
                                    >
                                      {answer.answer}
                                    </Button>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                  // </Show>
                )}
              </For>

              {/* <div class="flex flex-col gap-2">
                <div class="text-md text-gray-700">Grande ou pequeno?</div>
                <div class="flex gap-2">
                  <Button variant={"secondary"} size={"sm"}>
                    Grande
                  </Button>
                  <Button variant={"secondary"} size={"sm"}>
                    Pequeno
                  </Button>
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <div class="text-md text-gray-700">Grande ou pequeno?</div>
                <div class="flex gap-2">
                  <Button variant={"secondary"} size={"sm"}>
                    Grande
                  </Button>
                  <Button variant={"secondary"} size={"sm"}>
                    Pequeno
                  </Button>
                </div>
              </div>
              <div class="text-md text-gray-700">Médio ou grande?</div>
              <div class="text-md text-gray-700">Médio ou pequeno?</div>
              <div class="flex flex-col gap-2">
                <div class="text-md text-gray-700">Grande ou pequeno?</div>
                <div class="flex gap-2">
                  <Button variant={"secondary"} size={"sm"}>
                    Grande
                  </Button>
                  <Button variant={"secondary"} size={"sm"}>
                    Pequeno
                  </Button>
                </div>
              </div>
              <div class="text-md text-gray-700">Grande ou pequeno?</div>
              <div class="text-md text-gray-700">Médio ou grande?</div> */}
            </div>
          </CardContent>
        </Card>
      </div>
      <div class="w-1/3">
        <Show when={showItem() === component()?.id}>
          <div class="pt-4 flex flex-col h-full relative justify-start items-center">
            <div class="text-lg font-bold text-gray-700 mb-4 sticky top-0">
              {component()?.title}
            </div>
            <div class="flex flex-col h-full w-full justify-start items-center overflow-y-auto">
              <ImageCaroulsel
                class="max-w-lg"
                images={component()?.exemples || []}
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
