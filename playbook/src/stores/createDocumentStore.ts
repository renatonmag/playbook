import { createEffect, InitializedResourceReturn } from "solid-js";
import { logger } from "~/utils/logger";
import { Block, Image } from "~/types/document";
import { createStore, unwrap } from "solid-js/store";

export interface IDocumentsActions {
  // Block management
  addBlock: (afterId: string, type?: "text" | "list") => Block;
  removeBlock: (blockId: string) => void;
  updateBlockContent: (blockId: string, content: string) => void;
  // Document management
  createDocument: (title?: string) => string;
  getActiveDocument: () => DocumentStore | undefined;
  setActiveDocumentId: (documentId: string) => void;
  setCaretPosition: (pos: { line: number; column: number }) => void;
  getCaretPosition: () => { line: number; column: number };
  setBlockTypeToText: (blockId: string) => void;
  clampCaretToBlock: (
    blockId: string,
    pos: { line: number; column: number }
  ) => { line: number; column: number };

  // Image management
  addImagesToBlock: (blockId: string, images: Image[]) => void;
  removeImageFromBlock: (blockId: string, imageId: string) => void;

  // Navigation
  blockNavigateUp: (currentBlockId: string) => void;
  blockNavigateDown: (currentBlockId: string) => void;
  setFocusedBlock: (blockId: string | null) => void;
}

export interface DocumentStore {
  id: string;
  title: string;
  blocks: Block[];
  focusedBlockId: string | null;
  caretPosition: { line: number; column: number };
}

export interface MultiDocumentStore {
  documents: DocumentStore[];
  activeDocumentId: string | null;
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
): MultiDocumentStore {
  const [store, setStore] = createStore<MultiDocumentStore>({
    documents: [
      {
        id: "1dsfds33",
        title: "Entradas",
        blocks: [
          {
            id: "1",
            content: "this is the first block",
            type: "text",
            images: [],
          },
        ],
        focusedBlockId: "1",
        caretPosition: { line: 0, column: 0 },
      },
    ],
    activeDocumentId: "1dsfds33",
  });

  // Utility functions
  const generateId = () =>
    `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const generateDocumentId = () =>
    `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const createDefaultDocument = (title?: string): DocumentStore => {
    const newDocId = generateDocumentId();
    const firstBlockId = generateId();
    return {
      id: newDocId,
      title: title ?? "Untitled",
      blocks: [{ id: firstBlockId, content: "", type: "text", images: [] }],
      focusedBlockId: firstBlockId,
      caretPosition: { line: 0, column: 0 },
    };
  };

  createEffect(() => {
    console.log({ getActiveDocument: getActiveDocument()?.focusedBlockId });
  });
  createEffect(() => {
    console.log({ activeDocumentId: store.activeDocumentId });
  });

  // Helper functions to get active document and filter by document ID
  const getActiveDocument = () => {
    return store.documents.find((doc) => doc.id === store.activeDocumentId);
  };

  const getActiveDocumentIndex = () => {
    return store.documents.findIndex(
      (doc) => doc.id === store.activeDocumentId
    );
  };

  const getDocumentById = (documentId: string) => {
    return store.documents.find((doc) => doc.id === documentId);
  };

  const getDocumentIndexById = (documentId: string) => {
    return store.documents.findIndex((doc) => doc.id === documentId);
  };

  const getFocusedBlock = () => {
    const activeDocument = getActiveDocument();
    if (!activeDocument) return null;
    return activeDocument.blocks.find(
      (block) => block.id === activeDocument.focusedBlockId
    );
  };

  const getBlockById = (id: string) => {
    const activeDocument = getActiveDocument();
    if (!activeDocument) return null;
    return activeDocument.blocks.find((block) => block.id === id);
  };

  const setFocusedBlock = (blockId: string | null) => {
    const activeDocumentIndex = getActiveDocumentIndex();
    if (activeDocumentIndex === -1) return;
    setStore("documents", activeDocumentIndex, "focusedBlockId", blockId);
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
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;

      setStore("documents", activeDocumentIndex, "blocks", (blocks) => {
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

    // Document management
    createDocument(title?: string) {
      const newDoc = createDefaultDocument(title);
      setStore("documents", (docs) => [...docs, newDoc]);
      // Set newly created document as active
      setStore("activeDocumentId", newDoc.id);
      return newDoc.id;
    },

    getActiveDocument,
    setActiveDocumentId(documentId: string) {
      setStore("activeDocumentId", documentId);
    },

    removeBlock(blockId: string) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;

      const activeDocument = getActiveDocument();
      if (!activeDocument || activeDocument.blocks.length <= 1) return; // Keep at least one block

      // Find the block to remove and clean up its object URLs
      const blockToRemove = activeDocument.blocks.find(
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
      const currentIndex = activeDocument.blocks.findIndex(
        (block) => block.id === blockId
      );
      const newFocusedIndex = Math.max(0, currentIndex - 1);
      const newFocusedBlock = activeDocument.blocks[newFocusedIndex];
      if (newFocusedBlock) {
        setFocusedBlock(newFocusedBlock.id);
      }

      setStore("documents", activeDocumentIndex, "blocks", (blocks) =>
        blocks.filter((block) => block.id !== blockId)
      );
    },

    updateBlockContent(blockId: string, content: string) {
      const activeDocumentIndex = store.documents.findIndex(
        (doc) => doc.id === store.activeDocumentId
      );
      if (activeDocumentIndex === -1) return;

      const activeDocument = store.documents[activeDocumentIndex];
      const blockIdx = activeDocument.blocks.findIndex((b) => b.id === blockId);
      if (blockIdx < 0) return;

      const block = activeDocument.blocks[blockIdx];

      // Check for type switch triggers
      if (content.startsWith("() ") && block.type !== "radio") {
        setTimeout(
          () =>
            setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
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
            setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
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
            setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
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
            setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
              ...block,
              content: content.slice(2),
              type: "ul",
            }),
          0
        );
        return;
      }

      // Otherwise, just update content
      setStore(
        "documents",
        activeDocumentIndex,
        "blocks",
        blockIdx,
        "content",
        content
      );
    },

    setBlockTypeToText(blockId: string) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;

      const blocks = store.documents[activeDocumentIndex].blocks;
      const blockIdx = blocks.findIndex((b) => b.id === blockId);
      if (blockIdx < 0) return;

      const block = blocks[blockIdx];
      const caretPos = store.documents[activeDocumentIndex].caretPosition;

      // If caret at start and block is a list/radio/checkbox, revert to text
      if (
        caretPos.column === 0 &&
        (block.type === "ul" ||
          block.type === "ol" ||
          block.type === "radio" ||
          block.type === "checkbox")
      ) {
        setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
          ...block,
          type: "text",
        });
        return;
      }
    },

    addImagesToBlock(blockId: string, images: Image[]) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;

      const blocks = store.documents[activeDocumentIndex].blocks;
      const blockIdx = blocks.findIndex((b) => b.id === blockId);
      if (blockIdx < 0) return;

      const block = blocks[blockIdx];
      const currentImages = block.images || [];

      // Add new images to the existing images array
      const updatedImages = [...currentImages, ...images];

      setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
        ...block,
        images: updatedImages,
      });
    },

    removeImageFromBlock(blockId: string, imageId: string) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;

      const blocks = store.documents[activeDocumentIndex].blocks;
      const blockIdx = blocks.findIndex((b) => b.id === blockId);
      if (blockIdx < 0) return;

      const block = blocks[blockIdx];
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

      setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
        ...block,
        images: updatedImages,
      });
    },

    setCaretPosition(pos: { line: number; column: number }) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;
      setStore("documents", activeDocumentIndex, "caretPosition", pos);
    },

    getCaretPosition() {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1)
        return { line: 0, column: 0 } as { line: number; column: number };
      return store.documents[activeDocumentIndex].caretPosition;
    },

    clampCaretToBlock(
      blockId: string,
      pos: { line: number; column: number }
    ): { line: number; column: number } {
      const activeDocument = getActiveDocument();
      if (!activeDocument) return { line: 0, column: 0 };
      const block = activeDocument.blocks.find((b) => b.id === blockId);
      if (!block) return { line: 0, column: 0 };

      const content = block.content || "";
      if (content.length === 0) return { line: 0, column: 0 };

      const hardLines = content.split("\n");
      const clampedLine = Math.max(0, Math.min(pos.line, hardLines.length - 1));
      const lineText = hardLines[clampedLine] ?? "";
      const clampedColumn = Math.max(0, Math.min(pos.column, lineText.length));

      return { line: clampedLine, column: clampedColumn };
    },

    blockNavigateUp(currentBlockId: string) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;
      const blocks = store.documents[activeDocumentIndex].blocks;
      const currentIndex = blocks.findIndex(
        (block) => block.id === currentBlockId
      );
      if (currentIndex > 0) {
        const previousBlock = blocks[currentIndex - 1];
        setStore(
          "documents",
          activeDocumentIndex,
          "focusedBlockId",
          previousBlock.id
        );
      }
    },

    blockNavigateDown(currentBlockId: string) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;
      const blocks = store.documents[activeDocumentIndex].blocks;
      const currentIndex = blocks.findIndex(
        (block) => block.id === currentBlockId
      );
      if (currentIndex < blocks.length - 1) {
        const nextBlock = blocks[currentIndex + 1];
        setStore(
          "documents",
          activeDocumentIndex,
          "focusedBlockId",
          nextBlock.id
        );
      }
    },

    setFocusedBlock,
  });

  return store;
}
