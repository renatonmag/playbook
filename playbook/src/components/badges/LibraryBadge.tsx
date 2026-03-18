import { Badge } from "../ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuTrigger,
} from "../ui/context-menu";

export const LibraryBadge = (props: {
  component: any;
  loadComponent: any;
  setShowItem: any;
  addSelectedComps: any;
  addDetails: any;
  addContext?: any;
  selectedSetup: any;
  removeComps?: any;
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
              props.addSelectedComps(props.selectedSetup(), props.component.id);
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
  );
};
