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
      setDocumentCaretPosition: setCaretPosition,
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
  const [contentEditable, setContentEditable] = createSignal(false);
  const [focusedBlockRef, setFocusedBlockRef] =
    createSignal<HTMLDivElement | null>(null);

  const focusBlock = () => {
    if (!focusedBlockRef()) return;
    focusedBlockRef()?.focus();
  };

  createEffect(() => {
    if (!contentEditable()) {
      focusBlock();
    }
  });

  return (
    <div
      class="w-[700px] mx-auto outline-0"
      contenteditable={contentEditable()}
      onMouseDown={() => {
        setContentEditable(true);
        document.body.addEventListener(
          "mouseup",
          () => {
            setContentEditable(false);
          },
          { once: true }
        );
      }}
    >
      <div>
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
                setContentEditable={setContentEditable}
                onContentChange={updateBlockContent}
                onBlockCreate={addBlock}
                onBlockDelete={removeBlock}
                setFocusedBlockRef={setFocusedBlockRef}
                setSavedCaretPosition={setCaretPosition}
              />
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
