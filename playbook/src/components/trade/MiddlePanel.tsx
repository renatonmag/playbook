import { createSignal, For, Show } from "solid-js";
import { ComponentBadge } from "~/components/ComponentBadge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Setup2 } from "~/db/schema";
import { EllipsisVertical } from "lucide-solid/icons/index";
import Plus from "lucide-solid/icons/plus";
import { BarRef } from "./RefsDialog";

type SetupCard = { id: string; setups: Setup2[] };

type Props = {
  setups: { version: number; items: SetupCard[] };
  selectedSetup: () => [number, number] | undefined;
  setSelectedSetup: (val: [number, number] | undefined) => void;
  taggedComps: () => [number, number, number, string] | undefined;
  verdadeTarget: () => [number, number] | undefined;
  componentsData: any;
  isActiveSetup: (cardIdx: number, subIdx: number) => boolean;
  createSelectedComps: (setup: any, allComps?: any) => any[];
  addCard: (asset?: string) => void;
  addSubSetup: (cardIndex: number) => void;
  deleteSetup: (cardIdx: number, subIdx: number) => void;
  setResult: (cardIdx: number, subIdx: number, result: string) => void;
  openRefsDialog: (cardIdx: number, subIdx: number) => void;
  toggleVerdade: (cardIdx: number, subIdx: number) => void;
  removeSelectedComps: (cardIdx: number, subIdx: number, id: number) => void;
  removeDetails: (
    cardIdx: number,
    subIdx: number,
    compId: number,
    detailId: number,
  ) => void;
  removeTruthComp: (cardIdx: number, subIdx: number, id: number) => void;
  removeTruthDetail: (
    cardIdx: number,
    subIdx: number,
    compId: number,
    detailId: number,
  ) => void;
  tagComponent: (
    id: number,
    cardIdx: number,
    subIdx: number,
    type: string,
  ) => void;
  untagComponent: () => void;
  copyComponentToSetup: (
    srcCard: number,
    srcSub: number,
    componentId: number,
  ) => void;
  moveComponent: (
    cardIdx: number,
    subIdx: number,
    componentId: number,
    direction: "left" | "right",
  ) => void;
  setSelectedSheetId: (val: [number, number] | undefined) => void;
  loadComponent: any;
  setShowItem: (val: string) => void;
  openEvolutionDialog: (cardIdx: number, subIdx: number) => void;
  assets: () => string[];
  selectedAsset: () => string | undefined;
  setSelectedAsset: (asset: string | undefined) => void;
  addAsset: (name: string) => void;
};

export function MiddlePanel(props: Props) {
  const [addingAsset, setAddingAsset] = createSignal(false);
  let assetInputRef: HTMLInputElement | undefined;

  const commitAsset = () => {
    const val = assetInputRef?.value.trim().toUpperCase();
    setAddingAsset(false);
    if (val) props.addAsset(val);
  };

  return (
    <div class="w-1/3 flex flex-col items-center justify-start gap-4 pt-4 overflow-y-auto">
      <div class="flex gap-2 items-center overflow-x-auto px-2 ">
        <For each={props.assets()}>
          {(asset) => (
            <Button
              variant={props.selectedAsset() === asset ? "default" : "outline"}
              size="sm"
              class="shrink-0"
              onMouseDown={() =>
                props.setSelectedAsset(
                  props.selectedAsset() === asset ? undefined : asset,
                )
              }
            >
              {asset}
            </Button>
          )}
        </For>
        <Show
          when={addingAsset()}
          fallback={
            <Button
              variant="ghost"
              size="icon"
              class="shrink-0"
              onClick={() => {
                setAddingAsset(true);
                requestAnimationFrame(() => assetInputRef?.focus());
              }}
            >
              <Plus size={16} />
            </Button>
          }
        >
          <input
            ref={assetInputRef}
            class="border rounded px-2 py-1 text-sm w-24 shrink-0"
            placeholder="ATIVO"
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAsset();
              if (e.key === "Escape") setAddingAsset(false);
            }}
            onBlur={commitAsset}
          />
        </Show>
      </div>
      <For each={props.setups.items}>
        {(card, cardIndex) => {
          const matchesAsset = () => {
            const active = props.selectedAsset();
            if (!active) return true;
            return card.setups.some((s) => s.asset === active);
          };

          const activeSubIdx = () => {
            const sel = props.selectedSetup();
            return sel && sel[0] === cardIndex() ? sel[1] : undefined;
          };
          const activeSetupResult = () => {
            const subIdx = activeSubIdx();
            return subIdx !== undefined
              ? (card.setups[subIdx]?.result ?? "")
              : "";
          };

          return (
            <Show when={matchesAsset()}>
              <Card class="w-lg max-w-lg h-fit mx-auto overflow-clip">
                <CardContent class="flex flex-col w-full gap-2 p-4 flex-wrap items-start relative">
                  {/* Card header */}
                  <div class="flex justify-between items-center w-full">
                    <div class="text-xs text-gray-400">
                      {card.setups[0]?.asset ?? "—"} · {card.id.slice(0, 6)}
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
                                props.setResult(cardIndex(), subIdx, value);
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
                            disabled={
                              props.selectedSetup()?.[0] !== cardIndex()
                            }
                            onMouseDown={() => {
                              setTimeout(
                                () =>
                                  props.setSelectedSheetId(
                                    props.selectedSetup(),
                                  ),
                                350,
                              );
                            }}
                          >
                            <span>Gerenciar imagens</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => props.addSubSetup(cardIndex())}
                          >
                            Adicionar setup
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSub overlap>
                          <DropdownMenuSubTrigger
                            disabled={
                              props.selectedSetup()?.[0] !== cardIndex()
                            }
                          >
                            <span class="text-red-500">Deletar setup</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem
                                onClick={() => {
                                  const subIdx = activeSubIdx();
                                  if (subIdx !== undefined)
                                    props.deleteSetup(cardIndex(), subIdx);
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
                          "border-gray-700": props.isActiveSetup(
                            cardIndex(),
                            subIndex(),
                          ),
                          "border-transparent": !props.isActiveSetup(
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
                              props.setSelectedSetup([cardIndex(), subIndex()])
                            }
                          >
                            {(setup as any).evolution
                              ? `Evolução - Setup ${(setup as any).evolution}`
                              : `Setup ${(setup as any).setupNumber ?? subIndex() + 1}`}
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
                                props.openRefsDialog(cardIndex(), subIndex())
                              }
                            >
                              Referência
                            </ContextMenuItem>
                            <ContextMenuCheckboxItem
                              checked={(setup as any).showTruth ?? false}
                              onChange={() =>
                                props.toggleVerdade(cardIndex(), subIndex())
                              }
                            >
                              Verdade
                            </ContextMenuCheckboxItem>
                            <ContextMenuItem
                              onSelect={() =>
                                props.openEvolutionDialog(
                                  cardIndex(),
                                  subIndex(),
                                )
                              }
                            >
                              Evolução
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>

                        {/* Component badges */}
                        <div class="flex gap-2 flex-wrap items-start mt-1">
                          <For
                            each={props.createSelectedComps(
                              setup,
                              props.componentsData,
                            )}
                          >
                            {(component) => (
                              <ComponentBadge
                                component={component}
                                added={true}
                                cardIndex={cardIndex()}
                                subIndex={subIndex()}
                                loadComponent={props.loadComponent}
                                setShowItem={props.setShowItem}
                                removeComps={(id) =>
                                  props.removeSelectedComps(
                                    cardIndex(),
                                    subIndex(),
                                    id,
                                  )
                                }
                                selectedSetup={props.selectedSetup}
                                tagComponent={props.tagComponent}
                                untagComponent={props.untagComponent}
                                taggedComp={props.taggedComps()}
                                removeDetails={(compId, detailId) =>
                                  props.removeDetails(
                                    cardIndex(),
                                    subIndex(),
                                    compId,
                                    detailId,
                                  )
                                }
                                copyToActiveSetup={(componentId) =>
                                  props.copyComponentToSetup(
                                    cardIndex(),
                                    subIndex(),
                                    componentId,
                                  )
                                }
                                isInActiveSetup={props.isActiveSetup(
                                  cardIndex(),
                                  subIndex(),
                                )}
                                moveComponent={(componentId, direction) =>
                                  props.moveComponent(
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

                        {/* Verdade section */}
                        <Show when={(setup as any).showTruth}>
                          <div class="mt-2">
                            <div class="text-xs font-medium mb-1 text-gray-700">
                              Verdade
                            </div>
                            <div class="flex gap-2 flex-wrap items-start">
                              <For
                                each={props.createSelectedComps(
                                  {
                                    selectedComps: (setup as any).truth ?? [],
                                  },
                                  props.componentsData,
                                )}
                              >
                                {(component) => (
                                  <ComponentBadge
                                    component={component}
                                    added={true}
                                    cardIndex={cardIndex()}
                                    subIndex={subIndex()}
                                    loadComponent={props.loadComponent}
                                    setShowItem={props.setShowItem}
                                    removeComps={(id) =>
                                      props.removeTruthComp(
                                        cardIndex(),
                                        subIndex(),
                                        id,
                                      )
                                    }
                                    selectedSetup={props.verdadeTarget}
                                    tagComponent={props.tagComponent}
                                    untagComponent={props.untagComponent}
                                    taggedComp={props.taggedComps()}
                                    removeDetails={(compId, detailId) =>
                                      props.removeTruthDetail(
                                        cardIndex(),
                                        subIndex(),
                                        compId,
                                        detailId,
                                      )
                                    }
                                  />
                                )}
                              </For>
                            </div>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </CardContent>
              </Card>
            </Show>
          );
        }}
      </For>
      <Button class="w-1/3" onMouseDown={() => props.addCard()}>
        Adicionar card
      </Button>
    </div>
  );
}
