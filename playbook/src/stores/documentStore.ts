import { createStore, createSignal } from "solid-js";
import type { Block, Document, TextFormatting } from "../types/document";

interface DocumentStore {
  blocks: Block[];
  focusedBlockId: string | null;
  selectedText: string;
  formatting: TextFormatting;
}

const [store, setStore] = createStore<DocumentStore>({
  blocks: [{ id: "1", content: "", type: "text" }],
  focusedBlockId: "1",
  selectedText: "",
  formatting: {},
});

const [isLoading, setIsLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);

// Block management
export const addBlock = (afterId: string, type: "text" | "list" = "text") => {
  const newBlock: Block =
    type === "text"
      ? { id: generateId(), content: "", type: "text" }
      : {
          id: generateId(),
          content: "",
          type: "list",
          listType: "unordered",
          level: 0,
        };

  setStore("blocks", (prev) => {
    const index = prev.findIndex((block) => block.id === afterId);
    if (index === -1) return [...prev, newBlock];

    const newBlocks = [...prev];
    newBlocks.splice(index + 1, 0, newBlock);
    return newBlocks;
  });

  setStore("focusedBlockId", newBlock.id);
  return newBlock;
};

export const removeBlock = (blockId: string) => {
  if (store.blocks.length <= 1) return; // Keep at least one block

  setStore("blocks", (prev) => prev.filter((block) => block.id !== blockId));

  // Focus the previous block or the first available block
  const currentIndex = store.blocks.findIndex((block) => block.id === blockId);
  const newFocusedIndex = Math.max(0, currentIndex - 1);
  const newFocusedBlock = store.blocks[newFocusedIndex];
  if (newFocusedBlock) {
    setStore("focusedBlockId", newFocusedBlock.id);
  }
};

export const updateBlockContent = (blockId: string, content: string) => {
  setStore("blocks", (block) =>
    block.id === blockId ? { ...block, content } : block
  );
};

export const updateBlockFormatting = (
  blockId: string,
  formatting: Partial<TextFormatting>
) => {
  setStore("blocks", (block) =>
    block.id === blockId
      ? { ...block, formatting: { ...block.formatting, ...formatting } }
      : block
  );
};

export const setFocusedBlock = (blockId: string | null) => {
  setStore("focusedBlockId", blockId);
};

export const setSelectedText = (text: string) => {
  setStore("selectedText", text);
};

export const setFormatting = (formatting: Partial<TextFormatting>) => {
  setStore("formatting", (prev) => ({ ...prev, ...formatting }));
};

export const clearFormatting = () => {
  setStore("formatting", {});
};

// Utility functions
const generateId = () =>
  `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const getFocusedBlock = () => {
  return store.blocks.find((block) => block.id === store.focusedBlockId);
};

export const getBlockById = (id: string) => {
  return store.blocks.find((block) => block.id === id);
};

export const getBlocks = () => store.blocks;
export const getFocusedBlockId = () => store.focusedBlockId;
export const getSelectedText = () => store.selectedText;
export const getFormatting = () => store.formatting;
export const getIsLoading = () => isLoading();
export const getError = () => error();

// Export the store and actions
export { store, isLoading, error };
