import { For } from "solid-js";
import { ComponentBadge } from "~/components/ComponentBadge";
import { Card, CardContent } from "~/components/ui/card";
import {
  TextField,
  TextFieldInput,
} from "~/components/ui/text-field";

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
};

export function LeftPanel(props: Props) {
  return (
    <div class="w-1/3">
      <TextField class="grid w-full max-w-lg mx-auto items-center mb-6 mt-4">
        <TextFieldInput
          type="text"
          placeholder="Pesquisar..."
          value={props.search()}
          onInput={props.handleSearchInput}
        />
      </TextField>
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
                    if (props.verdadeTarget()) {
                      props.addTruthComp(id);
                    } else {
                      props.addSelectedComps(props.selectedSetup(), id);
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
    </div>
  );
}
