import {
  Component,
  createSignal,
  onMount,
  onCleanup,
  JSX,
  For,
  Show,
  createEffect,
  Index,
  untrack,
} from "solid-js";
import { Block } from "~/types/document";
import { useGlobalStore } from "~/stores/storeContext";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "../ui/carousel";
import {
  getCaretPositionFromSelection,
  getVisualLineRects,
  setCaretAtLineColumn,
} from "~/lib/caret";
import { ContentEditable } from "../ContentEditable";

interface TextBlockProps {
  block: Block;
  onContentChange: (content: string) => void;
  onBlockCreate: (afterId: string, focusId: string) => void;
  onBlockDelete: (id: string) => void;
  onBlockFocus: (id: string) => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  setSavedCaretPosition: (pos: { line: number; column: number }) => void;
}

export const TextBlock: Component<TextBlockProps> = (props) => {
  const [gStore, actions] = useGlobalStore();
  const [carouselApi, setCarouselApi] = createSignal<any>(null);
  const [navIntent, setNavIntent] = createSignal<"up" | "down" | null>(null);
  const [backspaceCounter, setBackspaceCounter] = createSignal(0);

  let blockRef: HTMLDivElement | undefined;

  // const saveCaretPosition = (justLine?: boolean) => {
  //   if (!blockRef) return;
  //   const _pos = actions.getCaretPosition();
  //   const pos = getCaretPositionFromSelection(blockRef);
  //   if (justLine) {
  //     pos.column = _pos.column;
  //   }
  //   actions.setCaretPosition(pos);
  //   return pos;
  // };

  function caretIsAtTop() {
    const range = window.getSelection()?.getRangeAt(0);
    const rects = range?.getClientRects();
    const top =
      range?.startContainer.parentElement?.getBoundingClientRect().top;
    if (!top) return false;
    if (rects?.length === 0) return true;
    return rects?.length && Math.trunc(rects[0].top) <= Math.trunc(top) + 2;
  }

  function caretIsAtBottom() {
    const range = window.getSelection()?.getRangeAt(0);
    const rects = range?.getClientRects();
    const bottom =
      range?.startContainer.parentElement?.getBoundingClientRect().bottom;
    if (!bottom) return false;
    if (rects?.length === 0) return true;
    return (
      rects?.length &&
      (Math.trunc(rects[0].bottom) >= Math.trunc(bottom) - 3 ||
        Math.trunc(rects?.[1]?.bottom || 0) >= Math.trunc(bottom) - 3)
    );
  }

  const getSelectedText = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      return {
        text: range.toString(),
        range: range,
        hasSelection: range.toString().length > 0,
      };
    }
    return { text: "", range: null, hasSelection: false };
  };

  const handleRemoveImage = () => {
    try {
      // Get the current block ID from props
      const blockId = props.block.id;

      // Check if there are images in the block
      if (props.block.images && props.block.images.length > 0) {
        // Get the current slide index from the carousel API
        const api = carouselApi();
        let currentIndex = 0;

        if (api) {
          currentIndex = api.selectedScrollSnap();
        }

        // Remove the currently visible image
        if (currentIndex >= 0 && currentIndex < props.block.images.length) {
          const imageToRemove = props.block.images[currentIndex];
          if (imageToRemove) {
            actions.removeImageFromBlock(blockId, imageToRemove.id);
          }
        }
      }
    } catch (error) {
      console.error("Error removing image from block:", error);
      // Could add user notification here in the future
    }
  };

  const keyBindings = {
    Tab: (data: any) => {
      data.event.preventDefault();
      actions.sinkBlock(props.indexSequence);
      return null;
    },
    Enter: (data: any) => {
      if (!data.event.shiftKey) {
        data.event.preventDefault();

        // Guard: when content is empty and block type is not "text", convert to text type
        if (data.textContent === "" && props.block.type !== "text") {
          actions.setBlockTypeToText(props.indexSequence);
          return null;
        }
        actions.sendPatch({
          kind: "addBlock",
          indexSequence: props.indexSequence,
        });
        // actions.addBlock(props.indexSequence);
      }
      return null;
    },
    Backspace: (data: any) => {
      const pos = actions.getBlockCaret(props.block.id);
      if (props.block.content === "")
        setBackspaceCounter(backspaceCounter() + 1);
      if (pos.column === 0 || backspaceCounter() >= 2) {
        data.event.preventDefault();
        setBackspaceCounter(0);

        const result = actions.setBlockTypeToText(props.indexSequence);
        if (result) {
          return null;
        }

        if (props.indexSequence.length > 1) {
          actions.liftBlock(props.indexSequence);
          return null;
        }

        actions.sendPatch({
          kind: "removeBlock",
          indexSequence: props.indexSequence,
          opts: { focus: "prev" },
        });
        return null;
      }
      return null;
    },
    ArrowUp: (data: any) => {
      const saved = actions.saveDocumentCaretPosition(
        blockRef,
        props.indexSequence,
        true
      );
      if (saved) {
        setCaretAtLineColumn(blockRef, {
          line: saved.line,
          column: saved.column + 1,
        });
      }
      if (caretIsAtTop()) {
        setNavIntent("up");
        data.event.preventDefault();
        actions.blockNavigateUp(props.indexSequence);
      }
      return null;
    },
    ArrowDown: (data: any) => {
      const saved = actions.saveDocumentCaretPosition(
        blockRef,
        props.indexSequence,
        true
      );
      if (saved) {
        setCaretAtLineColumn(blockRef, {
          line: saved.line,
          column: saved.column + 1,
        });
      }

      if (caretIsAtBottom()) {
        setNavIntent("down");
        data.event.preventDefault();
        actions.blockNavigateDown(props.indexSequence);
      }
      return null;
    },
  };

  // Restore caret position when block becomes focused
  createEffect(() => {
    if (actions.getActiveDocument()?.focusedBlockId === props.block.id) {
      if (!blockRef) return;
      props.setFocusedBlockRef(blockRef);
      untrack(() => {
        const blockCaretPositionToSet =
          actions.getActiveDocument()?.blockCaretPositionToSet;
        if (blockCaretPositionToSet) {
          const rects = getVisualLineRects(blockRef);
          const lastLine = Math.max(0, rects.length - 1);
          setCaretAtLineColumn(blockRef, {
            line: lastLine,
            column: blockCaretPositionToSet,
          });
          actions.setBlockCaretPositionToSet(null);
        }
        return;
      });
      untrack(() => {
        if (actions.getActiveDocument()?.navDirection === "up") {
          const rects = getVisualLineRects(blockRef);
          const lastLine = Math.max(0, rects.length - 1);
          const saved = actions.getCaretPosition();
          setCaretAtLineColumn(blockRef, {
            line: lastLine,
            column: saved.column,
          });
        } else if (actions.getActiveDocument()?.navDirection === "down") {
          const saved = actions.getCaretPosition();
          setCaretAtLineColumn(blockRef, { line: 0, column: saved.column });
        }
      });
    }
  });

  function getFilesFromClipboardEvent(event: ClipboardEvent) {
    const dataTransferItems = event.clipboardData?.items;
    if (!dataTransferItems) return;

    const files = Array.from(dataTransferItems).reduce<File[]>((acc, curr) => {
      const f = curr.getAsFile();
      return f ? [...acc, f] : acc;
    }, []);

    return files;
  }

  return (
    <div
      classList={{
        "flex flex-col justify-center items-center w-full mt-1": true,
        "pl-[22px]":
          props.indexSequence.length > 1 && props.block.type === "text",
      }}
    >
      <div class="flex w-full items-center">
        <Show when={props.block.type == "ol"}>
          <span class="mr-2 leading-normal">{props.block.order}.</span>
        </Show>
        <Show when={props.block.type == "ul"}>
          <span class="mr-2 leading-normal">🞄</span>
        </Show>
        <Show when={props.block.type == "radio"}>
          <span class="mr-2 leading-normal">0</span>
        </Show>
        <Show when={props.block.type == "checkbox"}>
          <Checkbox class="mr-[6px]" id="terms1" />
        </Show>
        <div class="w-full">
          <ContentEditable
            blockId={props.block.id}
            data-block-id={props.block.id}
            data-block-type={props.block.type}
            ref={blockRef}
            class="min-h-[1.5rem] w-full outline-none cursor-text leading-normal"
            keyBindings={keyBindings}
            onMouseDown={() => {
              actions.setFocusedBlock(props.block.id);
            }}
            onMouseUp={() => {
              actions.saveDocumentCaretPosition(blockRef, props.indexSequence);
            }}
            onKeyUp={(e) => {
              if (e.key === "Enter") {
                return;
              }
              actions.saveDocumentCaretPosition(blockRef, props.indexSequence);
              // if (blockRef) {
              //   if (e.key === "ArrowDown") {
              //     setNavIntent("down");
              //   }
              //   if (e.key === "ArrowUp") {
              //     setNavIntent("up");
              //   }
              // }
            }}
            textContent={props.block.content || ""}
            onPaste={(e) => {
              const files = getFilesFromClipboardEvent(e);
              if (files && files.length > 0) {
                // Process image files with size validation (2MB limit)
                const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB in bytes

                // Separate image and non-image files for graceful handling
                const imageFiles = files.filter(
                  (file) =>
                    file.type.startsWith("image/") &&
                    [
                      "image/jpeg",
                      "image/png",
                      "image/gif",
                      "image/webp",
                    ].includes(file.type) &&
                    file.size <= MAX_FILE_SIZE
                );

                const nonImageFiles = files.filter(
                  (file) => !file.type.startsWith("image/")
                );

                const oversizedImages = files.filter(
                  (file) =>
                    file.type.startsWith("image/") &&
                    [
                      "image/jpeg",
                      "image/png",
                      "image/gif",
                      "image/webp",
                      "image/avif",
                      "image/svg+xml",
                      "image/tiff",
                      "image/webp",
                    ].includes(file.type) &&
                    file.size > MAX_FILE_SIZE
                );

                // Log information about filtered files for debugging
                if (nonImageFiles.length > 0) {
                  console.log(
                    `Filtered out ${nonImageFiles.length} non-image files`
                  );
                }
                if (oversizedImages.length > 0) {
                  console.log(
                    `Filtered out ${oversizedImages.length} oversized images (>2MB)`
                  );
                }

                if (imageFiles.length > 0) {
                  // Process multiple images simultaneously
                  console.log(
                    `Processing ${imageFiles.length} image(s) simultaneously`
                  );

                  // Convert files to Image objects and add to block
                  const images = imageFiles.map((file) => ({
                    id: `img_${Date.now()}_${Math.random()
                      .toString(36)
                      .substr(2, 9)}`,
                    filename: file.name,
                    size: file.size,
                    type: file.type,
                    url: URL.createObjectURL(file), // Create object URL for display
                  }));

                  // Add all images to the current block in a single operation
                  actions.addImagesToBlock(props.block.id, images, imageFiles);

                  // Verify that images were added successfully
                  console.log(
                    `Successfully added ${images.length} image(s) to block ${props.block.id}`
                  );

                  // Log the created image objects for debugging
                  images.forEach((image) => {
                    console.log(
                      `Image added: ${image.filename} (${image.type}, ${image.size} bytes)`
                    );
                  });
                }
              }
            }}
            onTextContent={(textContent) => {
              actions.updateBlockContent(
                textContent,
                props.indexSequence,
                blockRef
              );
            }}
            // render={(textContent) => {
            //   return (
            //     <For each={textContent()?.split(" ") ?? []}>
            //       {(word, wordIndex) => (
            //         <>
            //           <Show when={word.startsWith("#")} fallback={word}>
            //             <button onClick={() => console.log("clicked!")}>
            //               {word}
            //             </button>
            //           </Show>
            //           <Show
            //             when={
            //               textContent().split(" ").length - 1 !== wordIndex()
            //             }
            //             children=" "
            //           />
            //         </>
            //       )}
            //     </For>
            //   );
            // }}
          />
          <For each={props.block.blocks}>
            {(child, index) => (
              <TextBlock
                block={child}
                indexSequence={[...props.indexSequence, index()]}
                setFocusedBlockRef={props.setFocusedBlockRef}
                onBlockDelete={props.onBlockDelete}
                onBlockFocus={props.onBlockFocus}
                setSavedCaretPosition={props.setSavedCaretPosition}
              />
            )}
          </For>
        </div>
      </div>
      <Show when={props.block.images && props.block.images.length > 0}>
        <Carousel class="w-full max-w-xl mt-5" setApi={setCarouselApi}>
          <CarouselContent class="">
            <Index each={props.block.images}>
              {(image) => (
                <CarouselItem>
                  <img
                    src={image().url}
                    alt={image().filename}
                    class="w-full h-auto max-h-[550px] object-contain"
                    loading="lazy"
                  />
                </CarouselItem>
              )}
            </Index>
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
        <div class="flex justify-end w-full">
          <Button class="mt-2" onClick={handleRemoveImage}>
            -
          </Button>
        </div>
      </Show>
    </div>
  );
};
