import { batch, createEffect, untrack } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { getCaretPositionFromSelection } from "~/lib/caret";
import { Block, Image } from "~/types/document";
import { createUploadThing } from "~/ut/utUtils";
import { createHistory } from "~/utils/createHistory";
import { blocks } from "~/utils/doc";
import { api } from "../../convex/_generated/api";
import { createMutation, createQuery } from "../cvxsolid";

export interface IDocumentsActions {
  // Block management
  addBlock: (afterId: string, opts?: { block?: Block }) => Block;
  removeBlock: (
    indexSequence: number[],
    opts?: { focus?: "same" | "prev" }
  ) => void;
  updateBlockContent: (blockId: string, content: string) => void;
  history: any;
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
  dispatchUndoEvent: (blockRef: HTMLDivElement) => void;
  dispatchRedoEvent: (blockRef: HTMLDivElement) => void;
  sendPatch: (attributes: any) => void;
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
        blockCaretPositionToSet: null,
      },
    ],
    activeDocumentId: "1dsfds33",
  });
  const history = createHistory();

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

  const createPatch = (attributes: any) => {
    let block: Block | null = null;
    switch (attributes.kind) {
      case "addBlock":
        block = getBlock(
          store.documents[getActiveDocumentIndex()].blocks,
          attributes.indexSequence ?? []
        );
        if (!block) return;
        const pos = actions.getBlockCaret(attributes.blockId);

        const patch = {
          kind: "addBlock",
          indexSequence: attributes.indexSequence,
          opts: attributes?.opts,
          undo: () =>
            actions.removeBlock(
              [
                ...attributes.indexSequence.slice(0, -1),
                attributes.indexSequence[attributes.indexSequence.length - 1] +
                  1,
              ],
              { focus: "prev" }
            ),
        };

        if (pos.column === 0) {
          return patch;
        }

        patch.undo = () => {
          actions.removeBlock(attributes.indexSequence, { focus: "same" });
        };

        return patch;
      case "removeBlock":
        block = getBlock(
          store.documents[getActiveDocumentIndex()].blocks,
          attributes.indexSequence
        );
        return {
          kind: "removeBlock",
          indexSequence: attributes.indexSequence,
          opts: attributes?.opts,
          undo: () => {
            actions.addBlock(attributes.indexSequence, {
              block,
            });
          },
        };
      case "updateBlock":
        block = getBlock(
          store.documents[getActiveDocumentIndex()].blocks,
          attributes.indexSequence
        );
        if (!block) return;
        return {
          kind: "updateBlock",
          indexSequence: attributes.indexSequence,
          opts: attributes?.opts,
          content: attributes.content,
          undo: () => {
            actions.updateBlockContent(
              attributes.indexSequence,
              block!.content
            );
          },
        };
      default:
        return {
          kind: "unknown",
          indexSequence: attributes.indexSequence,
          undo: undefined,
        };
    }
  };

  Object.assign(actions, {
    sendPatch(attributes: any) {
      const patch = createPatch(attributes);
      if (!patch.undo) return;
      history.past.push(patch);
      switch (patch.kind) {
        case "addBlock":
          actions.addBlock(patch.indexSequence);
          break;
        case "removeBlock":
          actions.removeBlock(patch.indexSequence, patch.opts);
          break;
        case "updateBlock":
          actions.updateBlockContent(patch.indexSequence, patch.content);
          break;
        default:
          return;
      }
    },
    history,

    // Block management
    async addBlock(indexSequence: number[], opts?: { block?: Block }) {
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
              newBlock.type = "ol";
            } else if (block.type === "ul") {
              newBlock.type = "ul";
            } else if (block.type === "radio") {
              newBlock.type = "radio";
            } else if (block.type === "checkbox") {
              newBlock.type = "checkbox";
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
            } else if (block.type === "ul") {
              newBlock.type = "ul";
            } else if (block.type === "radio") {
              newBlock.type = "radio";
            } else if (block.type === "checkbox") {
              newBlock.type = "checkbox";
            }
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
        setStore(
          "documents",
          activeDocumentIndex,
          produce((draft) => {
            keepOlOrder(draft.blocks);
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

      setStore(...path.path(), (blocks) => {
        return [...blocks, blockToSink];
      });

      if (blockToSink.type === "ol") {
        setStore(
          "documents",
          activeDocumentIndex,
          produce((draft) => {
            keepOlOrder(draft.blocks);
            return draft;
          })
        );
      }
    },

    liftBlock(indexSequence: number[]) {
      if (indexSequence.length <= 1) return;
      const activeDocumentIndex = getActiveDocumentIndex();
      const blockToLift = getBlock(
        store.documents[activeDocumentIndex].blocks,
        indexSequence
      );
      if (!blockToLift) return;

      // path = new EditorPath(activeDocumentIndex).blocks().parent(indexSequence);

      // const _path = path.path().slice(0, -1);
      // const afterBlock = path.path().pop();

      setStore(
        "documents",
        activeDocumentIndex,
        produce((draft) => {
          let blockToLift = getBlock(draft.blocks, indexSequence);
          if (!blockToLift) return draft;
          blockToLift = {
            ...blockToLift,
          };

          let parent = getParent(draft, indexSequence);
          if (!parent) return draft;
          if (blockToLift.blocks.length === 0) {
            const nextBlocks = parent.blocks.slice(
              indexSequence[indexSequence.length - 1] + 1
            );
            parent.blocks = parent.blocks.slice(
              0,
              indexSequence[indexSequence.length - 1]
            );
            blockToLift.blocks = nextBlocks;
          }

          parent.blocks = parent.blocks.filter(
            (block) => block.id !== blockToLift.id
          );

          const parent_index = indexSequence.slice(0, -1);
          const parent_parent = getParent(draft, parent_index);
          if (!parent_parent) return draft;
          parent_parent.blocks.splice(
            parent_index[parent_index.length - 1] + 1,
            0,
            blockToLift
          );

          setFocusedBlock(blockToLift.id);
          return draft;
        })
      );
      // setStore(..._path, (blocks) => {
      //   const updated = [...blocks];
      //   updated.splice(afterBlock + 1, 0, blockToLift);
      //   return updated;
      // });

      setStore(
        "documents",
        activeDocumentIndex,
        produce((draft) => {
          keepOlOrder(draft.blocks);
          return draft;
        })
      );
    },

    async removeBlock(
      indexSequence: number[],
      opts?: { focus?: "same" | "prev" }
    ) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;

      const activeDocument = getActiveDocument();
      if (!activeDocument || activeDocument.blocks.length <= 1) return; // Keep at least one block

      const blockToRemove = getBlock(activeDocument.blocks, indexSequence);

      if (!blockToRemove) return;

      if (blockToRemove && blockToRemove.images) {
        blockToRemove.images.forEach((image) => {
          if (image.url) {
            URL.revokeObjectURL(image.url);
          }
        });
      }

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
            const prev = gePrevBlock(activeDocument, indexSequence);
            if (!prev) return state;
            prev.content = prev.content + blockToRemove.content;
            setFocusedBlock(prev.id);
            actions.setBlockCaretPositionToSet(prev.content.length);
            return state;
          })
        );
      }

      const prevBlock = gePrevBlock(activeDocument, indexSequence);
      if (opts?.focus === "prev" && prevBlock) {
        batch(() => {
          setFocusedBlock(prevBlock?.id);
          actions.setBlockCaretPositionToSet(prevBlock?.content.length);
        });
      }
      if (prevBlock?.type === "ol") {
        setStore(
          "documents",
          activeDocumentIndex,
          produce((draft) => {
            keepOlOrder(draft.blocks);
            return draft;
          })
        );
      }
    },

    setBlockCaretPositionToSet(pos: number) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;
      setStore(
        "documents",
        activeDocumentIndex,
        "blockCaretPositionToSet",
        pos
      );
    },

    updateBlockContent: async (
      content: string,
      indexSequence: number[],
      blockRef: HTMLDivElement,
      opts?: { blockType?: string }
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
      let changed = false;

      if (content.startsWith("() ")) {
        desiredType = "radio" as const;
        desiredContent = content.slice(3);
        changed = true;
      } else if (content.startsWith("[] ")) {
        desiredType = "checkbox" as const;
        desiredContent = content.slice(3);
        changed = true;
      } else if (content.startsWith("1. ")) {
        desiredType = "ol" as const;
        desiredContent = content.slice(3);
        changed = true;
      } else if (content.startsWith("- ")) {
        desiredType = "ul" as const;
        desiredContent = content.slice(2);
        changed = true;
      }

      if (changed) {
        setTimeout(() => {
          setStore(
            "documents",
            activeDocumentIndex,
            produce((blocks) => {
              const blockToChange = getBlock(blocks.blocks, indexSequence);
              if (!blockToChange) return blocks;
              blockToChange.content = desiredContent;
              blockToChange.type = desiredType as any;
              return blocks;
            })
          );
          actions.saveDocumentCaretPosition(blockRef, block.id);
          if (desiredType === "ol") {
            setStore(
              "documents",
              activeDocumentIndex,
              produce((draft) => {
                keepOlOrder(draft.blocks);
                return draft;
              })
            );
          }
        }, 0);
      } else {
        setStore(
          "documents",
          activeDocumentIndex,
          produce((blocks) => {
            const blockToChange = getBlock(blocks.blocks, indexSequence);
            if (!blockToChange) return blocks;
            blockToChange.content = desiredContent;
            blockToChange.type = desiredType as any;
            return blocks;
          })
        );
        actions.saveDocumentCaretPosition(blockRef, block.id);
        if (desiredType === "ol") {
          setStore(
            "documents",
            activeDocumentIndex,
            produce((draft) => {
              keepOlOrder(draft.blocks);
              return draft;
            })
          );
        }
      }
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

      // If caret at start and block is a list/radio/checkbox, revert to text
      if (blockType !== "text") {
        setStore(
          "documents",
          activeDocumentIndex,
          produce((draft) => {
            const blockToChange = getBlock(draft.blocks, indexSequence);
            if (!blockToChange) return draft;
            blockToChange.type = "text";
            return draft;
          })
        );
        // setStore(...path.path(), {
        //   ...block,
        //   type: "text",
        // });
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

    blockNavigateUp(indexSequence: number[]) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;
      const block = gePrevBlock(
        store.documents[activeDocumentIndex],
        indexSequence
      );
      if (!block) return;

      batch(() => {
        setStore("documents", activeDocumentIndex, "focusedBlockId", block.id);
        setStore("documents", activeDocumentIndex, "navDirection", "up");
      });
    },

    blockNavigateDown(indexSequence: number[]) {
      const activeDocumentIndex = getActiveDocumentIndex();
      if (activeDocumentIndex === -1) return;
      const block = getNextBlock(
        store.documents[activeDocumentIndex],
        indexSequence
      );
      if (!block) return;

      batch(() => {
        setStore("documents", activeDocumentIndex, "focusedBlockId", block.id);
        setStore("documents", activeDocumentIndex, "navDirection", "down");
      });
    },

    setFocusedBlock,
    sendInputEvent(blockRef: HTMLDivElement) {
      if (!blockRef) return;
      blockRef.dispatchEvent(
        new InputEvent("input", {
          inputType: "historyUndo",
          bubbles: true,
          cancelable: true,
        })
      );
    },
    dispatchUndoEvent(blockRef: HTMLDivElement) {
      let patch = history.past.peek();
      if (!patch) return;
      if (patch.blockId) {
        setFocusedBlock(patch.blockId);
        blockRef.dispatchEvent(
          new InputEvent("input", {
            inputType: "historyUndo",
            bubbles: true,
            cancelable: true,
          })
        );
        return;
      }
      patch = history.past.pop() as any;
      if (!patch) return;
      patch.undo?.();
    },
    dispatchRedoEvent(blockRef: HTMLDivElement) {
      let patch = history.future.peek();
      if (!patch) return;
      if (patch.blockId) {
        setFocusedBlock(patch.blockId);
        blockRef.dispatchEvent(
          new InputEvent("input", {
            inputType: "historyRedo",
            bubbles: true,
            cancelable: true,
          })
        );
        return;
      }
      patch = history.future.pop() as any;
      if (!patch) return;
      console.log({ patch });
      actions.sendPatch(patch);
    },
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

const getNextBlock = (document: any, indexes: number[]): Block | null => {
  if (!document || indexes.length === 0) return null;
  let parent = getParent(document, indexes);
  if (!parent) return null;

  if (parent.blocks[indexes[indexes.length - 1]].blocks.length > 0) {
    return parent.blocks[indexes[indexes.length - 1]].blocks[0];
  }
  if (indexes[indexes.length - 1] + 1 >= parent.blocks.length) {
    if (parent.blocks.length === 0) return null;
    indexes = indexes.slice(0, -1);
    parent = getParent(document, indexes);
    if (!parent || indexes[indexes.length - 1] + 1 >= parent.blocks.length)
      return null;

    return parent.blocks[indexes[indexes.length - 1] + 1];
  }

  return parent.blocks[indexes[indexes.length - 1] + 1];
};

function gePrevBlock(document: any, indexes: number[]): Block | null {
  if (!document || indexes.length === 0) return null;
  let parent = getParent(document, indexes);
  if (!parent) return null;

  if (indexes[indexes.length - 1] - 1 < 0) {
    return parent;
  }
  let prevSibling = getPrevSibling(document, indexes);
  if (!prevSibling) return null;
  while (prevSibling) {
    if (prevSibling.blocks.length === 0) return prevSibling;
    prevSibling = prevSibling.blocks[prevSibling.blocks.length - 1];
  }
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

const keepOlOrder = (blocks: any) => {
  let order = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type !== "ol") {
      order = 0;
      continue;
    }
    order++;
    blocks[i].order = order;
  }
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].blocks.length > 0) {
      keepOlOrder(blocks[i].blocks);
    }
  }
};
