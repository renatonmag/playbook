import { createEffect, createSignal, For } from "solid-js";
import { Button } from "~/components/ui/button";
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
import { TextField, TextFieldInput } from "~/components/ui/text-field";

type Props = {
  open: boolean;
  strategies: { id: number; name: string }[];
  initialSelected: number[];
  onConfirm: (ids: number[], asset: string) => void;
};

export function DialogSessionStrategies(props: Props) {
  const [selectedIds, setSelectedIds] = createSignal<number[]>(
    props.initialSelected,
  );
  const [assetInput, setAssetInput] = createSignal("");

  createEffect(() => {
    if (props.open) {
      setSelectedIds([...props.initialSelected]);
      setAssetInput("");
    }
  });

  const toggle = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((s) => s !== id),
    );
  };

  const canConfirm = () =>
    selectedIds().length > 0 && assetInput().trim().length > 0;

  const handleConfirm = () => {
    if (!canConfirm()) return;
    props.onConfirm(selectedIds(), assetInput().trim().toUpperCase());
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !canConfirm()) return;
        if (!isOpen) props.onConfirm(selectedIds(), assetInput().trim().toUpperCase());
      }}
    >
      <DialogContent
        class="sm:max-w-[500px]"
        onEscapeKeyDown={(e) => {
          if (!canConfirm()) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (!canConfirm()) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Configurar sessão</DialogTitle>
          <DialogDescription>
            Escolha as estratégias e informe o ativo inicial para esta sessão.
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
          <TextField>
            <Label>Ativo inicial</Label>
            <TextFieldInput
              placeholder="Ex: WINZ25"
              value={assetInput()}
              onInput={(e) => setAssetInput(e.currentTarget.value)}
            />
          </TextField>
        </div>
        <DialogFooter>
          <Button disabled={!canConfirm()} onClick={handleConfirm}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
