import {
  createEffect,
  InitializedResourceReturn,
  onMount,
  untrack,
} from "solid-js";
import { logger } from "~/utils/logger";
import { Block, Image } from "~/types/document";
import { createStore, unwrap } from "solid-js/store";
import { ConvexClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { createAction, createMutation, createQuery } from "../cvxsolid";
import { getDocuments } from "../../convex/documents";

export interface IDocumentsActions {
  // Block management
  addBlock: (afterId: string, type?: "text" | "list") => Block;
  removeBlock: (blockId: string) => void;
  updateBlockContent: (blockId: string, content: string) => void;
  // Document management
  createDocument: (title?: string) => Promise<string>;
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
 * @param actions
 * @param state
 * @param setState
 * @returns
 */

export function createDocumentStore(
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

  const getDocumentsQuery = createQuery(api.documents.getDocuments);
  const createDocumentMutation = createMutation(api.documents.createDocument);
  const addBlockMutation = createMutation(api.documents.addBlock);
  const updateBlockMutation = createMutation(api.documents.updateBlock);
  const removeBlockMutation = createMutation(api.documents.removeBlock);

  createEffect(() => {
    const documents = getDocumentsQuery();
    if (!documents) return;
    untrack(() => {
      const docs = [
        ...store.documents,
        ...documents.map((doc) => ({
          id: doc._id,
          title: doc.title,
          blocks: doc.blocks,
          focusedBlockId: doc.blocks[0],
          caretPosition: { line: 0, column: 0 },
        })),
      ];
      setStore("documents", docs);
    });
  });

  const createDefaultDocument = async (
    title?: string
  ): Promise<DocumentStore> => {
    const { documentId, firstBlockId } = await createDocumentMutation({
      title: title ?? "Untitled",
      strategyId: state.defaultStrategyId as any,
    });
    return {
      id: documentId as unknown as string,
      title: title ?? "Untitled",
      blocks: [
        {
          id: firstBlockId as unknown as string,
          content: "",
          type: "text",
          images: [],
        },
      ],
      focusedBlockId: firstBlockId as unknown as string,
      caretPosition: { line: 0, column: 0 },
    };
  };

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
    async addBlock(afterId: string) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return {} as Block;
      const activeDocumentId = store.documents[activeDocumentIndex].id;

      const { blockId } = await addBlockMutation({
        documentId: activeDocumentId as any,
      });

      const newBlock: Block = {
        id: blockId as unknown as string,
        content: "",
        type: "text",
        images: [],
      };

      // Align with server behavior: append to the end
      setStore("documents", activeDocumentIndex, "blocks", (blocks) => [
        ...blocks,
        newBlock,
      ]);

      setTimeout(() => {
        setFocusedBlock(newBlock.id);
      }, 0);

      return newBlock;
    },

    // Document management
    async createDocument(title?: string) {
      const newDoc = await createDefaultDocument(title);
      setStore("documents", (docs) => [...docs, newDoc]);
      setStore("activeDocumentId", newDoc.id);
      return newDoc.id;
    },

    getActiveDocument,
    setActiveDocumentId(documentId: string) {
      setStore("activeDocumentId", documentId);
    },

    async removeBlock(blockId: string) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;

      const activeDocument = getActiveDocument();
      if (!activeDocument || activeDocument.blocks.length <= 1) return; // Keep at least one block

      const result = await removeBlockMutation({
        documentId: activeDocument.id as any,
        blockId: blockId as any,
      });
      if (!result?.success) return;

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

    async updateBlockContent(blockId: string, content: string) {
      const activeDocumentIndex = store.documents.findIndex(
        (doc) => doc.id === store.activeDocumentId
      );
      if (activeDocumentIndex === -1) return;

      const activeDocument = store.documents[activeDocumentIndex];
      const blockIdx = activeDocument.blocks.findIndex((b) => b.id === blockId);
      if (blockIdx < 0) return;

      const block = activeDocument.blocks[blockIdx];

      let desiredType = block.type;
      let desiredContent = content;

      if (content.startsWith("() ")) {
        desiredType = "radio" as const;
        desiredContent = content.slice(3);
      } else if (content.startsWith("[] ")) {
        desiredType = "checkbox" as const;
        desiredContent = content.slice(3);
      } else if (content.startsWith("1. ")) {
        desiredType = "ol" as const;
        desiredContent = content.slice(3);
      } else if (content.startsWith("- ")) {
        desiredType = "ul" as const;
        desiredContent = content.slice(2);
      }

      await updateBlockMutation({
        blockId: blockId as any,
        content: desiredContent,
        type: desiredType,
      });

      setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
        ...block,
        content: desiredContent,
        type: desiredType as any,
      });
    },

    async setBlockTypeToText(blockId: string) {
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
        await updateBlockMutation({
          blockId: blockId as any,
          type: "text",
        });
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
