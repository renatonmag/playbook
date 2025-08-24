import { createEffect, InitializedResourceReturn } from "solid-js";
import { logger } from "~/utils/logger";
import { Block } from "~/types/document";
import { createStore, unwrap } from "solid-js/store";

export interface IDocumentsActions {
  // Block management
  addBlock: (afterId: string, type?: "text" | "list") => Block;
  removeBlock: (blockId: string) => void;
  updateBlockContent: (blockId: string, content: string) => void;
  setCaretPosition: (blockId: string, position: number) => void;
}

export interface DocumentStore {
  title: string;
  blocks: Block[];
  focusedBlockId: string | null;
  caretPositions: number;
}

/**
 * Create interface to the tags API endpoint.
 *
 * @param agent
 * @param actions
 * @param state
 * @param setState
 * @returns
 */

export function createDocumentStore(
  agent: any,
  actions: IDocumentsActions,
  state: any,
  setState: any
): DocumentStore {
  const [documents, setDocuments] = createStore<DocumentStore>({
    title: "Entradas",
    blocks: [{ id: "1", content: "this is the first block", type: "text" }],
    focusedBlockId: "1",
    caretPositions: 1,
  });

  // Utility functions
  const generateId = () =>
    `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const getFocusedBlock = () => {
    return documents.blocks.find(
      (block) => block.id === documents.focusedBlockId
    );
  };

  const getBlockById = (id: string) => {
    return documents.blocks.find((block) => block.id === id);
  };

  const setFocusedBlock = (blockId: string | null) => {
    setDocuments("focusedBlockId", blockId);
  };

  Object.assign(actions, {
    // Block management
    addBlock(afterId: string) {
      const newBlock: Block = {
        id: generateId(),
        content: "",
        type: "text",
      };
      setDocuments("blocks", (blocks) => {
        const index = blocks.findIndex((block) => block.id === afterId);
        if (index === -1) return [...blocks, newBlock];

        const newBlocks = [...blocks];
        newBlocks.splice(index + 1, 0, newBlock);
        return newBlocks;
      });

      // Focus the new block after a brief delay to ensure DOM update
      setTimeout(() => {
        setFocusedBlock(newBlock.id);
      }, 0);
    },

    removeBlock(blockId: string) {
      if (documents.blocks.length <= 1) return; // Keep at least one block

      // Focus the previous block or the first available block
      const currentIndex = documents.blocks.findIndex(
        (block) => block.id === blockId
      );
      const newFocusedIndex = Math.max(0, currentIndex - 1);
      const newFocusedBlock = documents.blocks[newFocusedIndex];
      if (newFocusedBlock) {
        setFocusedBlock(newFocusedBlock.id);
      }

      setDocuments("blocks", (blocks) =>
        blocks.filter((block) => block.id !== blockId)
      );
    },

    updateBlockContent(blockId: string, content: string) {
      const blockIdx = documents.blocks.findIndex((b) => b.id === blockId);
      if (blockIdx < 0) return;

      const block = documents.blocks[blockIdx];

      // Check for type switch triggers
      if (content.startsWith("1. ") && block.type !== "ol") {
        setTimeout(
          () =>
            setDocuments("blocks", blockIdx, {
              content: content.slice(3),
              type: "ol",
            }),
          0
        );
        return;
      }
      if (content.startsWith("- ") && block.type !== "ul") {
        setTimeout(
          () =>
            setDocuments("blocks", blockIdx, {
              content: content.slice(2),
              type: "ul",
            }),
          0
        );
        return;
      }

      // Check if caretPositions is 1 and block type is ul or ol, change to text
      if (
        documents.caretPositions === 0 &&
        (block.type === "ul" || block.type === "ol")
      ) {
        setDocuments("blocks", blockIdx, {
          ...block,
          type: "text",
        });
        return;
      }

      // Otherwise, just update content
      setDocuments("blocks", blockIdx, "content", content);
    },

    setCaretPosition(position: number) {
      setDocuments("caretPositions", position);
    },
  });

  return documents;
}
