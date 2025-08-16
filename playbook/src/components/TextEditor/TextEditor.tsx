import { Component, createSignal, createEffect, For, Show } from "solid-js";
import { TextBlock } from "./TextBlock";
import FormattingToolbar from "./FormattingToolbar";
import { Button } from "../ui/button";
import { deleteLane } from "~/stores/tradeStore";
// import {
//   tradeStore,
//   addLane,
//   deleteLane,
//   updateLaneContent,
//   setLaneFocus,
//   updateLaneTitle,
// } from "../stores/tradeStore";

export interface Block {
  id: string;
  content: string;
  type: "text" | "list";
  formatting?: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color: string;
  };
}

interface TextEditorProps {
  initialBlocks?: Block[];
  onContentChange?: (blocks: Block[]) => void;
  laneID: string;
}

export const TextEditor: Component<TextEditorProps> = (props) => {
  const [blocks, setBlocks] = createSignal<Block[]>(
    props.initialBlocks || [
      {
        id: "1",
        content: "",
        type: "text",
        formatting: {
          bold: false,
          italic: false,
          underline: false,
          color: "inherit",
        },
      },
    ]
  );
  const [focusedBlockId, setFocusedBlockId] = createSignal<string>("1");
  const [savedCaretPosition, setSavedCaretPosition] = createSignal<number>(0);
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
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId ? { ...block, content } : block
      )
    );
    props.onContentChange?.(blocks());
  };

  const handleBlockCreate = (afterId: string) => {
    const newBlock: Block = {
      id: generateId(),
      content: "",
      type: "text",
      formatting: {
        bold: false,
        italic: false,
        underline: false,
        color: "inherit",
      },
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
    if (blocks().length <= 1) return; // Keep at least one block

    // Focus the previous block or the first available block
    const currentIndex = blocks().findIndex((block) => block.id === blockId);
    const newFocusedIndex = Math.max(0, currentIndex - 1);
    const newFocusedBlock = blocks()[newFocusedIndex];
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
    const currentIndex = blocks().findIndex(
      (block) => block.id === currentBlockId
    );
    if (currentIndex > 0) {
      const previousBlock = blocks()[currentIndex - 1];
      navigateToBlock(previousBlock.id);
    }
  };

  const handleNavigateDown = (currentBlockId: string) => {
    const currentIndex = blocks().findIndex(
      (block) => block.id === currentBlockId
    );
    if (currentIndex < blocks().length - 1) {
      const nextBlock = blocks()[currentIndex + 1];
      navigateToBlock(nextBlock.id);
    }
  };

  // Notify parent of content changes
  createEffect(() => {
    props.onContentChange?.(blocks());
  });

  return (
    <div class="min-w-[450px] w-[450px] mx-auto bg-white border border-gray-200 rounded-lg">
      <div class="min-h-[500px] h-full p-4">
        <Button class="float-right" onClick={() => deleteLane(props.laneID)}>
          -
        </Button>
        <For each={blocks()}>
          {(block) => (
            <TextBlock
              id={block.id}
              content={block.content}
              onContentChange={(content) =>
                handleContentChange(block.id, content)
              }
              onBlockCreate={handleBlockCreate}
              onBlockDelete={handleBlockDelete}
              onBlockFocus={handleBlockFocus}
              onNavigateUp={() => handleNavigateUp(block.id)}
              onNavigateDown={() => handleNavigateDown(block.id)}
              isFocused={focusedBlockId() === block.id}
              savedCaretPosition={savedCaretPosition}
              setSavedCaretPosition={setSavedCaretPosition}
            />
          )}
        </For>
      </div>
    </div>
  );
};
