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

{
  /* <DropdownMenu>
        <DropdownMenuTrigger as={Button<"button">}>Git Settings</DropdownMenuTrigger>
        <DropdownMenuContent class="w-48">
          <DropdownMenuItem>
            <span>Commit</span>
            <DropdownMenuShortcut>⌘+K</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <span>Push</span>
            <DropdownMenuShortcut>⇧+⌘+K</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <span>Update Project</span>
            <DropdownMenuShortcut>⌘+T</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSub overlap>
            <DropdownMenuSubTrigger>GitHub</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Create Pull Request…</DropdownMenuItem>
                <DropdownMenuItem>View Pull Requests</DropdownMenuItem>
                <DropdownMenuItem>Sync Fork</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Open on GitHub</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={showGitLog()} onChange={setShowGitLog}>
            Show Git Log
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={showHistory()} onChange={setShowHistory}>
            Show History
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuGroupLabel>Branches</DropdownMenuGroupLabel>
            <DropdownMenuRadioGroup value={branch()} onChange={setBranch}>
              <DropdownMenuRadioItem value="main">main</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="develop">develop</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu> */
}

export const ComponentBadge = (props: {
  component: any;
  added?: boolean;
  loadComponent: any;
  setShowItem: any;
  addSelectedComps?: any;
  removeSelectedComps?: any;
  selectedSetup: any;
}) => {
  return (
    <Switch fallback={<div>Loading...</div>}>
      <Match when={props.added}>
        <DropdownMenu>
          <DropdownMenuTrigger as={Badge}>
            {props.component.title}
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-48">
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
                props.removeSelectedComps(
                  props.selectedSetup(),
                  props.component.id,
                );
              }}
            >
              <span>Remover</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Match>
      <Match when={!props.added}>
        <DropdownMenu>
          <DropdownMenuTrigger as={Badge}>
            {props.component.title}
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-48">
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
            <DropdownMenuItem>
              <span>Adicionar detalhe</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
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
