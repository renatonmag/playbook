import { createEffect, InitializedResourceReturn } from "solid-js";
import { logger } from "~/utils/logger";
import { Block, Image } from "~/types/document";
import { createStore, unwrap } from "solid-js/store";

export interface IDocumentsActions {
  // Block management
  addBlock: (afterId: string, type?: "text" | "list") => Block;
  removeBlock: (blockId: string) => void;
  updateBlockContent: (blockId: string, content: string) => void;
  setCaretPosition: (position: number) => void;
  setBlockTypeToText: (blockId: string) => void;

  // Image management
  addImagesToBlock: (blockId: string, images: Image[]) => void;
  removeImageFromBlock: (blockId: string, imageId: string) => void;

  // Navigation
  blockNavigateUp: (currentBlockId: string) => void;
  blockNavigateDown: (currentBlockId: string) => void;
  setFocusedBlock: (blockId: string | null) => void;
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
    blocks: [
      { id: "1", content: "this is the first block", type: "text", images: [] },
    ],
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
        images: [],
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

      // Find the block to remove and clean up its object URLs
      const blockToRemove = documents.blocks.find(
        (block) => block.id === blockId
      );
      if (blockToRemove && blockToRemove.images) {
        blockToRemove.images.forEach((image) => {
          if (image.url) {
            URL.revokeObjectURL(image.url);
          }
        });
      }

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
      if (content.startsWith("() ") && block.type !== "radio") {
        setTimeout(
          () =>
            setDocuments("blocks", blockIdx, {
              ...block,
              content: content.slice(3),
              type: "radio",
            }),
          0
        );
        return;
      }

      if (content.startsWith("[] ") && block.type !== "checkbox") {
        setTimeout(
          () =>
            setDocuments("blocks", blockIdx, {
              ...block,
              content: content.slice(3),
              type: "checkbox",
            }),
          0
        );
        return;
      }

      if (content.startsWith("1. ") && block.type !== "ol") {
        setTimeout(
          () =>
            setDocuments("blocks", blockIdx, {
              ...block,
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
              ...block,
              content: content.slice(2),
              type: "ul",
            }),
          0
        );
        return;
      }

      // Otherwise, just update content
      setDocuments("blocks", blockIdx, "content", content);
    },

    setBlockTypeToText(blockId: any) {
      const blockIdx = documents.blocks.findIndex((b) => b.id === blockId);
      if (blockIdx < 0) return;
      const block = documents.blocks[blockIdx];

      // Check if caretPositions is 1 and block type is ul, ol, radio, or checkbox, change to text
      if (
        documents.caretPositions === 0 &&
        (block.type === "ul" ||
          block.type === "ol" ||
          block.type === "radio" ||
          block.type === "checkbox")
      ) {
        setDocuments("blocks", blockIdx, {
          ...block,
          type: "text",
        });
        return;
      }
    },

    addImagesToBlock(blockId: string, images: Image[]) {
      const blockIdx = documents.blocks.findIndex((b) => b.id === blockId);
      if (blockIdx < 0) return;

      const block = documents.blocks[blockIdx];
      const currentImages = block.images || [];

      // Add new images to the existing images array
      const updatedImages = [...currentImages, ...images];

      setDocuments("blocks", blockIdx, {
        ...block,
        images: updatedImages,
      });
    },

    removeImageFromBlock(blockId: string, imageId: string) {
      const blockIdx = documents.blocks.findIndex((b) => b.id === blockId);
      if (blockIdx < 0) return;

      const block = documents.blocks[blockIdx];
      const currentImages = block.images || [];

      // Find the image to remove and revoke its object URL
      const imageToRemove = currentImages.find((image) => image.id === imageId);
      if (imageToRemove && imageToRemove.url) {
        URL.revokeObjectURL(imageToRemove.url);
      }

      // Filter out the image with the specified ID
      const updatedImages = currentImages.filter(
        (image) => image.id !== imageId
      );

      setDocuments("blocks", blockIdx, {
        ...block,
        images: updatedImages,
      });
    },

    setCaretPosition(position: number) {
      setDocuments("caretPositions", position);
    },

    blockNavigateUp(currentBlockId: string) {
      const currentIndex = documents.blocks.findIndex(
        (block) => block.id === currentBlockId
      );
      if (currentIndex > 0) {
        const previousBlock = documents.blocks[currentIndex - 1];
        setDocuments("focusedBlockId", previousBlock.id);
      }
    },

    blockNavigateDown(currentBlockId: string) {
      const currentIndex = documents.blocks.findIndex(
        (block) => block.id === currentBlockId
      );
      if (currentIndex < documents.blocks.length - 1) {
        const nextBlock = documents.blocks[currentIndex + 1];
        setDocuments("focusedBlockId", nextBlock.id);
      }
    },

    setFocusedBlock,
  });

  return documents;
}
