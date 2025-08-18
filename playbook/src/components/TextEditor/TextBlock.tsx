import {
  Component,
  createSignal,
  onMount,
  onCleanup,
  JSX,
  For,
  Show,
  createEffect,
} from "solid-js";
import { ContentEditable } from "@bigmistqke/solid-contenteditable";
import { Block } from "~/types/document";

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
  const [isEditing, setIsEditing] = createSignal(false);
  const [savedCaretPosition, setSavedCaretPosition] = createSignal<number>(0);
  const [textContent, setTextContent] = createSignal<string>(
    props.block.content
  );

  let blockRef: HTMLDivElement | undefined;

  const saveCaretPosition = () => {
    if (blockRef) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(blockRef);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        setSavedCaretPosition(preCaretRange.toString().length);
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
    return rects?.length && rects[0].top <= top + 2;
  }

  function caretIsAtBottom() {
    const range = window.getSelection()?.getRangeAt(0);
    const rects = range?.getClientRects();
    const bottom =
      range?.startContainer.parentElement?.getBoundingClientRect().bottom;
    if (!bottom) return false;
    return rects?.length && rects[0].bottom >= bottom - 2;
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

  const handleKeyDown = (e: KeyboardEvent) => {
    // Formatting shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case "b":
          e.preventDefault();
          // handleFormatChange("bold");
          return;
        case "i":
          e.preventDefault();
          // handleFormatChange("italic");
          return;
        case "u":
          e.preventDefault();
          // handleFormatChange("underline");
          return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      props.onBlockCreate(props.block.id);
    } else if (e.key === "Backspace" && props.block.content === "") {
      e.preventDefault();
      props.onBlockDelete(props.block.id);
    } else if (
      e.key === "ArrowUp" &&
      (caretIsAtTop() || props.block.content === "")
    ) {
      e.preventDefault();
      if (props.block.content !== "") saveCaretPosition();
      props.onNavigateUp?.();
    } else if (
      e.key === "ArrowDown" &&
      (caretIsAtBottom() || props.block.content === "")
    ) {
      e.preventDefault();
      if (props.block.content !== "") saveCaretPosition();
      props.onNavigateDown?.();
    } else if (e.key === "ArrowLeft") {
      saveCaretPosition();
    } else if (e.key === "ArrowRight") {
      saveCaretPosition();
    }
  };

  const handleFocus = () => {
    props.onBlockFocus(props.block.id);
  };

  // Restore caret position when block becomes focused
  createEffect(() => {
    if (props.isFocused) {
      blockRef?.focus();
    }

    if (!props.isFocused) {
      setIsEditing(false);
    }

    if (!isEditing() && props.isFocused && savedCaretPosition() >= 0) {
      restoreCaretPosition();
      setIsEditing(true);
    }
  });

  // const renderFormattedText = (text: string) => {
  //   // Parse markdown-style formatting with support for multiple formats
  //   const parts: Array<{
  //     text: string;
  //     type: "normal" | "bold" | "italic" | "underline";
  //     formats: string[];
  //   }> = [];
  //   let currentIndex = 0;

  //   while (currentIndex < text.length) {
  //     // Check for bold (**text**)
  //     if (text.slice(currentIndex, currentIndex + 2) === "**") {
  //       const endIndex = text.indexOf("**", currentIndex + 2);
  //       if (endIndex !== -1) {
  //         const boldText = text.slice(currentIndex + 2, endIndex);
  //         // Check if this bold text also has other formatting
  //         const innerFormats = [];
  //         let innerText = boldText;

  //         // Check for italic within bold
  //         if (boldText.startsWith("*") && boldText.endsWith("*")) {
  //           innerFormats.push("italic");
  //           innerText = boldText.slice(1, -1);
  //         }

  //         // Check for underline within bold
  //         if (innerText.startsWith("_") && innerText.endsWith("_")) {
  //           innerFormats.push("underline");
  //           innerText = innerText.slice(1, -1);
  //         }

  //         parts.push({
  //           text: innerText,
  //           type: "bold",
  //           formats: ["bold", ...innerFormats],
  //         });
  //         currentIndex = endIndex + 2;
  //         continue;
  //       }
  //     }

  //     // Check for italic (*text*)
  //     if (text[currentIndex] === "*") {
  //       const endIndex = text.indexOf("*", currentIndex + 1);
  //       if (endIndex !== -1 && endIndex > currentIndex + 1) {
  //         const italicText = text.slice(currentIndex + 1, endIndex);
  //         // Check if this italic text also has underline
  //         const innerFormats = [];
  //         let innerText = italicText;

  //         if (italicText.startsWith("_") && italicText.endsWith("_")) {
  //           innerFormats.push("underline");
  //           innerText = italicText.slice(1, -1);
  //         }

  //         parts.push({
  //           text: innerText,
  //           type: "italic",
  //           formats: ["italic", ...innerFormats],
  //         });
  //         currentIndex = endIndex + 1;
  //         continue;
  //       }
  //     }

  //     // Check for underline (_text_)
  //     if (text[currentIndex] === "_") {
  //       const endIndex = text.indexOf("_", currentIndex + 1);
  //       if (endIndex !== -1 && endIndex > currentIndex + 1) {
  //         const underlineText = text.slice(currentIndex + 1, endIndex);
  //         parts.push({
  //           text: underlineText,
  //           type: "underline",
  //           formats: ["underline"],
  //         });
  //         currentIndex = endIndex + 1;
  //         continue;
  //       }
  //     }

  //     // Regular text
  //     let regularText = "";
  //     while (
  //       currentIndex < text.length &&
  //       text[currentIndex] !== "*" &&
  //       text[currentIndex] !== "_"
  //     ) {
  //       regularText += text[currentIndex];
  //       currentIndex++;
  //     }

  //     if (regularText) {
  //       parts.push({ text: regularText, type: "normal", formats: [] });
  //     }
  //   }

  //   return parts;
  // };

  return (
    <div class="flex">
      <Show when={props.block.type == "ol"}>
        <span class="mr-2">1.</span>
      </Show>
      <Show when={props.block.type == "ul"}>
        <span class="mr-2">🞄</span>
      </Show>
      <ContentEditable
        ref={blockRef}
        class="min-h-[1.5rem] w-full outline-none cursor-text"
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        textContent={props.block.content}
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
  );
};
