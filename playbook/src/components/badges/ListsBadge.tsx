import { Badge } from "../ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../ui/context-menu";

export const ListsBadge = (props: {
  component: any;
  loadComponent: (id: number) => void;
  setShowItem: (id: number) => void;
  deleteComponent: (id: number) => void;
}) => {
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
                onMouseDown={() => props.deleteComponent(props.component.id)}
              >
                <span class="text-red-500">Confirmar</span>
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenuPortal>
    </ContextMenu>
  );
};
