import { For, Show } from "solid-js";
import { Badge } from "../ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const formatTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour12: false }) : null;

export const AddedBadge = (props: {
  component: any;
  cardIndex: number;
  subIndex: number;
  loadComponent: any;
  setShowItem: any;
  removeComps: (instanceId: string) => void;
  selectedSetup?: any;
  tagComponent?: any;
  untagComponent?: any;
  taggedComp?: any;
  removeDetails?: (instanceId: string, detailUuid: string) => void;
  copyToActiveSetup?: (instanceId: string) => void;
  isInActiveSetup?: boolean;
  moveComponent?: (instanceId: string, direction: "left" | "right") => void;
}) => {
  // taggedComp shape: [instanceId, compId, cardIdx, subIdx, type]
  const isTagged = (type: string, instanceId: string) =>
    Array.isArray(props.taggedComp) &&
    props.taggedComp[0] === instanceId &&
    props.taggedComp[2] === props.cardIndex &&
    props.taggedComp[3] === props.subIndex &&
    props.taggedComp[4] === type;

  return (
    <div class="flex flex-col gap-2 items-start">
      <Tooltip>
        <TooltipTrigger as="span">
          <ContextMenu>
            <ContextMenuTrigger
              as={Badge}
              classList={{
                "cursor-pointer": true,
                "outline outline-2 outline-offset-2 outline-gray-700": isTagged(
                  "main-component",
                  props.component.instanceId,
                ),
              }}
              onMouseDown={(e) => {
                if (e.button === 2) return;
                props.loadComponent(props.component.component.id);
                props.setShowItem(props.component.component.id);
                if (isTagged("main-component", props.component.instanceId))
                  return props.untagComponent();
                props.tagComponent(
                  props.component.instanceId,
                  props.component.component.id,
                  props.cardIndex,
                  props.subIndex,
                  "main-component",
                );
              }}
            >
              {props.component?.component?.title}
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
                    props.removeComps(props.component.instanceId);
                  }}
                >
                  <span>Remover</span>
                </ContextMenuItem>
                {props.copyToActiveSetup && !props.isInActiveSetup && (
                  <ContextMenuItem
                    onMouseDown={() =>
                      props.copyToActiveSetup!(props.component.instanceId)
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
                        props.moveComponent!(props.component.instanceId, "left")
                      }
                    >
                      <span>Esquerda</span>
                      <ContextMenuShortcut>⌃←</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem
                      onMouseDown={() =>
                        props.moveComponent!(props.component.instanceId, "right")
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
        </TooltipTrigger>
        <Show when={formatTime(props.component.addedAt)}>
          <TooltipContent>{formatTime(props.component.addedAt)}</TooltipContent>
        </Show>
      </Tooltip>
      <For each={props.component.details}>
        {(detail) => (
          <Tooltip>
            <TooltipTrigger as="span">
              <ContextMenu>
                <ContextMenuTrigger
                  as={Badge}
                  variant={"secondary"}
                  class="cursor-default"
                  onMouseDown={() => {
                    props.loadComponent(detail.id);
                    props.setShowItem(detail.id);
                  }}
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
                          props.component.instanceId,
                          detail.uuid,
                        );
                      }}
                    >
                      <span>Remover detalhe</span>
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenuPortal>
              </ContextMenu>
            </TooltipTrigger>
            <Show when={formatTime(props.component.detailTimestamps?.[detail.uuid])}>
              <TooltipContent>{formatTime(props.component.detailTimestamps?.[detail.uuid])}</TooltipContent>
            </Show>
          </Tooltip>
        )}
      </For>
    </div>
  );
};
