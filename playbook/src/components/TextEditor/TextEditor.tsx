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
    { addBlock, removeBlock, updateBlockContent, setCaretPosition },
  ] = useGlobalStore();

  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [blocks, setBlocks] = createStore<Block[]>(
    props.initialBlocks || [
      {
        id: "1",
        content: "",
        type: "text",
      },
    ]
  );
  const [focusedBlockId, setFocusedBlockId] = createSignal<string>("1");
  const [formatTrigger, setFormatTrigger] = createSignal<{
    format: string;
    value?: any;
  } | null>(null);
  const [currentFormatting, setCurrentFormatting] = createSignal<{
    bold: boolean;
    italic: boolean;
    underline: boolean;
  }>({ bold: false, italic: false, underline: false });

  const generateId = () =>
    `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleContentChange = (blockId: string, content: string) => {
    const blockIdx = blocks.findIndex((b) => b.id === blockId);
    if (blockIdx < 0) return;

    const block = blocks[blockIdx];

    // Check for type switch triggers
    if (content.startsWith("1. ") && block.type !== "ol") {
      setTimeout(
        () => setBlocks(blockIdx, { content: content.slice(3), type: "ol" }),
        0
      );
      return;
    }
    if (content.startsWith("- ") && block.type !== "ul") {
      setTimeout(
        () => setBlocks(blockIdx, { content: content.slice(2), type: "ul" }),
        0
      );
      return;
    }

    // Otherwise, just update content
    setBlocks(blockIdx, "content", content);
    // props.onContentChange?.(blocks);
  };

  const handleBlockCreate = (afterId: string) => {
    const newBlock: Block = {
      id: generateId(),
      content: "",
      type: "text",
    };
    setBlocks((prev) => {
      const index = prev.findIndex((block) => block.id === afterId);
      if (index === -1) return [...prev, newBlock];

      const newBlocks = [...prev];
      newBlocks.splice(index + 1, 0, newBlock);
      return newBlocks;
    });

    // Focus the new block after a brief delay to ensure DOM update
    setTimeout(() => {
      setFocusedBlockId(newBlock.id);
    }, 0);
  };

  const handleBlockDelete = (blockId: string) => {
    if (blocks.length <= 1) return; // Keep at least one block

    // Focus the previous block or the first available block
    const currentIndex = blocks.findIndex((block) => block.id === blockId);
    const newFocusedIndex = Math.max(0, currentIndex - 1);
    const newFocusedBlock = blocks[newFocusedIndex];
    if (newFocusedBlock) {
      setFocusedBlockId(newFocusedBlock.id);
    }

    setBlocks((prev) => prev.filter((block) => block.id !== blockId));
  };

  const handleBlockFocus = (blockId: string) => {
    setFocusedBlockId(blockId);
  };

  const navigateToBlock = (blockId: string) => {
    setFocusedBlockId(blockId);
  };

  const handleNavigateUp = (currentBlockId: string) => {
    const currentIndex = blocks.findIndex(
      (block) => block.id === currentBlockId
    );
    if (currentIndex > 0) {
      const previousBlock = blocks[currentIndex - 1];
      navigateToBlock(previousBlock.id);
    }
  };

  const handleNavigateDown = (currentBlockId: string) => {
    const currentIndex = blocks.findIndex(
      (block) => block.id === currentBlockId
    );
    if (currentIndex < blocks.length - 1) {
      const nextBlock = blocks[currentIndex + 1];
      navigateToBlock(nextBlock.id);
    }
  };

  // Notify parent of content changes
  createEffect(() => {
    props.onContentChange?.(blocks);
  });

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
        <For each={gStore.documents.blocks}>
          {(block) => (
            <div class="flex relative">
              <Show when={gStore.documents.focusedBlockId === block.id}>
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
                onContentChange={(content) =>
                  updateBlockContent(block.id, content)
                }
                onBlockCreate={addBlock}
                onBlockDelete={removeBlock}
                onBlockFocus={handleBlockFocus}
                isFocused={gStore.documents.focusedBlockId === block.id}
                isNavigation={false}
                setSavedCaretPosition={setCaretPosition}
              />
              <Dialog open={dialogOpen()} onOpenChange={setDialogOpen}>
                <DialogContent class="min-w-[650px]">
                  <DialogHeader>
                    <DialogTitle>Galeria de exemplos.</DialogTitle>
                  </DialogHeader>
                  <Carousel class="w-full max-w-lg mx-auto">
                    <CarouselContent>
                      <CarouselItem>
                        <img src="https://placehold.co/600x400" alt="Galeria" />
                      </CarouselItem>
                      <CarouselItem>
                        <img src="https://placehold.co/600x400" alt="Galeria" />
                      </CarouselItem>
                      <CarouselItem>
                        <img src="https://placehold.co/600x400" alt="Galeria" />
                      </CarouselItem>
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                  </Carousel>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
