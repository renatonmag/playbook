import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
  untrack,
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
import { EllipsisVertical, X } from "lucide-solid/icons/index";
import { useParams } from "@solidjs/router";
import { Answer, Question, Setup } from "~/db/schema";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { createStore, produce, reconcile, unwrap } from "solid-js/store";
import { set } from "zod";
import id from "zod/v4/locales/id.cjs";
import { ComponentBadge } from "~/components/ComponentBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioItem,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger,
  DropdownMenuGroupLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSubTrigger,
  DropdownMenuShortcut,
} from "~/components/ui/dropdown-menu";
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Sheet,
} from "~/components/ui/sheet";

export default function Trade() {
  const [store, actions] = useStore(),
    [selectedSheetId, setSelectedSheetId] = createSignal<number | undefined>(),
    [selectedSetup, setSelectedSetup] = createSignal<number | undefined>(),
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
        version: 0,
        id: crypto.randomUUID(),
        selectedComps: [],
        detailsComps: [],
        contextComps: [],
        result: "",
      },
    ],
  });

  const params = useParams();

  createEffect(() => {
    const _setups = store.sessions.data?.find(
      (e: any) => e.id === Number(params.id),
    );
    if (!_setups?.setups) return;
    setSetups("items", reconcile(structuredClone(unwrap(_setups.setups))));
  });

  createEffect(() => {
    if (setups.version === 0) return;

    untrack(() =>
      actions.updateSession.mutate({
        id: Number(params.id),
        setups: setups.items,
      }),
    );
    // const timer = setTimeout(async () => {
    // }, 600);
    // onCleanup(() => clearTimeout(timer));
  });

  const component = createMemo(() => {
    return store.components.data?.find(
      (e: any) => e.id === store.displayComponentId,
    );
  });

  const addSetup = () => {
    setSetups(
      produce((draft) => {
        draft.version++;
        draft.items = [
          ...draft.items,
          {
            version: 0,
            id: crypto.randomUUID(),
            selectedComps: [],
            detailsComps: [],
            contextComps: [],
            result: "",
          },
        ];
        setSelectedSetup(draft.items.length - 1);
        return draft;
      }),
    );
  };

  const deleteSetup = (index: number) => {
    setSetups(
      produce((draft) => {
        draft.items.splice(index, 1);
        draft.version++;
        return draft;
      }),
    );
  };

  const addSelectedComps = (index: number, id: number) => {
    if (setups.items.length === 0) return;
    // if (setups.items[index].selectedComps.includes(id)) return;
    setSetups(
      produce((draft) => {
        const setup = draft.items[index];
        setup.selectedComps = [...setup.selectedComps, id];
        setup.version++;
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
        setup.version++;
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
        setup.version++;
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
        setup.version++;
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
        setup.version++;
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
        setup.version++;
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
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const setResult = (index: number, result: string) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[index];
        setup.result = result;
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
      <Sheet
        open={
          selectedSetup() !== undefined && selectedSheetId() === selectedSetup()
        }
        onOpenChange={(value) => {
          console.log(value);
          !value ? setSelectedSheetId(undefined) : () => {};
        }}
        modal={false}
      >
        <SheetContent position="right">
          <SheetHeader>
            <SheetTitle>Edit profile</SheetTitle>
            <SheetDescription>
              Make changes to your profile here. Click save when you're done.
            </SheetDescription>
          </SheetHeader>
          <div class="grid gap-4 py-4">
            <TextField class="grid grid-cols-4 items-center gap-4">
              <TextFieldLabel class="text-right">Name</TextFieldLabel>
              <TextFieldInput
                value="Pedro Duarte"
                class="col-span-3"
                type="text"
              />
            </TextField>
            <TextField class="grid grid-cols-4 items-center gap-4">
              <TextFieldLabel class="text-right">Username</TextFieldLabel>
              <TextFieldInput
                value="@peduarte"
                class="col-span-3"
                type="text"
              />
            </TextField>
          </div>
          <SheetFooter>
            <Button type="submit">Save changes</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
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
                  <ComponentBadge
                    component={component}
                    loadComponent={actions.loadComponent}
                    setShowItem={setShowItem}
                    addSelectedComps={addSelectedComps}
                    addDetails={addDetails}
                    addContext={addContext}
                    selectedSetup={selectedSetup}
                    removeComps={removeSelectedComps}
                  />
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
              onMouseDown={(e) => {
                setSelectedSetup(index());
              }}
            >
              <Show
                when={selectedSetup() === index()}
                fallback={<div class="h-1 w-full"></div>}
              >
                <div class="bg-gray-700 h-1 w-full"></div>
              </Show>
              <CardContent class="flex flex-col w-full gap-2 p-4 flex-wrap items-start relative">
                <div class="flex justify-between items-end w-full">
                  <div class="text-lg font-bold text-gray-700">Setup</div>
                  <div class="flex gap-5 items-center">
                    <div class="text-xs text-gray-600 capitalize">
                      {setup.result}
                    </div>
                    <div class="text-xs text-gray-600">
                      {"v" + setup.version}
                    </div>
                    <div class="text-xs text-gray-600">
                      {setup.id.slice(0, 6)}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        as={Button<"button">}
                        class="mt-[-8px] mr-[-6px]"
                        variant="outline"
                        size="icon"
                      >
                        <EllipsisVertical />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent class="w-48">
                        <DropdownMenuGroup>
                          <DropdownMenuGroupLabel>
                            Resultado
                          </DropdownMenuGroupLabel>
                          <DropdownMenuRadioGroup
                            value={setup.result}
                            onChange={(value) => {
                              setResult(index(), value);
                            }}
                          >
                            <DropdownMenuRadioItem value="gain">
                              Gain
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="loss">
                              Loss
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="even">
                              Even
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="flat">
                              Flat
                            </DropdownMenuRadioItem>
                          </DropdownMenuRadioGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onMouseDown={(e) => {
                              setTimeout(
                                () => setSelectedSheetId(selectedSetup()),
                                350,
                              );
                            }}
                          >
                            <span>Gerenciar imagens</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem></DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSub overlap>
                          <DropdownMenuSubTrigger>
                            <span class="text-red-500">Deletar setup</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem
                                onClick={() => {
                                  deleteSetup(index());
                                }}
                              >
                                <span class="text-red-500">Confirmar</span>
                              </DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuPortal>
                        </DropdownMenuSub>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div class="flex gap-2 flex-wrap items-start">
                  <For
                    each={store.components.data?.filter((e: any) =>
                      setup.selectedComps.includes(e.id),
                    )}
                  >
                    {(component) => (
                      <ComponentBadge
                        component={component}
                        added={true}
                        loadComponent={actions.loadComponent}
                        setShowItem={setShowItem}
                        removeComps={removeSelectedComps}
                        selectedSetup={selectedSetup}
                      />
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
                      <ComponentBadge
                        component={component}
                        added={true}
                        loadComponent={actions.loadComponent}
                        setShowItem={setShowItem}
                        removeComps={removeDetails}
                        selectedSetup={selectedSetup}
                      />
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
                      <ComponentBadge
                        component={component}
                        added={true}
                        loadComponent={actions.loadComponent}
                        setShowItem={setShowItem}
                        removeComps={removeContext}
                        selectedSetup={selectedSetup}
                      />
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
