import { Match, Switch } from "solid-js";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export const ComponentBadge = (props: {
  component: any;
  added?: boolean;
  loadComponent: any;
  setShowItem: any;
  addSelectedComps?: any;
  addDetails?: any;
  addContext?: any;
  removeComps?: any;
  selectedSetup: any;
}) => {
  return (
    <Switch fallback={<div>Loading...</div>}>
      <Match when={props.added}>
        <DropdownMenu>
          <DropdownMenuTrigger as={Badge} class="cursor-pointer">
            {props.component.title}
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-36">
            <DropdownMenuItem
              onMouseDown={() => {
                props.loadComponent(props.component.id);
                props.setShowItem(props.component.id);
              }}
            >
              <span>Mostrar</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onMouseDown={() => {
                props.removeComps(props.selectedSetup(), props.component.id);
              }}
            >
              <span>Remover</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Match>
      <Match when={!props.added}>
        <DropdownMenu>
          <DropdownMenuTrigger as={Badge} class="cursor-pointer">
            {props.component.title}
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-40">
            <DropdownMenuItem
              onMouseDown={() => {
                props.loadComponent(props.component.id);
                props.setShowItem(props.component.id);
              }}
            >
              <span>Mostrar</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onMouseDown={() => {
                props.addSelectedComps(
                  props.selectedSetup(),
                  props.component.id,
                );
              }}
            >
              <span>Adicionar setup</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onMouseDown={() => {
                props.addDetails(props.selectedSetup(), props.component.id);
              }}
            >
              <span>Adicionar detalhe</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onMouseDown={() => {
                props.addContext(props.selectedSetup(), props.component.id);
              }}
            >
              <span>Adicionar contexto</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Match>
    </Switch>
  );
  // <Badge class="cursor-pointer">{props.setup.title}</Badge>;
};

{
  /* <Switch fallback={<div>Loading...</div>}>
        <Match when={hoverItem1() === component.id}>
          <Button
            variant={"secondary"}
            onMouseDown={() => {
              actions.loadComponent(component.id);
              setShowItem(component.id);
            }}
          >
            Mostrar
          </Button>
          <Button
            variant={"secondary"}
            onMouseDown={() => {
              addSelectedComps(selectedSetup(), component.id);
            }}
          >
            Adicionar
          </Button>
          <Button
            variant={"secondary"}
            size={"icon"}
            onMouseDown={(e) => {
              e.stopPropagation();
              setHoverItem1("");
            }}
          >
            <X />
          </Button>
        </Match>
        <Match when={hoverItem1() !== component.id}>{component.title}</Match>
      </Switch> */
}
