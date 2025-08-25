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
} from "solid-js";
import { ContentEditable } from "@bigmistqke/solid-contenteditable";
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

interface TextBlockProps {
  block: Block;
  onContentChange: (content: string) => void;
  onBlockCreate: (afterId: string) => void;
  onBlockDelete: (id: string) => void;
  onBlockFocus: (id: string) => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  savedCaretPosition: any;
  setSavedCaretPosition: any;
  isFocused: boolean;
  isNavigation: boolean;
  onFormatChange?: (format: string, value?: any) => void;
  formattingState?: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color: string;
  };
  formatTrigger?: { format: string; value?: any } | null;
  onFormatApplied?: () => void;
  onFormattingChange?: (formatting: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
  }) => void;
}

export const TextBlock: Component<TextBlockProps> = (props) => {
  const [gStore, actions] = useGlobalStore();
  const [isEditing, setIsEditing] = createSignal(false);
  const [savedCaretPosition, setSavedCaretPosition] = createSignal<number>(0);
  const [textContent, setTextContent] = createSignal<string>(
    props.block.content
  );
  const [carouselApi, setCarouselApi] = createSignal<any>(null);

  let blockRef: HTMLDivElement | undefined;

  const saveCaretPosition = () => {
    if (blockRef) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(blockRef);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        props.setSavedCaretPosition(preCaretRange.toString().length);
      }
    }
  };

  const restoreCaretPosition = () => {
    if (blockRef && savedCaretPosition() > 0) {
      setTimeout(() => {
        if (blockRef) {
          const selection = window.getSelection();
          const range = document.createRange();

          // Simple approach: create a text node and set position
          const textContent = blockRef.textContent || "";
          const targetPosition = Math.min(
            savedCaretPosition(),
            textContent.length
          );

          // Find the first text node (simplified approach)
          let textNode = null;
          for (let i = 0; i < blockRef.childNodes.length; i++) {
            const node = blockRef.childNodes[i];
            if (node.nodeType === Node.TEXT_NODE) {
              textNode = node;
              break;
            }
          }

          if (textNode) {
            const offset = Math.min(
              targetPosition,
              textNode.textContent?.length || 0
            );
            range.setStart(textNode, offset);
            range.setEnd(textNode, offset);
          } else {
            // Fallback: place at end of content
            range.selectNodeContents(blockRef);
            range.collapse(false);
          }

          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }, 0);
    }
  };

  function caretIsAtTop() {
    const range = window.getSelection()?.getRangeAt(0);
    const rects = range?.getClientRects();
    const top =
      range?.startContainer.parentElement?.getBoundingClientRect().top;
    if (!top) return false;
    return rects?.length && Math.trunc(rects[0].top) <= Math.trunc(top) + 2;
  }

  function caretIsAtBottom() {
    const range = window.getSelection()?.getRangeAt(0);
    const rects = range?.getClientRects();
    const bottom =
      range?.startContainer.parentElement?.getBoundingClientRect().bottom;
    if (!bottom) return false;
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
    Enter: (data: any) => {
      if (!data.event.shiftKey) {
        data.event.preventDefault();
        props.onBlockCreate(props.block.id);
      }
      return null;
    },
    Backspace: (data: any) => {
      saveCaretPosition();
      actions.setBlockTypeToText(props.block.id);
      if (data.textContent === "") {
        data.event.preventDefault();
        props.onBlockDelete(props.block.id);
      }
      return null;
    },
    ArrowRight: (data: any) => {
      saveCaretPosition();

      return null;
    },
    ArrowLeft: (data: any) => {
      saveCaretPosition();

      return null;
    },
    ArrowDown: (data: any) => {
      console.log({ bottom: caretIsAtBottom() });
      if (caretIsAtBottom() || data.textContent === "") {
        data.event.preventDefault();
        actions.blockNavigateDown(props.block.id);
      }
      return null;
    },
    ArrowUp: (data: any) => {
      console.log({ top: caretIsAtTop() });
      if (caretIsAtTop() || data.textContent === "") {
        data.event.preventDefault();
        actions.blockNavigateUp(props.block.id);
      }
      return null;
    },
  };

  // const handleKeyDown = (e: KeyboardEvent) => {
  //   // Formatting shortcuts
  //   if (e.ctrlKey || e.metaKey) {
  //     switch (e.key.toLowerCase()) {
  //       case "b":
  //         e.preventDefault();
  //         // handleFormatChange("bold");
  //         return;
  //       case "i":
  //         e.preventDefault();
  //         // handleFormatChange("italic");
  //         return;
  //       case "u":
  //         e.preventDefault();
  //         // handleFormatChange("underline");
  //         return;
  //     }
  //   }

  //   if (e.key === "Enter" && !e.shiftKey) {
  //     e.preventDefault();
  //     props.onBlockCreate(props.block.id);
  //   } else if (e.key === "Backspace" && props.block.content === "") {
  //     e.preventDefault();
  //     props.onBlockDelete(props.block.id);
  //   } else if (
  //     e.key === "ArrowUp" &&
  //     (caretIsAtTop() || props.block.content === "")
  //   ) {
  //     e.preventDefault();
  //     if (props.block.content !== "") saveCaretPosition();
  //     props.onNavigateUp?.();
  //   } else if (
  //     e.key === "ArrowDown" &&
  //     (caretIsAtBottom() || props.block.content === "")
  //   ) {
  //     e.preventDefault();
  //     if (props.block.content !== "") saveCaretPosition();
  //     props.onNavigateDown?.();
  //   } else if (
  //     e.key === "ArrowRight" ||
  //     e.key === "ArrowLeft" ||
  //     e.key === "Backspace"
  //   ) {
  //     saveCaretPosition();
  //   }
  // };

  // Restore caret position when block becomes focused
  createEffect(() => {
    if (actions.getActiveDocument()?.focusedBlockId === props.block.id) {
      setTimeout(() => {
        blockRef?.focus();
      }, 0);
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
    <div class="flex flex-col justify-center items-center w-full">
      <div class="flex w-full">
        <Show when={props.block.type == "ol"}>
          <span class="mr-2">1.</span>
        </Show>
        <Show when={props.block.type == "ul"}>
          <span class="mr-2">🞄</span>
        </Show>
        <Show when={props.block.type == "radio"}>
          <span class="mr-2">0</span>
        </Show>
        <Show when={props.block.type == "checkbox"}>
          <Checkbox id="terms1" />
        </Show>
        <ContentEditable
          ref={blockRef}
          class="min-h-[1.5rem] w-full outline-none cursor-text"
          // onKeyDown={handleKeyDown}
          keyBindings={keyBindings}
          onMouseDown={() => {
            actions.setFocusedBlock(props.block.id);
            saveCaretPosition();
          }}
          textContent={props.block.content}
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
                actions.addImagesToBlock(props.block.id, images);

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
          onTextContent={props.onContentChange}
          render={(textContent) => {
            return (
              <For each={textContent().split(" ")}>
                {(word, wordIndex) => (
                  <>
                    <Show when={word.startsWith("#")} fallback={word}>
                      <button onClick={() => console.log("clicked!")}>
                        {word}
                      </button>
                    </Show>
                    <Show
                      when={textContent().split(" ").length - 1 !== wordIndex()}
                      children=" "
                    />
                  </>
                )}
              </For>
            );
          }}
        />
      </div>
      <Show when={props.block.images && props.block.images.length > 0}>
        <Carousel class="w-full max-w-xl mt-5" setApi={setCarouselApi}>
          <CarouselContent>
            <Index each={props.block.images}>
              {(image) => (
                <CarouselItem>
                  <div class="p-1">
                    <img
                      src={image().url}
                      alt={image().filename}
                      class="w-full h-auto rounded"
                      loading="lazy"
                    />
                  </div>
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
