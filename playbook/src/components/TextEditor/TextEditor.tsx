import {
  Component,
  createSignal,
  createEffect,
  For,
  Show,
  createComputed,
} from "solid-js";
import { TextBlock } from "./TextBlock";
import FormattingToolbar from "./FormattingToolbar";
import { Button } from "../ui/button";
import { deleteLane } from "~/stores/tradeStore";
import GripVertical from "lucide-solid/icons/grip-vertical";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Dialog } from "../ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "../ui/carousel";
import { createStore } from "solid-js/store";
import { useGlobalStore } from "~/stores/storeContext";
import { useParams } from "@solidjs/router";

export interface Block {
  id: string;
  content: string;
  type: "text" | "ol" | "ul";
}

interface TextEditorProps {
  initialBlocks?: Block[];
  onContentChange?: (blocks: Block[]) => void;
  laneID?: string;
}

export const TextEditor: Component<TextEditorProps> = (props) => {
  const [
    gStore,
    {
      addBlock,
      removeBlock,
      updateBlockContent,
      setCaretPosition,
      getActiveDocument,
      setActiveDocumentId,
    },
  ] = useGlobalStore();

  const params = useParams();

  // createEffect(() => {
  //   console.log({ activeDocumentId: getActiveDocument() });
  // });

  createEffect(() => {
    if (
      params.documentId &&
      gStore.documents.activeDocumentId !== params.documentId
    ) {
      setActiveDocumentId(params.documentId);
    }
  });

  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [blocks, setBlocks] = createStore<Block[]>(
    props.initialBlocks || [
      {
        id: "1",
        content: "",
        type: "text",
      },
    ]
  );

  return (
    <div class="w-[700px] mx-auto">
      <div class="">
        <Show when={props.laneID}>
          <Button
            class="float-right"
            onClick={() => props.laneID && deleteLane(props.laneID)}
          >
            -
          </Button>
        </Show>
        <For each={getActiveDocument()?.blocks ?? []}>
          {(block) => (
            <div class="flex relative">
              <Show when={getActiveDocument()?.focusedBlockId === block.id}>
                <DropdownMenu>
                  <DropdownMenuTrigger class="text-gray-300 absolute top-0 left-[-35px] cursor-pointer">
                    <GripVertical />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent class="left-[-110px]">
                    <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
                      Galeria
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
                      Team
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Show>
              <TextBlock
                block={block}
                onContentChange={(content, blockRef) =>
                  updateBlockContent(block.id, content, blockRef)
                }
                onBlockCreate={addBlock}
                onBlockDelete={removeBlock}
                onBlockFocus={() => {}}
                setSavedCaretPosition={setCaretPosition}
              />
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
