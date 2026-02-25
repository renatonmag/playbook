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
import { Answer, Question, Setup } from "~/db/schema";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { createStore, produce } from "solid-js/store";
import { set } from "zod";

export default function Trade() {
  const [store, actions] = useStore(),
    [selectedComps, setSelectedComps] = createSignal<number[]>([]),
    [selectedSteup, setSelectedSteup] = createSignal<number>(0),
    [detailsComps, setDetailsComps] = createSignal<number[]>([]),
    [contextComps, setContextComps] = createSignal<number[]>([]),
    [hoverItem1, setHoverItem1] = createSignal<string>(""),
    [hoverItem2, setHoverItem2] = createSignal<string>(""),
    [showItem, setShowItem] = createSignal<string>(""),
    [showAnswers, setShowAnswers] = createSignal<string>("");

  const [setups, setSetups] = createStore<{
    version: number;
    items: Setup[];
  }>({
    version: 0,
    items: [
      {
        id: crypto.randomUUID(),
        selectedComps: [],
        detailsComps: [],
        contextComps: [],
      },
    ],
  });

  const component = createMemo(() => {
    return store.components.data?.find(
      (e: any) => e.id === store.displayComponentId,
    );
  });

  const addSetup = () => {
    setSetups("items", [
      ...setups.items,
      {
        id: crypto.randomUUID(),
        selectedComps: [],
        detailsComps: [],
        contextComps: [],
      },
    ]);
  };

  const addSelectedComps = (index: number, id: number) => {
    if (setups.items.length === 0) return;
    // if (setups.items[index].selectedComps.includes(id)) return;
    setSetups(
      produce((draft) => {
        const setup = draft.items[index];
        setup.selectedComps = [...setup.selectedComps, id];
        draft.version++;
        return draft;
      }),
    );
  };
  const removeSelectedComps = (index: number, id: number) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[index];
        setup.selectedComps = setup.selectedComps.filter((e) => e !== id);
        draft.version++;
        return draft;
      }),
    );
  };

  const specifyComponent = (index: number, parentId: number, id: number) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[index];
        // setup.selectedComps = setup.selectedComps.filter((e) => e !== parentId);
        setup.selectedComps = [...setup.selectedComps, id];
        draft.version++;
        return draft;
      }),
    );
  };

  const addDetails = (index: number, id: number) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[index];
        setup.detailsComps = [...setup.detailsComps, id];
        draft.version++;
        return draft;
      }),
    );
  };

  const removeDetails = (index: number, id: number) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[index];
        setup.detailsComps = setup.detailsComps.filter((e) => e !== id);
        draft.version++;
        return draft;
      }),
    );
  };

  const addContext = (index: number, id: number) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[index];
        setup.contextComps = [...setup.contextComps, id];
        draft.version++;
        return draft;
      }),
    );
  };

  const removeContext = (index: number, id: number) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[index];
        setup.contextComps = setup.contextComps.filter((e) => e !== id);
        draft.version++;
        return draft;
      }),
    );
  };

  const decideQuestioFunction = (
    index: number,
    question: Question,
    answer: Answer,
  ) => {
    switch (question.questionFunction) {
      case "Especificação":
        specifyComponent(
          index,
          answer.consequence.parentId,
          answer.consequence.id,
        );
        return;
      case "Detalhe":
        if (setups.items[index].detailsComps.includes(answer.consequence.id))
          return;
        addDetails(index, answer.consequence.id);
        return;
      case "Contexto":
        if (setups.items[index].contextComps.includes(answer.consequence.id))
          return;
        addContext(index, answer.consequence.id);
        return;
      default:
        return;
    }
  };

  const [html] = createResource(
    () => component()?.markdown?.content || "",
    parseMarkdown,
  );

  const [search, setSearch] = createSignal("");

  const filteredItems = createMemo(() => {
    const query = search().toLowerCase();
    if (!query) return store.components.data;

    return store.components.data.filter((item) =>
      item.title.toLowerCase().includes(query),
    );
  });

  let timer;
  const handleSearchInput = (e) => {
    clearTimeout(timer);
    const value = e.currentTarget.value;
    timer = setTimeout(() => {
      setSearch(value);
    }, 200);
  };

  return (
    <main class="flex w-full h-[calc(100vh-52px)] text-gray-800 p-1.5 gap-1">
      <div class="w-1/3">
        <TextField class="grid w-full max-w-lg mx-auto items-center mb-6 mt-4">
          <TextFieldInput
            type="text"
            placeholder="Pesquisar..."
            value={search()}
            onInput={handleSearchInput}
          />
        </TextField>
        <Card class="w-lg max-w-lg h-fit mx-auto">
          <CardContent class="flex flex-col gap-2 p-4 flex-wrap mx-auto relative">
            <div class="text-lg font-bold text-gray-700">Padrões</div>
            <div class="flex gap-2 flex-wrap items-start">
              <For each={filteredItems() ?? []}>
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
                            addSelectedComps(selectedSteup(), component.id);
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
      <div class="w-1/3 flex flex-col items-center justify-start gap-4 pt-4 overflow-y-auto">
        <For each={setups.items}>
          {(setup, index) => (
            <Card
              class="w-lg max-w-lg h-fit mx-auto overflow-clip"
              onMouseDown={() => setSelectedSteup(index())}
            >
              <Show when={selectedSteup() === index()}>
                <div class="bg-gray-600 h-1.5 w-full"></div>
              </Show>
              <CardContent class="flex flex-col gap-2 p-4 flex-wrap items-start mx-auto relative">
                <div class="text-lg font-bold text-gray-700">Setup</div>
                <div class="flex gap-2 flex-wrap items-start">
                  <For
                    each={store.components.data?.filter((e: any) =>
                      setup.selectedComps.includes(e.id),
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
                                removeSelectedComps(
                                  selectedSteup(),
                                  component.id,
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
                        setup.detailsComps.includes(e.id),
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
                                removeDetails(index(), component.id);
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
                      setup.contextComps.includes(e.id),
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
                                removeContext(index(), component.id);
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
                      setup.selectedComps.includes(e.id),
                    )}
                  >
                    {(component) => (
                      <Show when={component.questions.length > 0}>
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
                                                index(),
                                                question,
                                                answer,
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
                      </Show>
                    )}
                  </For>
                </div>
              </CardContent>
            </Card>
          )}
        </For>
        <Button class="w-1/3" onMouseDown={addSetup}>
          Adicionar setup
        </Button>
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
                class="prose w-full h-full mx-auto wrap-break-word mt-4"
                innerHTML={html() || "Sem descrição..."}
              ></div>
            </div>
          </div>
        </Show>
      </div>
    </main>
  );
}
