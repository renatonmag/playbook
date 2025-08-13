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
import { Button } from "../ui/button";

interface TextBlockProps {
  id: string;
  content: string;
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
}

export const TextBlock: Component<TextBlockProps> = (props) => {
  const [isEditing, setIsEditing] = createSignal(false);
  const [localContent, setLocalContent] = createSignal(props.content);
  const [savedCaretPosition, setSavedCaretPosition] = createSignal<number>(0);

  let blockRef: HTMLDivElement | undefined;

  createEffect(() => {
    console.log({ savedCaretPosition: savedCaretPosition() });
  });

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
    console.log({ savedCaretPosition: savedCaretPosition() });
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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      props.onBlockCreate(props.id);
    } else if (e.key === "Backspace" && localContent() === "") {
      e.preventDefault();
      props.onBlockDelete(props.id);
    } else if (
      e.key === "ArrowUp" &&
      (caretIsAtTop() || localContent() === "")
    ) {
      e.preventDefault();
      if (localContent() !== "") saveCaretPosition();
      props.onNavigateUp?.();
    } else if (
      e.key === "ArrowDown" &&
      (caretIsAtBottom() || localContent() === "")
    ) {
      e.preventDefault();
      if (localContent() !== "") saveCaretPosition();
      props.onNavigateDown?.();
    } else if (e.key === "ArrowLeft") {
      saveCaretPosition();
    } else if (e.key === "ArrowRight") {
      saveCaretPosition();
    }
  };

  const handleFocus = () => {
    props.onBlockFocus(props.id);
  };

  createEffect(() => {
    if (props.isFocused) {
      blockRef?.focus();
    }
  });

  // Restore caret position when block becomes focused
  createEffect(() => {
    if (savedCaretPosition() >= 0) {
      restoreCaretPosition();
      setIsEditing(true);
    }
  });

  return (
    <ContentEditable
      ref={blockRef}
      class="min-h-[1.5rem] outline-none cursor-text"
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      textContent={localContent()}
      onTextContent={setLocalContent}
      render={(textContent) => (
        <For each={textContent().split(" ")}>
          {(word, wordIndex) => (
            <>
              <Show when={word.startsWith("#")} fallback={word}>
                <Button onClick={() => console.log("clicked!")}>{word}</Button>
              </Show>
              <Show
                when={textContent().split(" ").length - 1 !== wordIndex()}
                children=" "
              />
            </>
          )}
        </For>
      )}
    />
  );
};
