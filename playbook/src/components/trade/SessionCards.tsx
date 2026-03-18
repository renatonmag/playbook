import { For, Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import type { SetupCard } from "~/hooks/useSessionCards";
import type { BarRef } from "./RefsDialog";

type Props = {
  cards: () => SetupCard[];
  componentsData: any;
  createSelectedComps: (setup: any, allComps?: any) => any[];
  assets: () => string[];
  selectedAsset: () => string | undefined;
  setSelectedAsset: (asset: string | undefined) => void;
};

export function SessionCards(props: Props) {
  return (
    <div class="w-1/3 flex flex-col items-center justify-start gap-4 pt-4 overflow-y-auto">
      <div class="flex gap-2 items-center overflow-x-auto px-2 shrink-0">
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
      </div>
      <For each={props.cards()}>
        {(card, cardIndex) => {
          const matchesAsset = () => {
            const active = props.selectedAsset();
            if (!active) return true;
            return card.setups.some((s) => s.asset === active);
          };

          return (
            <Show when={matchesAsset()}>
              <Card class="w-lg max-w-lg h-fit mx-auto overflow-clip">
                <CardContent class="flex flex-col w-full gap-2 p-4 flex-wrap items-start relative">
                  <div class="text-xs text-gray-400">
                    {card.setups[0]?.asset ?? "—"} · {card.id.slice(0, 6)}
                  </div>

                  <For each={card.setups}>
                    {(setup, subIndex) => (
                      <div class="w-full border-l-2 border-transparent pl-2">
                        <div class="flex gap-3 items-center text-sm font-semibold text-gray-700">
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
                        </div>

                        <div class="flex gap-2 flex-wrap items-start mt-1">
                          <For
                            each={props.createSelectedComps(
                              setup,
                              props.componentsData,
                            )}
                          >
                            {(component) => (
                              <div class="flex flex-col gap-1 items-start">
                                <Badge>{component.component?.title}</Badge>
                                <For each={component.details}>
                                  {(detail) => (
                                    <Badge variant="secondary">
                                      {detail?.title}
                                    </Badge>
                                  )}
                                </For>
                              </div>
                            )}
                          </For>
                        </div>

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
                                  <div class="flex flex-col gap-1 items-start">
                                    <Badge>{component.component?.title}</Badge>
                                    <For each={component.details}>
                                      {(detail) => (
                                        <Badge variant="secondary">
                                          {detail?.title}
                                        </Badge>
                                      )}
                                    </For>
                                  </div>
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
    </div>
  );
}
