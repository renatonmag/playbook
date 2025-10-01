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
import { content } from "../../tailwind.config";

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

  // createEffect(() => {
  //   const activeDocument = getActiveDocument();
  //   if (!activeDocument) {
  //     console.info("No active document found");
  //     return;
  //   }

  //   const caretPosition = activeDocument.caretPosition;
  //   if (!caretPosition) {
  //     console.info("No blockCaretPosition found for active document", {
  //       documentId: activeDocument.id,
  //       documentTitle: activeDocument.title,
  //     });
  //     return;
  //   }

  //   console.info("Active document caretPosition changed", caretPosition.column);
  // });
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
    indexSequence: any,
    pos: { line: number; column: number }
  ) => {
    const activeDocumentIndex = getActiveDocumentIndex();
    if (activeDocumentIndex === -1) return;
    const block = getBlock(
      store.documents[activeDocumentIndex].blocks,
      indexSequence
    );
    if (block === null) return;
    // console.log({ block, pos });
    setStore(
      "documents",
      activeDocumentIndex,
      "blockCaretPosition",
      block.id,
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
    async addBlock(indexSequence: number[]) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return {} as Block;
      const activeDocument = store.documents[activeDocumentIndex];

      const block = getBlock(activeDocument.blocks, indexSequence ?? []);
      if (!block) return;

      const id = genId();
      let newBlock: Block = {
        id,
        content: "",
        type: "text",
        order: undefined,
        images: [],
        blocks: [],
      };

      const pos = actions.getBlockCaret(block.id);
      if (pos.column === 0 && block.content !== "") {
        setStore(
          produce((state) => {
            const parent = getParent(
              state.documents[activeDocumentIndex],
              indexSequence
            );
            if (!parent) return state;
            if (block.type === "ol") {
              const prev =
                parent.blocks[indexSequence[indexSequence.length - 1]];
              newBlock.type = "ol";
              newBlock.order = prev.order;
              prev.order = (prev.order ?? 0) + 1;
            }
            parent.blocks.splice(
              indexSequence[indexSequence.length - 1],
              0,
              newBlock
            );
            return state;
          })
        );
      } else {
        setStore(
          produce((state) => {
            const parent = getParent(
              state.documents[activeDocumentIndex],
              indexSequence
            );
            if (!parent) return state;
            const prev = parent.blocks[indexSequence[indexSequence.length - 1]];
            if (block.type === "ol") {
              newBlock.type = "ol";
              newBlock.order = (block.order ?? 0) + 1;
            }
            console.log({ newBlock, block });
            parent.blocks.splice(
              indexSequence[indexSequence.length - 1] + 1,
              0,
              {
                ...newBlock,
                content: block.content.slice(pos.absolute),
                blocks: prev.blocks,
              }
            );

            prev.blocks = [];
            prev.content = block.content.slice(0, pos.absolute);
            return state;
          })
        );

        setTimeout(() => {
          setFocusedBlock(newBlock.id);
        }, 0);
      }

      if (block.type === "ol") {
        // const pos = actions.getBlockCaret(block.id);
        if (pos.column === 0) return;
        //   setStore(
        //     "documents",
        //     activeDocumentIndex,
        //     produce((draft) => {
        //       const parent = getParent(draft, indexSequence);
        //       if (!parent) return;
        //       parent.blocks.splice(
        //         indexSequence[indexSequence.length - 1],
        //         0,
        //         newBlock
        //       );
        //       return draft;
        //     })
        //   );
        // }
        setStore(
          "documents",
          activeDocumentIndex,
          produce((draft) => {
            let i = indexSequence[indexSequence.length - 1] + 2;
            const parent = getParent(draft, indexSequence);
            if (!parent) return;
            if (i === undefined) return blocks;
            while (
              i < parent.blocks.length &&
              parent.blocks[i]?.type === "ol"
            ) {
              const current = parent.blocks[i];
              parent.blocks[i] = {
                ...current,
                order: (current.order ?? 0) + 1,
              } as any;
              i++;
            }
            return draft;
          })
        );
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

    getBlockCaret(blockId: string) {
      const activeDocumentIndex = getActiveDocumentIndex();

      if (activeDocumentIndex === -1)
        return { line: 0, column: 0, absolute: 0 };
      return (
        store.documents[activeDocumentIndex].blockCaretPosition?.[blockId] || {
          line: 0,
          column: 0,
          absolute: 0,
        }
      );
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

    sinkBlock(indexSequence: number[]) {
      const blockDepth = new BlockDepth(indexSequence);
      if (!blockDepth.canSink()) return;

      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;
      const blockToSink = getBlock(
        store.documents[activeDocumentIndex].blocks,
        indexSequence
      );

      if (!blockToSink) return;

      let path = new EditorPath(activeDocumentIndex)
        .blocks()
        .parent(indexSequence);

      if (indexSequence.length > 1) path = path.blocks();

      setStore(
        produce((state) => {
          const activeDocument = state.documents[activeDocumentIndex];
          const parent = getParent(activeDocument, indexSequence);
          if (!parent) return state;
          parent.blocks = parent.blocks.filter(
            (block) => block.id !== blockToSink?.id
          );
          return state;
        })
      );
      // setStore(...path.path(), (blocks) =>
      //   blocks.filter((block) => block.id !== blockToSink?.id)
      // );

      path = new EditorPath(activeDocumentIndex)
        .blocks()
        .prevSibling(indexSequence)
        .blocks();

      console.log({ path });

      setStore(...path.path(), (blocks) => {
        return [...blocks, blockToSink];
      });
    },

    liftBlock(indexSequence: number[]) {
      if (indexSequence.length <= 1) return;
      const activeDocumentIndex = getActiveDocumentIndex();
      const blockToLift = getBlock(
        store.documents[activeDocumentIndex].blocks,
        indexSequence
      );
      if (!blockToLift) return;

      let path = new EditorPath(activeDocumentIndex)
        .blocks()
        .parent(indexSequence);

      if (indexSequence.length > 1) path = path.blocks();

      setStore(...path.path(), (blocks) =>
        blocks.filter((block) => block.id !== blockToLift?.id)
      );

      path = new EditorPath(activeDocumentIndex).blocks().parent(indexSequence);

      const _path = path.path().slice(0, -1);
      const afterBlock = path.path().pop();

      setStore(..._path, (blocks) => {
        const updated = [...blocks];
        updated.splice(afterBlock + 1, 0, blockToLift);
        return updated;
      });
    },

    async removeBlock(indexSequence: number[]) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;

      const activeDocument = getActiveDocument();
      if (!activeDocument || activeDocument.blocks.length <= 1) return; // Keep at least one block

      const blockToRemove = getBlock(activeDocument.blocks, indexSequence);

      if (!blockToRemove) return;

      // if (blockToRemove?.type === "ol") {
      //   setStore("documents", activeDocumentIndex, "blocks", (blocks) => {
      //     const updated = [...blocks];
      //     let i = blockToRemoveIdx + 1;
      //     while (i < updated.length && updated[i]?.type === "ol") {
      //       const current = updated[i];
      //       updated[i] = {
      //         ...current,
      //         order: (current.order ?? 0) - 1,
      //       } as any;
      //       i++;
      //     }
      //     return updated;
      //   });
      // }

      if (blockToRemove && blockToRemove.images) {
        blockToRemove.images.forEach((image) => {
          if (image.url) {
            URL.revokeObjectURL(image.url);
          }
        });
      }
      const pos = actions.getBlockCaret(blockToRemove.id);
      if (pos.column === 0) {
        setStore(
          produce((state) => {
            const activeDocument = state.documents[activeDocumentIndex];
            const parent = getParent(activeDocument, indexSequence);
            if (!parent) return state;
            parent.blocks = parent.blocks.filter(
              (block) => block.id !== blockToRemove?.id
            );
            parent.blocks.splice(
              indexSequence[indexSequence.length - 1],
              0,
              ...blockToRemove.blocks
            );
            return state;
          })
        );

        if (blockToRemove.content) {
          setStore(
            produce((state) => {
              const activeDocument = state.documents[activeDocumentIndex];
              const prev = gePrevtBlock(activeDocument, indexSequence);
              if (!prev) return state;
              prev.content = prev.content + blockToRemove.content;
              setFocusedBlock(prev.id);
              return state;
            })
          );
        }
      }

      const prevBlock = getPrevSibling(activeDocument, indexSequence);
      if (prevBlock?.type === "ol") {
        setStore(
          "documents",
          activeDocumentIndex,
          produce((state) => {
            const parent = getParent(state, indexSequence);
            if (!parent) return state;
            let i = indexSequence[indexSequence.length - 1];
            let order = parent.blocks[i].order;
            if (order === undefined) return state;
            console.log({ i, order });
            while (
              i < parent.blocks.length &&
              parent.blocks[i]?.type === "ol"
            ) {
              const current = parent.blocks[i];
              order++;
              parent.blocks[i] = {
                ...current,
                order: order,
              } as any;
              i++;
            }
            return state;
          })
        );
      }
    },

    updateBlockContent: async (
      content: string,
      indexSequence: number[],
      blockRef: HTMLDivElement
    ) => {
      const activeDocumentIndex = store.documents.findIndex(
        (doc) => doc.id === store.activeDocumentId
      );
      if (activeDocumentIndex === -1) return;

      const activeDocument = store.documents[activeDocumentIndex];
      const block = getBlock(activeDocument.blocks, indexSequence);
      if (!block) return;

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

      const prevBlock = getBlock(activeDocument.blocks, [
        ...indexSequence.slice(0, -1),
        indexSequence[indexSequence.length - 1] - 1,
      ]);
      const newOrder = prevBlock?.type === "ol" ? prevBlock.order + 1 : 1;

      const path = makePathFromIndexes(
        indexSequence,
        [],
        ["documents", activeDocumentIndex, "blocks"]
      );

      setTimeout(() => {
        setStore(...path, {
          ...block,
          content: desiredContent,
          type: desiredType as any,
          order: desiredType === "ol" ? newOrder : undefined,
        });
        actions.saveDocumentCaretPosition(blockRef, block.id);
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
      indexSequence: number[],
      justLine?: boolean
    ) => {
      if (!blockRef) return;
      const _pos = actions.getCaretPosition();
      const pos = getCaretPositionFromSelection(blockRef);
      if (justLine) {
        pos.column = _pos.column;
      }
      setBlockCaretPosition(indexSequence, pos);
      setDocumentCaretPosition(pos);
      return pos;
    },

    setBlockTypeToText(indexSequence: number[]) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return false;

      const block = getBlock(
        store.documents[activeDocumentIndex].blocks,
        indexSequence
      );
      if (!block) return false;

      const blockType = block.type;

      const caretPos = actions.getBlockCaret(block.id);

      // If caret at start and block is a list/radio/checkbox, revert to text
      if (caretPos.column === 0 && blockType !== "text") {
        let path = new EditorPath(activeDocumentIndex)
          .blocks()
          .block(indexSequence);

        setStore(...path.path(), {
          ...block,
          type: "text",
        });
        const pos = actions.getBlockCaret(block.id);
        if (blockType === "ol") {
          // const pos = actions.getBlockCaret(block.id);
          //   setStore(
          //     "documents",
          //     activeDocumentIndex,
          //     produce((draft) => {
          //       const parent = getParent(draft, indexSequence);
          //       if (!parent) return;
          //       parent.blocks.splice(
          //         indexSequence[indexSequence.length - 1],
          //         0,
          //         newBlock
          //       );
          //       return draft;
          //     })
          //   );
          // }
          setStore(
            "documents",
            activeDocumentIndex,
            produce((draft) => {
              let i = indexSequence[indexSequence.length - 1] + 1;
              const parent = getParent(draft, indexSequence);
              if (!parent) return;
              if (i === undefined) return blocks;
              let order = 0;
              while (
                i < parent.blocks.length &&
                parent.blocks[i]?.type === "ol"
              ) {
                const current = parent.blocks[i];
                order += 1;
                console.log({ current, order });
                parent.blocks[i] = {
                  ...current,
                  order: order,
                } as any;
                i++;
              }
              return draft;
            })
          );
        }

        return true;
      }
      return false;
    },

    joinBlocks(indexSequence: number[]) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;
      const block = getBlock(
        store.documents[activeDocumentIndex].blocks,
        indexSequence
      );
      if (!block) return;

      const pos = actions.getBlockCaret(block.id);
      if (pos.column === 0) {
        const parentPath = new EditorPath(activeDocumentIndex)
          .blocks()
          .parent(indexSequence);
        setStore(...parentPath.path(), (block) => ({
          ...block,
          content: block.content + block.content,
        }));
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
  endKey: any[],
  rootKey: any[] = ["documents", "blocks"]
): [] {
  // Start with rootKey then alternate index, "children", index, "children", ...
  const path = [...rootKey];
  for (let i = 0; i < indexes.length; i++) {
    path.push(indexes[i].toString());
    path.push(...endKey);
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

class BlockDepth {
  private _indexes: number[] = [];
  constructor(indexSequence: number[]) {
    this._indexes = indexSequence;
  }

  canSink() {
    console.log({ i: this._indexes[this._indexes.length - 1] });
    return this._indexes[this._indexes.length - 1] >= 1;
  }

  get block() {
    return this._indexes.length;
  }

  get parent() {
    if (this._indexes[this._indexes.length - 1] - 1 < 0)
      return this._indexes.length - 1;
    return this._indexes.length;
  }
}

function getPrevSibling(document: any, indexes: number[]): Block | null {
  if (!document || indexes.length === 0) return null;

  let current: Block[] | Block = document.blocks;

  if (indexes[indexes.length - 1] === 0) return null;

  indexes = [...indexes.slice(0, -1), indexes[indexes.length - 1] - 1];
  for (const index of indexes) {
    if (Array.isArray(current)) {
      if (index >= current.length || index < 0) return null;
      current = current[index];
    } else {
      if (!current?.blocks || index >= current?.blocks.length || index < 0)
        return null;
      current = current.blocks[index];
    }
  }

  return Array.isArray(current) ? null : current;
}

function getParent(document: any, indexes: number[]): Block | null {
  if (!document || indexes.length === 0) return null;

  let current: Block[] | Block = document.blocks;

  if (indexes.length === 1) return document;

  indexes = indexes.slice(0, -1);
  for (const index of indexes) {
    if (Array.isArray(current)) {
      if (index >= current.length || index < 0) return null;
      current = current[index];
    } else {
      if (!current?.blocks || index >= current?.blocks.length || index < 0)
        return null;
      current = current.blocks[index];
    }
  }

  return Array.isArray(current) ? null : current;
}

function gePrevtBlock(document: any, indexes: number[]): Block | null {
  if (!document || indexes.length === 0) return null;

  if (indexes[indexes.length - 1] - 1 < 0) return null;

  if (indexes[indexes.length - 1] - 1 < 0) indexes = indexes.slice(0, -1);
  else indexes = [...indexes.slice(0, -1), indexes[indexes.length - 1] - 1];
  let current: Block[] | Block = document.blocks;
  for (const index of indexes) {
    if (Array.isArray(current)) {
      if (index >= current.length || index < 0) return null;
      current = current[index];
    } else {
      if (!current?.blocks || index >= current?.blocks.length || index < 0)
        return null;
      current = current.blocks[index];
    }
  }

  if (Array.isArray(current)) return null;

  while (current?.blocks && current.blocks.length > 0) {
    current = current.blocks[current.blocks.length - 1];
  }

  return current;
}

const getBlock = (blocks: Block[], indexes: number[]): Block | null => {
  if (!blocks || indexes.length === 0) return null;

  let current: Block[] | Block = blocks;

  for (const index of indexes) {
    if (Array.isArray(current)) {
      if (index >= current.length || index < 0) return null;
      current = current[index];
    } else {
      if (!current?.blocks || index >= current?.blocks.length || index < 0)
        return null;
      current = current.blocks[index];
    }
  }

  return Array.isArray(current) ? null : current;
};

class EditorPath {
  private _path: string[] = [];

  constructor(public documentIdx: number) {
    this._path = ["documents", documentIdx.toString()];
  }

  parent(indexSequence: number[]) {
    indexSequence = indexSequence.slice(0, -1);
    this.block(indexSequence);
    return this;
  }

  blocks() {
    this._path.push("blocks");
    return this;
  }

  title() {
    this._path.push("title");
    return this;
  }

  caretPosition() {
    this._path.push("caretPosition");
    return this;
  }

  blockCaretPosition() {
    this._path.push("blockCaretPosition");
    return this;
  }

  block(indexSequence: number[]) {
    for (let i = 0; i < indexSequence.length; i++) {
      this._path.push(indexSequence[i].toString());
      if (i < indexSequence.length - 1) {
        this._path.push("blocks");
      }
    }
    return this;
  }

  prev(indexSequence) {
    if (indexSequence[indexSequence.length - 1] - 1 < 0) {
      for (let i = 0; i < indexSequence.length - 1; i++) {
        this._path.push(indexSequence[i].toString());
        this._path.push("blocks");
      }
      return this;
    }
    for (let i = 0; i < indexSequence.length; i++) {
      if (i < indexSequence.length - 1) {
        this._path.push(indexSequence[i].toString());
        this._path.push("blocks");
      }
      if (i === indexSequence.length - 1) {
        this._path.push((indexSequence[i] - 1).toString());
      }
    }
    return this;
  }

  prevSibling(indexSequence: number[]) {
    // if is the first block, no prev
    if (indexSequence[indexSequence.length - 1] - 1 < 0) return this;
    else {
      for (let i = 0; i < indexSequence.length; i++) {
        if (i < indexSequence.length - 1) {
          this._path.push(indexSequence[i].toString());
          this._path.push("blocks");
        }
        if (i === indexSequence.length - 1) {
          this._path.push((indexSequence[i] - 1).toString());
        }
      }
      return this;
    }
  }

  path() {
    return this._path;
  }
}

const getText = (block: Block, pos: number) => {
  return block.content.slice(pos);
};
