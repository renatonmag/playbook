import { createEffect, createSignal, For } from "solid-js";
import { Button, buttonVariants } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

type Props = {
  open: boolean;
  strategies: { id: number; name: string }[];
  initialSelected: number[];
  onConfirm: (ids: number[]) => void;
};

export function DialogSessionStrategies(props: Props) {
  const [selectedIds, setSelectedIds] = createSignal<number[]>(
    props.initialSelected,
  );

  createEffect(() => {
    if (props.open) {
      setSelectedIds([...props.initialSelected]);
    }
  });

  const toggle = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((s) => s !== id),
    );
  };

  const handleConfirm = () => {
    if (selectedIds().length === 0) return;
    props.onConfirm(selectedIds());
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(isOpen) => {
        // Block closing if no strategy is selected
        if (!isOpen && selectedIds().length === 0) return;
        if (!isOpen) props.onConfirm(selectedIds());
      }}
    >
      <DialogContent
        class="sm:max-w-[500px]"
        // Prevent closing via Escape when nothing selected
        onEscapeKeyDown={(e) => {
          if (selectedIds().length === 0) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (selectedIds().length === 0) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Selecionar estratégias</DialogTitle>
          <DialogDescription>
            Escolha as estratégias que serão usadas nesta sessão. Selecione ao
            menos uma para continuar.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <For each={props.strategies}>
            {(strategy) => (
              <div class="flex items-start space-x-2">
                <Checkbox
                  id={`strategy-${strategy.id}`}
                  checked={selectedIds().includes(strategy.id)}
                  onChange={(checked) => toggle(strategy.id, checked)}
                />
                <div class="grid gap-1.5 leading-none">
                  <Label for={`strategy-${strategy.id}-input`}>
                    {strategy.name}
                  </Label>
                </div>
              </div>
            )}
          </For>
        </div>
        <DialogFooter>
          <Button disabled={selectedIds().length === 0} onClick={handleConfirm}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
