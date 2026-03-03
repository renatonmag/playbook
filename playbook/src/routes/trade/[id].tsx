import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
  untrack,
} from "solid-js";
import { ImageCaroulsel } from "~/components/ImageCarousel";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { parseMarkdown } from "~/lib/parseMarkdown";
import { useStore } from "~/store/storeContext";
import { EllipsisVertical } from "lucide-solid/icons/index";
import { useParams } from "@solidjs/router";
import { Setup2 } from "~/db/schema";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { createStore, produce, reconcile, unwrap } from "solid-js/store";
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
} from "~/components/ui/dropdown-menu";
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Sheet,
} from "~/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";
import {
  Combobox,
  ComboboxContent,
  ComboboxControl,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemLabel,
  ComboboxTrigger,
} from "~/components/ui/combobox";

const TIMEFRAMES = [
  "m1",
  "m2",
  "m3",
  "m5",
  "m10",
  "m15",
  "m30",
  "h1",
  "h2",
  "h4",
  "h6",
  "h8",
  "h12",
  "d1",
  "w1",
];

type BarRef = { timeframe: string; begin: number; end: number };
type SetupCard = { id: string; setups: Setup2[] };

export default function Trade() {
  const [store, actions] = useStore(),
    [selectedSheetId, setSelectedSheetId] = createSignal<
      [number, number] | undefined
    >(),
    [selectedSetup, setSelectedSetup] = createSignal<
      [number, number] | undefined
    >(),
    [taggedComps, setTaggedComps] = createSignal<
      [number, number, number, string] | undefined
    >(),
    [showItem, setShowItem] = createSignal<string>(""),
    [search, setSearch] = createSignal(""),
    [refsDialogTarget, setRefsDialogTarget] = createSignal<
      [number, number] | undefined
    >();

  const [refsDraft, setRefsDraft] = createStore<BarRef[]>([]);

  const [setups, setSetups] = createStore<{
    version: number;
    items: SetupCard[];
  }>({
    version: 0,
    items: [
      {
        id: crypto.randomUUID(),
        setups: [
          {
            version: 0,
            id: crypto.randomUUID(),
            selectedComps: [],
            result: "",
          },
        ],
      },
    ],
  });

  const params = useParams();

  // Load: group raw Setup2[] by cardId
  createEffect(() => {
    const _setups = store.sessions.data?.find(
      (e: any) => e.id === Number(params.id),
    );
    if (!_setups?.setups2) return;

    const raw: any[] = _setups.setups2;
    const grouped = new Map<string, Setup2[]>();
    for (const s of raw) {
      const key = s.cardId ?? s.id; // backward compat: old data each Setup2 is its own card
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
    }
    const cards: SetupCard[] = [...grouped.entries()].map(([id, setups]) => ({
      id,
      setups,
    }));
    setSetups("items", reconcile(structuredClone(unwrap(cards))));
  });

  // Save: flatten cards into Setup2[] with cardId field (debounced 300ms)
  createEffect(() => {
    if (setups.version === 0) return;

    const id = Number(params.id);
    const payload = untrack(() =>
      setups.items.flatMap((card) =>
        card.setups.map((s) => ({ ...s, cardId: card.id })),
      ),
    );

    const timer = setTimeout(() => {
      actions.updateSession.mutate({ id, setups: payload });
    }, 500);
    onCleanup(() => clearTimeout(timer));
  });

  const component = createMemo(() => {
    return store.components.data?.find(
      (e: any) => e.id === store.displayComponentId,
    );
  });

  const isActiveSetup = (cardIndex: number, subIndex: number) => {
    const sel = selectedSetup();
    return sel !== undefined && sel[0] === cardIndex && sel[1] === subIndex;
  };

  const sheetOpen = () => {
    const sel = selectedSetup();
    const sheet = selectedSheetId();
    return (
      sel !== undefined &&
      sheet !== undefined &&
      sel[0] === sheet[0] &&
      sel[1] === sheet[1]
    );
  };

  // Add a new card with one empty sub-setup
  const addCard = () => {
    const newCardId = crypto.randomUUID();
    setSetups(
      produce((draft) => {
        draft.version++;
        draft.items = [
          ...draft.items,
          {
            id: newCardId,
            setups: [
              {
                version: 0,
                id: crypto.randomUUID(),
                selectedComps: [],
                result: "",
              },
            ],
          },
        ];
        return draft;
      }),
    );
    setSelectedSetup([setups.items.length - 1, 0]);
  };

  // Add a sub-setup within an existing card
  const addSubSetup = (cardIndex: number) => {
    setSetups(
      produce((draft) => {
        draft.items[cardIndex].setups.push({
          version: 0,
          id: crypto.randomUUID(),
          selectedComps: [],
          result: "",
        });
        draft.version++;
        return draft;
      }),
    );
    setSelectedSetup([cardIndex, setups.items[cardIndex].setups.length - 1]);
  };

  // Delete sub-setup; remove card if it was the last one
  const deleteSetup = (cardIdx: number, subIdx: number) => {
    setSetups(
      produce((draft) => {
        draft.items[cardIdx].setups.splice(subIdx, 1);
        if (draft.items[cardIdx].setups.length === 0) {
          draft.items.splice(cardIdx, 1);
        }
        draft.version++;
        return draft;
      }),
    );
  };

  const addSelectedComps = (sel: [number, number] | undefined, id: number) => {
    if (!sel) {
      alert("Selecione um setup");
      return;
    }
    const [cardIdx, subIdx] = sel;
    if (!setups.items?.[cardIdx]?.setups?.[subIdx]?.selectedComps) {
      alert("Selecione um setup");
      return;
    }
    if (
      setups.items[cardIdx].setups[subIdx].selectedComps.findIndex(
        (c) => c.component === id,
      ) !== -1
    )
      return;
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx];
        setup.selectedComps = [
          ...setup.selectedComps,
          { component: id, details: [] },
        ];
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const removeSelectedComps = (cardIdx: number, subIdx: number, id: number) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx];
        setup.selectedComps = setup.selectedComps.filter(
          (e) => e.component !== id,
        );
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  // Reads taggedComps to know which setup to add the detail to
  const addDetails = (insertId: number) => {
    const tagged = taggedComps();
    if (!tagged) return;
    const [componentId, cardIdx, subIdx] = tagged;
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx];
        const component = setup.selectedComps.find(
          (e) => e.component === componentId,
        );
        if (!component) return;
        component.details = [...component.details, insertId];
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const removeDetails = (
    cardIdx: number,
    subIdx: number,
    componentId: number,
    detailId: number,
  ) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx];
        const component = setup.selectedComps.find(
          (e) => e.component === componentId,
        );
        if (!component) return;
        component.details = component.details.filter((e) => e !== detailId);
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const addContext = (cardIdx: number, subIdx: number, id: number) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx] as any;
        setup.contextComps = [...(setup.contextComps || []), id];
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const removeContext = (cardIdx: number, subIdx: number, id: number) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx] as any;
        setup.contextComps = (setup.contextComps || []).filter(
          (e: number) => e !== id,
        );
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const setResult = (cardIdx: number, subIdx: number, result: string) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx];
        setup.result = result;
        draft.version++;
        return draft;
      }),
    );
  };

  const openRefsDialog = (cardIdx: number, subIdx: number) => {
    const existing = unwrap(
      (setups.items[cardIdx].setups[subIdx] as any).refs ?? [],
    );
    setRefsDraft(reconcile(structuredClone(existing)));
    setRefsDialogTarget([cardIdx, subIdx]);
  };

  const saveRefs = () => {
    const target = refsDialogTarget();
    if (!target) return;
    const [cardIdx, subIdx] = target;
    setSetups(
      produce((draft) => {
        (draft.items[cardIdx].setups[subIdx] as any).refs = unwrap(refsDraft);
        draft.items[cardIdx].setups[subIdx].version++;
        draft.version++;
        return draft;
      }),
    );
    setRefsDialogTarget(undefined);
  };

  const moveComponent = (
    cardIdx: number,
    subIdx: number,
    componentId: number,
    direction: "left" | "right",
  ) => {
    setSetups(
      produce((draft) => {
        const setup = draft.items[cardIdx].setups[subIdx];
        const idx = setup.selectedComps.findIndex(
          (c) => c.component === componentId,
        );
        if (idx === -1) return draft;
        const newIdx = direction === "left" ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= setup.selectedComps.length) return draft;
        [setup.selectedComps[idx], setup.selectedComps[newIdx]] = [
          setup.selectedComps[newIdx],
          setup.selectedComps[idx],
        ];
        setup.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const copyComponentToSetup = (
    srcCard: number,
    srcSub: number,
    componentId: number,
  ) => {
    const target = selectedSetup();
    if (!target) return;
    const [targetCard, targetSub] = target;
    if (targetCard === srcCard && targetSub === srcSub) return;

    const sourceComp = setups.items[srcCard].setups[srcSub].selectedComps.find(
      (c) => c.component === componentId,
    );
    if (!sourceComp) return;

    if (
      setups.items[targetCard].setups[targetSub].selectedComps.some(
        (c) => c.component === componentId,
      )
    )
      return;

    setSetups(
      produce((draft) => {
        const tgt = draft.items[targetCard].setups[targetSub];
        tgt.selectedComps = [
          ...tgt.selectedComps,
          {
            component: sourceComp.component,
            details: [...sourceComp.details],
          },
        ];
        tgt.version++;
        draft.version++;
        return draft;
      }),
    );
  };

  const tagComponent = (
    id: number,
    cardIdx: number,
    subIdx: number,
    type: string,
  ) => {
    setTaggedComps([id, cardIdx, subIdx, type]);
  };

  const untagComponent = () => {
    setTaggedComps(undefined);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!e.ctrlKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    const tagged = taggedComps();
    if (!tagged) return;
    e.preventDefault();
    const [componentId, cardIdx, subIdx] = tagged;
    moveComponent(
      cardIdx,
      subIdx,
      componentId,
      e.key === "ArrowLeft" ? "left" : "right",
    );
  };
  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const [html] = createResource(
    () => component()?.markdown?.content || "",
    parseMarkdown,
  );

  const filteredItems = createMemo(() => {
    const query = search().toLowerCase();
    if (!query) return store.components.data;
    return store.components.data.filter((item) =>
      item.title.toLowerCase().includes(query),
    );
  });

  let timer: ReturnType<typeof setTimeout>;
  const handleSearchInput = (e: any) => {
    clearTimeout(timer);
    const value = e.currentTarget.value;
    timer = setTimeout(() => {
      setSearch(value);
    }, 200);
  };

  const createSelectedComps = (setup: any, allComps?: any) => {
    if (!allComps) return [];
    return setup.selectedComps.map((e: any) => {
      const component = allComps?.find((c: any) => c.id === e.component);
      const details = e.details.map((detailId: any) => {
        return allComps?.find((c: any) => c.id === detailId);
      });
      return { ...e, details, component };
    });
  };

  return (
    <main class="flex w-full h-[calc(100vh-52px)] text-gray-800 p-1.5 gap-1">
      <Sheet
        open={sheetOpen()}
        onOpenChange={(value) => {
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

      {/* Refs dialog */}
      <Dialog
        open={refsDialogTarget() !== undefined}
        onOpenChange={(open) => {
          if (!open) setRefsDialogTarget(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Referência de barras</DialogTitle>
          </DialogHeader>
          <div class="flex flex-col gap-2 mt-2">
            <For each={refsDraft}>
              {(row, i) => (
                <div class="flex gap-2 items-center">
                  <Combobox
                    options={TIMEFRAMES}
                    value={row.timeframe || null}
                    onChange={(val) =>
                      setRefsDraft(i(), "timeframe", val ?? "")
                    }
                    onInputChange={(val) => setRefsDraft(i(), "timeframe", val)}
                    noResetInputOnBlur
                    itemComponent={(props) => (
                      <ComboboxItem item={props.item}>
                        <ComboboxItemLabel>
                          {props.item.rawValue}
                        </ComboboxItemLabel>
                      </ComboboxItem>
                    )}
                  >
                    <ComboboxControl>
                      <ComboboxInput placeholder="Timeframe" />
                      <ComboboxTrigger />
                    </ComboboxControl>
                    <ComboboxContent />
                  </Combobox>
                  <TextField>
                    <TextFieldInput
                      type="number"
                      placeholder="Início"
                      min="1"
                      value={String(row.begin)}
                      onInput={(e) =>
                        setRefsDraft(
                          i(),
                          "begin",
                          Number(e.currentTarget.value),
                        )
                      }
                    />
                  </TextField>
                  <TextField>
                    <TextFieldInput
                      type="number"
                      placeholder="Fim"
                      value={String(row.end)}
                      onInput={(e) =>
                        setRefsDraft(i(), "end", Number(e.currentTarget.value))
                      }
                    />
                  </TextField>
                </div>
              )}
            </For>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRefsDraft(
                  produce((d) => {
                    d.push({ timeframe: "", begin: 1, end: 0 });
                  }),
                )
              }
            >
              Adicionar
            </Button>
          </div>
          <DialogFooter class="mt-4">
            <Button onClick={saveRefs}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Left panel: component palette */}
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
                    removeComps={(id) => {
                      const sel = selectedSetup();
                      if (sel) removeSelectedComps(sel[0], sel[1], id);
                    }}
                  />
                )}
              </For>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle panel: setup cards */}
      <div class="w-1/3 flex flex-col items-center justify-start gap-4 pt-4 overflow-y-auto">
        <For each={setups.items}>
          {(card, cardIndex) => {
            const activeSubIdx = () => {
              const sel = selectedSetup();
              return sel && sel[0] === cardIndex() ? sel[1] : undefined;
            };
            const activeSetupResult = () => {
              const subIdx = activeSubIdx();
              return subIdx !== undefined
                ? (card.setups[subIdx]?.result ?? "")
                : "";
            };

            return (
              <Card class="w-lg max-w-lg h-fit mx-auto overflow-clip">
                <CardContent class="flex flex-col w-full gap-2 p-4 flex-wrap items-start relative">
                  {/* Card header */}
                  <div class="flex justify-between items-center w-full">
                    <div class="text-xs text-gray-400">
                      {card.id.slice(0, 6)}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        as={Button<"button">}
                        class="mt-[-8px] mr-[-6px]"
                        variant="ghost"
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
                            value={activeSetupResult()}
                            onChange={(value) => {
                              const subIdx = activeSubIdx();
                              if (subIdx !== undefined)
                                setResult(cardIndex(), subIdx, value);
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
                            onMouseDown={() => {
                              setTimeout(
                                () => setSelectedSheetId(selectedSetup()),
                                350,
                              );
                            }}
                          >
                            <span>Gerenciar imagens</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => addSubSetup(cardIndex())}
                          >
                            Adicionar setup
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSub overlap>
                          <DropdownMenuSubTrigger>
                            <span class="text-red-500">Deletar setup</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem
                                onClick={() => {
                                  const subIdx = activeSubIdx();
                                  if (subIdx !== undefined)
                                    deleteSetup(cardIndex(), subIdx);
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

                  {/* Sub-setups rendered concurrently */}
                  <For each={card.setups}>
                    {(setup, subIndex) => (
                      <div
                        class="w-full border-l-2 pl-2"
                        classList={{
                          "border-gray-700": isActiveSetup(
                            cardIndex(),
                            subIndex(),
                          ),
                          "border-transparent": !isActiveSetup(
                            cardIndex(),
                            subIndex(),
                          ),
                        }}
                      >
                        {/* Sub-setup title row — click to select */}
                        <ContextMenu>
                          <ContextMenuTrigger
                            as="div"
                            class="flex gap-3 items-center cursor-pointer text-sm font-semibold text-gray-700"
                            onMouseDown={() =>
                              setSelectedSetup([cardIndex(), subIndex()])
                            }
                          >
                            Setup {subIndex() + 1}
                            <span class="text-xs text-gray-500 font-normal capitalize">
                              {setup.result}
                            </span>
                            <span class="text-xs text-gray-400 font-normal">
                              v{setup.version}
                            </span>
                            <Show when={(setup as any).refs?.length > 0}>
                              <span class="text-xs text-gray-400 font-normal">
                                {(setup as any).refs
                                  .map((r: BarRef) =>
                                    r.end === 0
                                      ? `${r.timeframe} b${r.begin}`
                                      : `${r.timeframe} b${r.begin}..${r.end}`,
                                  )
                                  .join(", ")}
                              </span>
                            </Show>
                          </ContextMenuTrigger>
                          <ContextMenuContent class="w-36">
                            <ContextMenuItem
                              onSelect={() =>
                                openRefsDialog(cardIndex(), subIndex())
                              }
                            >
                              Referência
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>

                        {/* Component badges */}
                        <div class="flex gap-2 flex-wrap items-start mt-1">
                          <For
                            each={createSelectedComps(
                              setup,
                              store.components.data,
                            )}
                          >
                            {(component) => (
                              <ComponentBadge
                                component={component}
                                added={true}
                                cardIndex={cardIndex()}
                                subIndex={subIndex()}
                                loadComponent={actions.loadComponent}
                                setShowItem={setShowItem}
                                removeComps={(id) =>
                                  removeSelectedComps(
                                    cardIndex(),
                                    subIndex(),
                                    id,
                                  )
                                }
                                selectedSetup={selectedSetup}
                                tagComponent={tagComponent}
                                untagComponent={untagComponent}
                                taggedComp={taggedComps()}
                                removeDetails={(compId, detailId) =>
                                  removeDetails(
                                    cardIndex(),
                                    subIndex(),
                                    compId,
                                    detailId,
                                  )
                                }
                                copyToActiveSetup={(componentId) =>
                                  copyComponentToSetup(
                                    cardIndex(),
                                    subIndex(),
                                    componentId,
                                  )
                                }
                                isInActiveSetup={isActiveSetup(
                                  cardIndex(),
                                  subIndex(),
                                )}
                                moveComponent={(componentId, direction) =>
                                  moveComponent(
                                    cardIndex(),
                                    subIndex(),
                                    componentId,
                                    direction,
                                  )
                                }
                              />
                            )}
                          </For>
                        </div>
                      </div>
                    )}
                  </For>
                </CardContent>
              </Card>
            );
          }}
        </For>
        <Button class="w-1/3" onMouseDown={addCard}>
          Adicionar card
        </Button>
      </div>

      {/* Right panel: component detail */}
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
