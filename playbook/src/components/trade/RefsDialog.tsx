import { For } from "solid-js";
import { produce } from "solid-js/store";
import { Button } from "~/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxControl,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemLabel,
  ComboboxTrigger,
} from "~/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  TextField,
  TextFieldInput,
} from "~/components/ui/text-field";

const TIMEFRAMES = [
  "m1", "m2", "m3", "m5", "m10", "m15", "m30",
  "h1", "h2", "h4", "h6", "h8", "h12", "d1", "w1",
];

export type BarRef = { timeframe: string; begin: number; end: number };

type Props = {
  open: boolean;
  onClose: () => void;
  refsDraft: BarRef[];
  setRefsDraft: any;
  saveRefs: () => void;
};

export function RefsDialog(props: Props) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Referência de barras</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-2 mt-2">
          <For each={props.refsDraft}>
            {(row, i) => (
              <div class="flex gap-2 items-center">
                <Combobox
                  options={TIMEFRAMES}
                  value={row.timeframe || null}
                  onChange={(val) =>
                    props.setRefsDraft(i(), "timeframe", val ?? "")
                  }
                  onInputChange={(val) =>
                    props.setRefsDraft(i(), "timeframe", val)
                  }
                  noResetInputOnBlur
                  itemComponent={(p) => (
                    <ComboboxItem item={p.item}>
                      <ComboboxItemLabel>{p.item.rawValue}</ComboboxItemLabel>
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
                      props.setRefsDraft(
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
                      props.setRefsDraft(
                        i(),
                        "end",
                        Number(e.currentTarget.value),
                      )
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
              props.setRefsDraft(
                produce((d: BarRef[]) => {
                  d.push({ timeframe: "", begin: 1, end: 0 });
                }),
              )
            }
          >
            Adicionar
          </Button>
        </div>
        <DialogFooter class="mt-4">
          <Button onClick={props.saveRefs}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
