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
import { useStore } from "~/store/storeContext";

export function DialogAddComponent(props: {
  setComponentName: (componentName: string) => void;
}) {
  const [componentName, setComponentName] = createSignal("");

  const [state, { createComponent }] = useStore();

  return (
    <Dialog>
      <DialogTrigger as={Button<"button">} variant="outline" size="icon">
        <PlusIcon />
      </DialogTrigger>
      <DialogContent class="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Adicionar componente</DialogTitle>
          <DialogDescription>
            Insira o nome do componente. Clique salvar quando terminar.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <TextField class="grid grid-cols-4 items-center gap-4">
            <TextFieldLabel class="text-right">Componente</TextFieldLabel>
            <TextFieldInput
              value={componentName()}
              class="col-span-3"
              type="text"
              onChange={(e) => setComponentName(e.target.value)}
            />
          </TextField>
        </div>
        <DialogFooter>
          <CloseButton
            class={buttonVariants({ variant: "default", size: "sm" })}
            type="submit"
            onClick={() => {
              createComponent({
                title: componentName(),
                userId: state.user.id,
              });
              setComponentName("");
            }}
            disabled={componentName() === ""}
          >
            Salvar
          </CloseButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
