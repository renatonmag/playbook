import {
  createEffect,
  createSignal,
  InitializedResourceReturn,
  onMount,
  untrack,
} from "solid-js";
import { logger } from "~/utils/logger";
import { Block, Image } from "~/types/document";
import { createStore, produce, unwrap } from "solid-js/store";
import { ConvexClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { createAction, createMutation, createQuery } from "../cvxsolid";
import { getDocuments } from "../../convex/documents";
import { createUploadThing } from "~/ut/utUtils";
import { getCaretPositionFromSelection } from "~/lib/caret";
import { blocks } from "~/utils/doc";

export interface IDocumentsActions {
  // Block management
  addBlock: (afterId: string, type?: "text" | "list") => Block;
  removeBlock: (blockId: string) => void;
  updateBlockContent: (blockId: string, content: string) => void;
  // Document management
  createDocument: (title?: string) => Promise<string>;
  getActiveDocument: () => DocumentStore | undefined;
  setActiveDocumentId: (documentId: string) => void;
  updateDocumentTitleLocal: (documentId: string, title: string) => void;
  persistDocumentTitle: (documentId: string, title: string) => Promise<void>;
  getCaretPosition: () => { line: number; column: number };
  saveDocumentCaretPosition: (
    blockRef: HTMLDivElement,
    blockId: string,
    justLine?: boolean
  ) => { line: number; column: number };
  setBlockTypeToText: (blockId: string) => void;
  clampCaretToBlock: (
    blockId: string,
    pos: { line: number; column: number }
  ) => { line: number; column: number };

  // Image management
  addImagesToBlock: (blockId: string, images: Image[], files: File[]) => void;
  removeImageFromBlock: (blockId: string, key: string) => void;

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
  blockCaretPosition?: Record<string, { line: number; column: number }>;
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
        blocks: blocks,
        focusedBlockId: "1",
        caretPosition: { line: 0, column: 0 },
        blockCaretPosition: {},
      },
    ],
    activeDocumentId: "1dsfds33",
  });

  // createEffect(() => {
  //   const activeDocument = getActiveDocument();
  //   if (activeDocument) {
  //     console.log(unwrap(activeDocument.caretPosition.column));
  //   }
  // });

  const { startUpload, isUploading } = createUploadThing("imageUploader", {
    onClientUploadComplete: (res) => {
      console.log(res);
    },
    onUploadError: (error: Error) => {
      console.error(error);
    },
  });

  const deleteUploadthingFiles = async (keys: string[]) => {
    try {
      const res = await fetch("/api/uploadthing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keys),
      });
      if (!res.ok) return false;
      return true;
    } catch (e) {
      return false;
    }
  };

  const [getDocumentsQuery, unsubber] = createQuery<DocumentStore[]>(
    api.documents.getDocuments
  );
  const createDocumentMutation = createMutation(api.documents.createDocument);
  const addBlockMutation = createMutation(api.documents.addBlock);
  const updateBlockMutation = createMutation(api.documents.updateBlock);
  const removeBlockMutation = createMutation(api.documents.removeBlock);
  const updateDocumentTitleMutation = createMutation(
    api.documents.updateDocumentTitle
  );
  const createGalleryAndLinkBlockMutation = createMutation(
    api.documents.createGalleryAndLinkBlock
  );
  const appendGalleryUrlsMutation = createMutation(
    api.documents.appendGalleryUrls
  );
  const removeGalleryUrlMutation = createMutation(
    api.documents.removeGalleryUrl
  );

  createEffect(() => {
    const documents = getDocumentsQuery();
    if (!documents) return;

    untrack(() => {
      const docs = [
        ...store.documents,
        ...documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          blocks: doc.blocks.map((block) => ({
            ...block,
            caretPosition: block.caretPosition || { line: 0, column: 0 },
          })),
          focusedBlockId: doc.blocks[0].id,
          caretPosition: { line: 0, column: 0 },
        })),
      ];
      setStore("documents", docs);
      unsubber();
    });
  });

  const setBlockCaretPosition = (
    blockId: string,
    pos: { line: number; column: number }
  ) => {
    const activeDocumentIndex = getActiveDocumentIndex();
    if (activeDocumentIndex === -1) return;
    const blockIdx = store.documents[activeDocumentIndex].blocks.findIndex(
      (block) => block.id === blockId
    );
    if (blockIdx === -1) return;
    const block = store.documents[activeDocumentIndex].blocks[blockIdx];
    setStore(
      "documents",
      activeDocumentIndex,
      "blockCaretPosition",
      blockId,
      pos
    );
  };

  const setDocumentCaretPosition = (pos: { line: number; column: number }) => {
    const activeDocumentIndex = getActiveDocumentIndex();
    if (activeDocumentIndex === -1) return;
    setStore("documents", activeDocumentIndex, "caretPosition", pos);
  };

  const createDefaultDocument = async (
    title?: string
  ): Promise<DocumentStore> => {
    const createRes: any = await createDocumentMutation({
      title: title ?? "Untitled",
      strategyId: state.defaultStrategyId as any,
    });
    const { documentId, firstBlockId } = createRes as {
      documentId: string;
      firstBlockId: string;
    };
    return {
      id: documentId as unknown as string,
      title: title ?? "Untitled",
      blocks: [
        {
          id: firstBlockId as unknown as string,
          content: "",
          type: "text",
          images: [],
          caretPosition: { line: 0, column: 0 },
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
    async addBlock(afterId?: string, focusId?: string) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return {} as Block;
      const activeDocumentId = store.documents[activeDocumentIndex].id;

      // const addBlockRes: any = await addBlockMutation({
      //   documentId: activeDocumentId as any,
      // });
      // const { blockId } = addBlockRes as { blockId: string };

      // Find the index of the block to insert after
      const activeDocument = store.documents[activeDocumentIndex];
      const findBlockIndexRecursively = (
        blocks: Block[],
        targetId: string
      ): number[] => {
        for (let i = 0; i < blocks.length; i++) {
          if (blocks[i].id === targetId) {
            return [i];
          }
          if (blocks[i].children && blocks[i].children.length > 0) {
            const childIndexes = findBlockIndexRecursively(
              blocks[i].children,
              targetId
            );
            if (childIndexes.length > 0) {
              return [i, ...childIndexes]; // Return sequence of indexes from parent to child
            }
          }
        }
        return [];
      };

      const afterBlockIndexes = findBlockIndexRecursively(
        activeDocument.blocks,
        afterId ?? ""
      );
      const block = getBlockAtIndexes(activeDocument.blocks, afterBlockIndexes);
      let newBlock: Block = {
        id: genId(),
        content: "",
        type: "text",
        order: undefined,
        images: [],
        caretPosition: { line: 0, column: 0 },
      };
      if (block.type === "ol" && afterBlockIndexes.length > 0) {
        setStore(
          "documents",
          activeDocumentIndex,
          "blocks",
          produce((draft) => {
            if (block?.type === "ol" && afterBlockIndexes.length > 0) {
              let i = afterBlockIndexes[afterBlockIndexes.length - 1];
              const parentChildrenIdxs = afterBlockIndexes.slice(0, -1);
              let updated = [
                ...(getBlockAtIndexes(draft, parentChildrenIdxs)?.children ??
                  []),
              ];
              if (i === undefined) return blocks;
              while (i < updated.length && updated[i]?.type === "ol") {
                const current = updated[i];
                updated[i] = {
                  ...current,
                  order: (current.order ?? 0) + 1,
                } as any;
                i++;
              }
            }
          })
        );
        newBlock.type = "ol";
        newBlock.order = block?.order + 1;
      }

      // Before inserting a new block, if we're inside an ordered list,
      // increment the order of all subsequent contiguous 'ol' blocks

      if (afterBlockIndexes.length === 0) {
        // If afterId block not found, append to the start
        setStore("documents", activeDocumentIndex, "blocks", (blocks) => [
          newBlock,
          ...blocks,
        ]);
        setTimeout(() => {
          setFocusedBlock(focusId ?? newBlock.id);
        }, 0);
      } else {
        // Insert the new block after the specified block
        const path = makePathFromIndexes(afterBlockIndexes.slice(0, -1), [
          "documents",
          activeDocumentIndex,
          "blocks",
        ]);
        console.log({ path });
        setStore(...path, "children", (blocks) => {
          const updated = [...blocks];
          updated.splice(
            afterBlockIndexes[afterBlockIndexes.length - 1] + 1,
            0,
            newBlock
          );
          return updated;
        });
        // setStore("documents", activeDocumentIndex, "blocks", (blocks) => [
        //   ...blocks.slice(0, afterBlockIndex + 1),
        //   newBlock,
        //   ...blocks.slice(afterBlockIndex + 1),
        // ]);
        setTimeout(() => {
          setFocusedBlock(focusId ?? newBlock.id);
        }, 0);
      }
    },

    getPrevBlock(blockId: string): Block | null {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return null;
      const blocks = store.documents[activeDocumentIndex].blocks;
      const blockIdx = blocks.findIndex((b) => b.id === blockId);
      if (blockIdx < 0) return null;
      return blocks[blockIdx - 1];
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

    getCaretPosition() {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return { line: 0, column: 0 };
      return store.documents[activeDocumentIndex].caretPosition;
    },

    updateDocumentTitleLocal(documentId: string, title: string) {
      const docIndex = getDocumentIndexById(documentId);
      if (docIndex === -1) return;
      setStore("documents", docIndex, "title", title);
    },

    async persistDocumentTitle(documentId: string, title: string) {
      const docIndex = getDocumentIndexById(documentId);
      if (docIndex === -1) return;
      try {
        await updateDocumentTitleMutation({
          documentId: documentId as any,
          title,
        });
      } catch (e) {
        // No-op on error per simple UX; could add toast here
      }
    },

    async removeBlock(blockId: string, focusId?: string) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;

      const activeDocument = getActiveDocument();
      if (!activeDocument || activeDocument.blocks.length <= 1) return; // Keep at least one block

      // const result: any = await removeBlockMutation({
      //   documentId: activeDocument.id as any,
      //   blockId: blockId as any,
      // });
      // if (!result?.success) return;

      // Find the block to remove and clean up its object URLs
      const blockToRemoveIdx = activeDocument.blocks.findIndex(
        (block) => block.id === blockId
      );
      const blockToRemove = activeDocument.blocks[blockToRemoveIdx];

      if (blockToRemove?.type === "ol") {
        setStore("documents", activeDocumentIndex, "blocks", (blocks) => {
          const updated = [...blocks];
          let i = blockToRemoveIdx + 1;
          while (i < updated.length && updated[i]?.type === "ol") {
            const current = updated[i];
            updated[i] = {
              ...current,
              order: (current.order ?? 0) - 1,
            } as any;
            i++;
          }
          return updated;
        });
      }

      if (blockToRemove && blockToRemove.images) {
        blockToRemove.images.forEach((image) => {
          if (image.url) {
            URL.revokeObjectURL(image.url);
          }
        });
      }

      if (focusId) {
        setFocusedBlock(focusId);
      } else {
        const currentIndex = activeDocument.blocks.findIndex(
          (block) => block.id === blockId
        );
        const newFocusedIndex = Math.max(0, currentIndex - 1);
        const newFocusedBlock = activeDocument.blocks[newFocusedIndex];
        if (newFocusedBlock) {
          setFocusedBlock(newFocusedBlock.id);
        }
      }

      setStore("documents", activeDocumentIndex, "blocks", (blocks) =>
        blocks.filter((block) => block.id !== blockId)
      );
    },

    updateBlockContent: async (
      blockId: string,
      content: string,
      blockRef: HTMLDivElement
    ) => {
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

      const prevBlock = activeDocument.blocks[blockIdx - 1];
      const newOrder = prevBlock?.type === "ol" ? prevBlock.order + 1 : 1;
      setTimeout(() => {
        setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
          ...block,
          content: desiredContent,
          type: desiredType as any,
          order: desiredType === "ol" ? newOrder : undefined,
        });
        actions.saveDocumentCaretPosition(blockRef, blockId);
      }, 0);

      // debouncedUpdateBlockMutation({
      //   blockId: blockId as any,
      //   content: desiredContent,
      //   type: desiredType,
      //   order: desiredType === "ol" ? newOrder : undefined,
      // });
    },

    saveDocumentCaretPosition: (
      blockRef: HTMLDivElement,
      blockId: string,
      justLine?: boolean
    ) => {
      if (!blockRef) return;
      const _pos = actions.getCaretPosition();
      const pos = getCaretPositionFromSelection(blockRef);
      if (justLine) {
        pos.column = _pos.column;
      }
      setBlockCaretPosition(blockId, pos);
      setDocumentCaretPosition(pos);
      return pos;
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
        (caretPos.column === 0 || block?.caretPosition?.column === 0) &&
        (block.type === "ul" ||
          block.type === "ol" ||
          block.type === "radio" ||
          block.type === "checkbox")
      ) {
        // await updateBlockMutation({
        //   blockId: blockId as any,
        //   type: "text",
        // });
        setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
          ...block,
          type: "text",
        });
        return;
      }
    },

    async addImagesToBlock(blockId: string, images: Image[], files: File[]) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;

      const blocks = store.documents[activeDocumentIndex].blocks;
      const blockIdx = blocks.findIndex((b) => b.id === blockId);
      if (blockIdx < 0) return;

      const block = blocks[blockIdx];
      const currentImages = block.images || [];

      // Ensure galleryId exists: lazily create on first upload
      let galleryId = block.galleryId as any;
      if (!galleryId) {
        const res: any = await createGalleryAndLinkBlockMutation({
          blockId: blockId as any,
        });
        galleryId = (res as any)?.galleryId as any;
        if (galleryId) {
          setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
            ...block,
            galleryId: galleryId as string,
          });
        }
      }

      // Upload files via UploadThing
      const results = await startUpload(files);
      const successful = (results ?? [])
        .filter((r: any) => r && r.ufsUrl && r.key)
        .map((r: any) => ({ url: r.ufsUrl as string, key: r.key as string }));

      if (!galleryId || successful.length === 0) {
        // Update local images only; do not persist when no successful uploads
        const updatedImages = [...currentImages, ...images];
        setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
          ...block,
          images: updatedImages,
        });
        return;
      }

      // Persist to Convex preserving order
      await appendGalleryUrlsMutation({
        galleryId: galleryId as any,
        items: successful as any,
      });

      // Update local state: append successful uploads for rendering
      const updatedImages = [...currentImages, ...images];
      setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
        ...block,
        images: updatedImages,
      });
    },

    async removeImageFromBlock(blockId: string, key: string) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;

      const blocks = store.documents[activeDocumentIndex].blocks;
      const blockIdx = blocks.findIndex((b) => b.id === blockId);
      if (blockIdx < 0) return;

      const block = blocks[blockIdx];
      const currentImages = block.images || [];

      // Remove by upload key; revoke local object URL if any
      const imageToRemove = currentImages.find((image) => image.id === key);
      // First delete from UploadThing; abort Convex/local changes if it fails
      const deleted = await deleteUploadthingFiles([key]);
      if (!deleted) return;

      // Remove from Convex gallery
      const galleryId = block.galleryId as any;
      if (galleryId) {
        try {
          const res: any = await removeGalleryUrlMutation({
            galleryId: galleryId as any,
            key,
          });
          if (res?.deletedGallery) {
            setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
              ...block,
              galleryId: undefined as unknown as string,
            });
          }
        } catch (e) {
          // Swallow errors per PRD: do not show error to user
        }
      }

      if (imageToRemove?.url) URL.revokeObjectURL(imageToRemove.url);

      const updatedImages = currentImages.filter((image) => image.id !== key);

      setStore("documents", activeDocumentIndex, "blocks", blockIdx, {
        ...block,
        images: updatedImages,
      });
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

export const genId = () => {
  return `blockId-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;
};

const findByIdBFS = (root: Block | Block[], id: string): Block | null => {
  if (!root) return null;

  // Handle both single block and array of blocks as root
  const queue: Block[] = Array.isArray(root) ? [...root] : [root];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.id === id) return node;
    if (node.children && node.children.length > 0) {
      queue.push(...node.children);
    }
  }
  return null;
};

function makePathFromIndexes(
  indexes: number[],
  rootKey: any[] = ["documents", "blocks"]
) {
  // Start with rootKey then alternate index, "children", index, "children", ...
  const path = [...rootKey];
  for (let i = 0; i < indexes.length; i++) {
    path.push(indexes[i].toString());
    if (i < indexes.length - 1) path.push("children");
  }
  return path;
}

function updateBlockAtIndexes(setter: any, indexes: number[], updater: any) {
  const path = makePathFromIndexes(indexes);
  // If updater is a function, Solid accepts a function as last arg for functional updates
  if (typeof updater === "function") {
    setter(...path, (prev) => ({ ...prev, ...updater(prev) })); // for whole-node updates
  } else {
    // assume updater is an object of fields to merge into the node
    setter(...path, (prev) => ({ ...prev, ...updater }));
  }
}

const getBlockAtIndexes = (
  blocks: Block[],
  indexes: number[]
): Block | null => {
  if (!blocks || indexes.length === 0) return null;

  let current: Block[] | Block = blocks;

  for (const index of indexes) {
    if (Array.isArray(current)) {
      if (index >= current.length || index < 0) return null;
      current = current[index];
    } else {
      if (!current.children || index >= current.children.length || index < 0)
        return null;
      current = current.children[index];
    }
  }

  return Array.isArray(current) ? null : current;
};
