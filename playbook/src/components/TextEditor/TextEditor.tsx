import { Component, createSignal, createEffect, For } from "solid-js";
import { TextBlock } from "./TextBlock";

export interface Block {
  id: string;
  content: string;
  type: "text" | "list";
}

interface TextEditorProps {
  initialBlocks?: Block[];
  onContentChange?: (blocks: Block[]) => void;
}

export const TextEditor: Component<TextEditorProps> = (props) => {
  const [blocks, setBlocks] = createSignal<Block[]>(
    props.initialBlocks || [{ id: "1", content: "", type: "text" }]
  );
  const [focusedBlockId, setFocusedBlockId] = createSignal<string>("1");

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
    const newBlock: Block = { id: generateId(), content: "", type: "text" };
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
    <div class="w-full max-w-4xl mx-auto bg-white border border-gray-200 rounded-lg">
      <div class="min-h-[500px] p-4">
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
            />
          )}
        </For>
      </div>
    </div>
  );
};
