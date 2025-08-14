import { Component, createSignal, createEffect, For } from "solid-js";
import { TextBlock } from "./TextBlock";
import FormattingToolbar from "./FormattingToolbar";

export interface Block {
  id: string;
  content: string;
  type: "text" | "list";
  formatting?: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color: string;
  };
}

interface TextEditorProps {
  initialBlocks?: Block[];
  onContentChange?: (blocks: Block[]) => void;
}

export const TextEditor: Component<TextEditorProps> = (props) => {
  const [blocks, setBlocks] = createSignal<Block[]>(
    props.initialBlocks || [
      {
        id: "1",
        content: "",
        type: "text",
        formatting: {
          bold: false,
          italic: false,
          underline: false,
          color: "inherit",
        },
      },
    ]
  );
  const [focusedBlockId, setFocusedBlockId] = createSignal<string>("1");
  const [savedCaretPosition, setSavedCaretPosition] = createSignal<number>(0);
  const [formatTrigger, setFormatTrigger] = createSignal<{
    format: string;
    value?: any;
  } | null>(null);
  const [currentFormatting, setCurrentFormatting] = createSignal<{
    bold: boolean;
    italic: boolean;
    underline: boolean;
  }>({ bold: false, italic: false, underline: false });

  const generateId = () =>
    `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleContentChange = (blockId: string, content: string) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId ? { ...block, content } : block
      )
    );
    props.onContentChange?.(blocks());
  };

  const handleBlockCreate = (afterId: string) => {
    const newBlock: Block = {
      id: generateId(),
      content: "",
      type: "text",
      formatting: {
        bold: false,
        italic: false,
        underline: false,
        color: "inherit",
      },
    };
    setBlocks((prev) => {
      const index = prev.findIndex((block) => block.id === afterId);
      if (index === -1) return [...prev, newBlock];

      const newBlocks = [...prev];
      newBlocks.splice(index + 1, 0, newBlock);
      return newBlocks;
    });

    // Focus the new block after a brief delay to ensure DOM update
    setTimeout(() => {
      setFocusedBlockId(newBlock.id);
    }, 0);
  };

  const handleBlockDelete = (blockId: string) => {
    if (blocks().length <= 1) return; // Keep at least one block

    // Focus the previous block or the first available block
    const currentIndex = blocks().findIndex((block) => block.id === blockId);
    const newFocusedIndex = Math.max(0, currentIndex - 1);
    const newFocusedBlock = blocks()[newFocusedIndex];
    if (newFocusedBlock) {
      setFocusedBlockId(newFocusedBlock.id);
    }

    setBlocks((prev) => prev.filter((block) => block.id !== blockId));
  };

  const handleBlockFocus = (blockId: string) => {
    setFocusedBlockId(blockId);
  };

  const handleFormatChange = (blockId: string, format: string, value?: any) => {
    // For the new selection-based formatting, we don't need to update the formatting state
    // The formatting is applied directly to the text content in the TextBlock
    if (format === "color") {
      setBlocks((prev) =>
        prev.map((block) => {
          if (block.id === blockId) {
            const currentFormatting = block.formatting || {
              bold: false,
              italic: false,
              underline: false,
              color: "inherit",
            };
            return {
              ...block,
              formatting: { ...currentFormatting, color: value },
            };
          }
          return block;
        })
      );
    }
  };

  const navigateToBlock = (blockId: string) => {
    setFocusedBlockId(blockId);
  };

  const handleNavigateUp = (currentBlockId: string) => {
    const currentIndex = blocks().findIndex(
      (block) => block.id === currentBlockId
    );
    if (currentIndex > 0) {
      const previousBlock = blocks()[currentIndex - 1];
      navigateToBlock(previousBlock.id);
    }
  };

  const handleNavigateDown = (currentBlockId: string) => {
    const currentIndex = blocks().findIndex(
      (block) => block.id === currentBlockId
    );
    if (currentIndex < blocks().length - 1) {
      const nextBlock = blocks()[currentIndex + 1];
      navigateToBlock(nextBlock.id);
    }
  };

  // Notify parent of content changes
  createEffect(() => {
    props.onContentChange?.(blocks());
  });

  const getCurrentFormattingState = () => {
    const focusedBlock = blocks().find(
      (block) => block.id === focusedBlockId()
    );
    return (
      focusedBlock?.formatting || {
        bold: false,
        italic: false,
        underline: false,
        color: "inherit",
      }
    );
  };

  const getActiveFormats = () => {
    return currentFormatting();
  };

  return (
    <div class="w-full max-w-4xl mx-auto bg-white border border-gray-200 rounded-lg">
      <FormattingToolbar
        onFormatChange={(format, value) => {
          if (focusedBlockId()) {
            if (format === "color") {
              handleFormatChange(focusedBlockId(), format, value);
            } else {
              // Trigger formatting in the focused TextBlock
              setFormatTrigger({ format, value });
            }
          }
        }}
        isActive={(format) => {
          const activeFormats = getActiveFormats();
          return activeFormats[format as keyof typeof activeFormats] || false;
        }}
      />
      <div class="min-h-[500px] p-4">
        <For each={blocks()}>
          {(block) => (
            <TextBlock
              id={block.id}
              content={block.content}
              onContentChange={(content) =>
                handleContentChange(block.id, content)
              }
              onBlockCreate={handleBlockCreate}
              onBlockDelete={handleBlockDelete}
              onBlockFocus={handleBlockFocus}
              onNavigateUp={() => handleNavigateUp(block.id)}
              onNavigateDown={() => handleNavigateDown(block.id)}
              isFocused={focusedBlockId() === block.id}
              isNavigation={false}
              savedCaretPosition={savedCaretPosition}
              setSavedCaretPosition={setSavedCaretPosition}
              onFormatChange={(format, value) => {
                if (format === "color") {
                  handleFormatChange(block.id, format, value);
                } else {
                  // For text formatting, pass it directly to the TextBlock
                  // The TextBlock will handle applying the formatting to selected text
                }
              }}
              formattingState={block.formatting}
              formatTrigger={formatTrigger()}
              onFormatApplied={() => setFormatTrigger(null)}
              onFormattingChange={setCurrentFormatting}
            />
          )}
        </For>
      </div>
    </div>
  );
};
