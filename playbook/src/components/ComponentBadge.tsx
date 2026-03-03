import { createEffect, For, Match, Switch } from "solid-js";
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
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuGroupLabel,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./ui/context-menu";
import { selectComponent } from "~/store/checklist";

export const ComponentBadge = (props: {
  component: any;
  added?: boolean;
  location?: string;
  setupIndex?: number;
  loadComponent: any;
  setShowItem: any;
  addSelectedComps?: any;
  addDetails?: any;
  addContext?: any;
  removeComps?: any;
  selectedSetup: any;
  tagComponent?: any;
  untagComponent?: any;
  taggedComp?: any;
  removeDetails?: any;
}) => {
  createEffect(() => {
    console.log(props.component?.details);
  });

  const isTagged = (type: string, componentId: number) =>
    Array.isArray(props.taggedComp) &&
    props.taggedComp[0] === componentId &&
    props.taggedComp[1] === props.setupIndex &&
    props.taggedComp[2] === type;

  if (props.location === "lists")
    return (
      <ContextMenu>
        <ContextMenuTrigger
          as={Badge}
          class="cursor-default"
          onDblClick={() => {
            // props.addSelectedComps(props.selectedSetup(), props.component.id);
          }}
          onMouseDown={() => {
            props.loadComponent(props.component.id);
            props.setShowItem(props.component.id);
          }}
        >
          {props.component.title}
        </ContextMenuTrigger>
        <ContextMenuPortal>
          <ContextMenuContent class="w-40">
            <ContextMenuItem
              onMouseDown={() => {
                props.loadComponent(props.component.id);
                props.setShowItem(props.component.id);
              }}
            >
              <span>Mostrar</span>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenu>
    );

  return (
    <Switch fallback={<div>Loading...</div>}>
      <Match when={props.added}>
        <div class="flex flex-col gap-2 items-start">
          <ContextMenu>
            <ContextMenuTrigger
              as={Badge}
              classList={{
                "cursor-pointer": true,
                "outline outline-2 outline-offset-2 outline-gray-700": isTagged(
                  "main-component",
                  props.component.component.id,
                ),
              }}
              onMouseDown={() => {
                if (isTagged("main-component", props.component.component.id))
                  return props.untagComponent();
                props.tagComponent(
                  props.component.component.id,
                  props.setupIndex,
                  "main-component",
                );
              }}
            >
              {props.component.component.title}
            </ContextMenuTrigger>
            <ContextMenuPortal>
              <ContextMenuContent class="w-40">
                <ContextMenuItem
                  onMouseDown={() => {
                    props.loadComponent(props.component.component.id);
                    props.setShowItem(props.component.component.id);
                  }}
                >
                  <span>Mostrar</span>
                </ContextMenuItem>
                <ContextMenuItem
                  onMouseDown={() => {
                    props.removeComps(
                      props.setupIndex,
                      props.component.component.id,
                    );
                  }}
                >
                  <span>Remover</span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenuPortal>
          </ContextMenu>
          <For each={props.component.details}>
            {(detail) => (
              <ContextMenu>
                <ContextMenuTrigger
                  as={Badge}
                  variant={"secondary"}
                  classList={{
                    "cursor-default": true,
                    // "outline outline-2 outline-offset-2 outline-gray-700":
                    //   isTagged("detail", detail.id),
                  }}
                  // onMouseDown={() => {
                  //   if (isTagged("detail", detail.id))
                  //     return props.untagComponent();
                  //   props.tagComponent(detail.id, props.setupIndex, "detail");
                  // }}
                >
                  {detail?.title}
                </ContextMenuTrigger>
                <ContextMenuPortal>
                  <ContextMenuContent class="w-40">
                    <ContextMenuItem
                      onMouseDown={() => {
                        props.loadComponent(detail.id);
                        props.setShowItem(detail.id);
                      }}
                    >
                      <span>Mostrar</span>
                    </ContextMenuItem>
                    <ContextMenuItem
                      onMouseDown={() => {
                        props.removeDetails(
                          props.setupIndex,
                          props.component.component.id,
                          detail.id,
                        );
                      }}
                    >
                      <span>Remover detalhe</span>
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenuPortal>
              </ContextMenu>
            )}
          </For>
        </div>
      </Match>
      <Match when={!props.added}>
        <ContextMenu>
          <ContextMenuTrigger
            as={Badge}
            class="cursor-default"
            onDblClick={() => {
              props.addSelectedComps(props.selectedSetup(), props.component.id);
            }}
          >
            {props.component.title}
          </ContextMenuTrigger>
          <ContextMenuPortal>
            <ContextMenuContent class="w-40">
              <ContextMenuItem
                onMouseDown={() => {
                  props.loadComponent(props.component.id);
                  props.setShowItem(props.component.id);
                }}
              >
                <span>Mostrar</span>
              </ContextMenuItem>
              <ContextMenuItem
                onMouseDown={() => {
                  props.addSelectedComps(
                    props.selectedSetup(),
                    props.component.id,
                  );
                }}
              >
                <span>Adicionar setup</span>
              </ContextMenuItem>
              <ContextMenuItem
                onMouseDown={() => {
                  props.addDetails(props.component.id);
                }}
              >
                <span>Adicionar detalhe</span>
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenuPortal>
        </ContextMenu>
      </Match>
    </Switch>
  );
};
