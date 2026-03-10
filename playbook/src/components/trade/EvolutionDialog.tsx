import { For } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  setupNumbers: number[];
  currentEvolution?: number;
  onConfirm: (setupNumber: number | undefined) => void;
};

export function EvolutionDialog(props: Props) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent class="max-w-xs">
        <DialogHeader>
          <DialogTitle>Evolução de qual setup?</DialogTitle>
        </DialogHeader>
        <div class="flex flex-col gap-1 mt-2">
          <Button
            variant={props.currentEvolution === undefined ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              props.onConfirm(undefined);
              props.onClose();
            }}
          >
            Nenhum
          </Button>
          <For each={props.setupNumbers}>
            {(num) => (
              <Button
                variant={props.currentEvolution === num ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  props.onConfirm(num);
                  props.onClose();
                }}
              >
                Setup {num}
              </Button>
            )}
          </For>
        </div>
      </DialogContent>
    </Dialog>
  );
}
