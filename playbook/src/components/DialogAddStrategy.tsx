import PlusIcon from "lucide-solid/icons/plus";
import { createSignal } from "solid-js";
import { Button, buttonVariants } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  CloseButton,
} from "~/components/ui/dialog";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { useMutation, useQueryClient } from "@tanstack/solid-query";
import { orpc } from "~/lib/orpc";

export function DialogAddStrategy() {
  const [strategyName, setStrategyName] = createSignal("");
  const queryClient = useQueryClient();

  const createStrategy = useMutation(() =>
    orpc.strategy.create.mutationOptions({
      onSuccess: (res) => {
        queryClient.setQueryData(
          orpc.strategy.listByUser.queryKey(),
          (old: any[]) => [...(old ?? []), res],
        );
      },
    }),
  );

  return (
    <Dialog>
      <DialogTrigger as={Button<"button">} variant="outline" size="icon">
        <div class="flex items-center gap-2">
          <PlusIcon class="w-3 h-3" />
        </div>
      </DialogTrigger>
      <DialogContent class="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Adicionar estratégia</DialogTitle>
          <DialogDescription>
            Insira o nome da estratégia. Clique salvar quando terminar.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <TextField class="grid grid-cols-4 items-center gap-4">
            <TextFieldLabel class="text-right">Estratégia</TextFieldLabel>
            <TextFieldInput
              value={strategyName()}
              class="col-span-3"
              type="text"
              onChange={(e) => setStrategyName(e.target.value)}
            />
          </TextField>
        </div>
        <DialogFooter>
          <CloseButton
            class={buttonVariants({ variant: "default", size: "sm" })}
            type="submit"
            onClick={() => {
              createStrategy.mutate({ name: strategyName() });
              setStrategyName("");
            }}
            disabled={strategyName() === ""}
          >
            Salvar
          </CloseButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
