import { For, Show, createMemo } from "solid-js";
import { ComponentBadge } from "~/components/ComponentBadge";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import EllipsisVertical from "lucide-solid/icons/ellipsis-vertical";

type Props = {
  filteredItems: () => any[];
  search: () => string;
  handleSearchInput: (e: any) => void;
  selectedSetup: () => [number, number] | undefined;
  verdadeTarget: () => [number, number] | undefined;
  loadComponent: any;
  setShowItem: (val: string) => void;
  addTruthComp: (id: number) => void;
  addSelectedComps: (sel: [number, number] | undefined, id: number) => void;
  addDetails: (insertId: number) => void;
  addContext: (cardIdx: number, subIdx: number, id: number) => void;
  removeComps: (id: number) => void;
  taggedComps: () => [string, number, number, number, string] | undefined;
  componentsData: any;
  onManageStrategies: () => void;
};

export function LeftPanel(props: Props) {
  const taggedComponent = createMemo(() => {
    const tagged = props.taggedComps();
    if (!tagged) return undefined;
    return props.componentsData?.find((c: any) => c.id === tagged[1]);
  });

  const associatedDetails = createMemo(() => {
    const comp = taggedComponent();
    if (!comp?.details?.length) return [];
    return comp.details
      .map((id: number) => props.componentsData?.find((c: any) => c.id === id))
      .filter(Boolean);
  });

  return (
    <div class="w-1/3">
      <div class="flex gap-2 items-center max-w-lg mx-auto mb-6 mt-4 w-full">
        <TextField class="grid items-center flex-1">
          <TextFieldInput
            type="text"
            placeholder="Pesquisar..."
            value={props.search()}
            onInput={props.handleSearchInput}
          />
        </TextField>
        <DropdownMenu>
          <DropdownMenuTrigger
            as={Button<"button">}
            variant="outline"
            size="icon"
          >
            <EllipsisVertical class="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={props.onManageStrategies}>
              Estratégias
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Card class="w-lg max-w-lg h-fit mx-auto">
        <CardContent class="flex flex-col gap-2 p-4 flex-wrap mx-auto relative">
          <div class="text-lg font-bold text-gray-700">Padrões</div>
          <div class="flex gap-2 flex-wrap items-start">
            <For each={props.filteredItems() ?? []}>
              {(component) => (
                <ComponentBadge
                  component={component}
                  loadComponent={props.loadComponent}
                  setShowItem={props.setShowItem}
                  addSelectedComps={(_sel: any, id: number) => {
                    const verdade = props.verdadeTarget();
                    const selected = props.selectedSetup();
                    if (
                      verdade &&
                      selected &&
                      verdade[0] === selected[0] &&
                      verdade[1] === selected[1]
                    ) {
                      props.addTruthComp(id);
                    } else {
                      props.addSelectedComps(selected, id);
                    }
                  }}
                  addDetails={props.addDetails}
                  addContext={props.addContext}
                  selectedSetup={props.selectedSetup}
                  removeComps={props.removeComps}
                />
              )}
            </For>
          </div>
        </CardContent>
      </Card>
      <Show when={associatedDetails().length > 0}>
        <Card class="w-lg max-w-lg h-fit mx-auto mt-4">
          <CardContent class="flex flex-col gap-2 p-4 flex-wrap mx-auto relative">
            <div class="text-lg font-bold text-gray-700">
              Detalhes — {taggedComponent()?.title}
            </div>
            <div class="flex gap-2 flex-wrap items-start">
              <For each={associatedDetails()}>
                {(detail) => (
                  <Badge
                    variant="secondary"
                    class="cursor-pointer hover:bg-secondary select-none"
                    onDblClick={() => props.addDetails(detail.id)}
                  >
                    {detail.title}
                  </Badge>
                )}
              </For>
            </div>
          </CardContent>
        </Card>
      </Show>
    </div>
  );
}
