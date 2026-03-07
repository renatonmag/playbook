import { For, Match, Switch } from "solid-js";
import { Badge } from "./ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./ui/context-menu";

export const ComponentBadge = (props: {
  component: any;
  added?: boolean;
  location?: string;
  cardIndex?: number;
  subIndex?: number;
  loadComponent: any;
  setShowItem: any;
  addSelectedComps?: any;
  addDetails?: any;
  addContext?: any;
  removeComps?: (componentId: number) => void;
  selectedSetup?: any;
  tagComponent?: any;
  untagComponent?: any;
  taggedComp?: any;
  removeDetails?: (componentId: number, detailId: number) => void;
  copyToActiveSetup?: (componentId: number) => void;
  isInActiveSetup?: boolean;
  moveComponent?: (componentId: number, direction: "left" | "right") => void;
  deleteComponent?: (id: number) => void;
}) => {
  // taggedComp shape: [compId, cardIdx, subIdx, type]
  const isTagged = (type: string, componentId: number) =>
    Array.isArray(props.taggedComp) &&
    props.taggedComp[0] === componentId &&
    props.taggedComp[1] === props.cardIndex &&
    props.taggedComp[2] === props.subIndex &&
    props.taggedComp[3] === type;

  if (props.location === "lists")
    return (
      <ContextMenu>
        <ContextMenuTrigger
          as={Badge}
          class="cursor-default"
          onMouseDown={(e) => {
            if (e.button === 2) return;
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
            <ContextMenuSub overlap>
              <ContextMenuSubTrigger>
                <span class="text-red-500">Deletar</span>
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem
                  onMouseDown={() =>
                    props.deleteComponent?.(props.component.id)
                  }
                >
                  <span class="text-red-500">Confirmar</span>
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
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
              onMouseDown={(e) => {
                if (e.button === 2) return;
                if (isTagged("main-component", props.component.component.id))
                  return props.untagComponent();
                props.tagComponent(
                  props.component.component.id,
                  props.cardIndex,
                  props.subIndex,
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
                    props.removeComps?.(props.component.component.id);
                  }}
                >
                  <span>Remover</span>
                </ContextMenuItem>
                {props.copyToActiveSetup && !props.isInActiveSetup && (
                  <ContextMenuItem
                    onMouseDown={() =>
                      props.copyToActiveSetup!(props.component.component.id)
                    }
                  >
                    <span>Copiar para setup ativo</span>
                  </ContextMenuItem>
                )}
                {props.moveComponent && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onMouseDown={() =>
                        props.moveComponent!(
                          props.component.component.id,
                          "left",
                        )
                      }
                    >
                      <span>Esquerda</span>
                      <ContextMenuShortcut>⌃←</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem
                      onMouseDown={() =>
                        props.moveComponent!(
                          props.component.component.id,
                          "right",
                        )
                      }
                    >
                      <span>Direita</span>
                      <ContextMenuShortcut>⌃→</ContextMenuShortcut>
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenuPortal>
          </ContextMenu>
          <For each={props.component.details}>
            {(detail) => (
              <ContextMenu>
                <ContextMenuTrigger
                  as={Badge}
                  variant={"secondary"}
                  class="cursor-default"
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
                        props.removeDetails?.(
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
