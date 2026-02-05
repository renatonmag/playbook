import GripVertical from "lucide-solid/icons/grip-vertical";
import { Component, createEffect, createSignal, For, Show } from "solid-js";
import { TextBlock } from "./TextBlock";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

import { useParams } from "@solidjs/router";
import { useGlobalStore } from "~/stores/storeContext";
import { Block } from "~/types/document";

const isMac = navigator.platform.startsWith("Mac");

interface TextEditorProps {
  initialBlocks?: Block[];
  onContentChange?: (blocks: Block[]) => void;
  laneID?: string;
}

export const TextEditor: Component<TextEditorProps> = (props) => {
  const [gStore, actions] = useGlobalStore();

  const params = useParams();

  // createEffect(() => {
  //   console.log({ activeDocumentId: getActiveDocument() });
  // });

  createEffect(() => {
    if (
      params.documentId &&
      gStore.documents.activeDocumentId !== params.documentId
    ) {
      actions.setActiveDocumentId(params.documentId);
    }
  });

  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [contentEditable, setContentEditable] = createSignal(false);
  const [focusedBlockRef, setFocusedBlockRef] =
    createSignal<HTMLDivElement | null>(null);

  const focusBlock = () => {
    if (!focusedBlockRef()) return;
    focusedBlockRef()?.focus();
  };

  createEffect(() => {
    if (!contentEditable()) {
      focusBlock();
    }
  });

  return (
    <div
      class="mx-auto outline-0"
      contenteditable={contentEditable()}
      onMouseDown={() => {
        setContentEditable(true);
        document.body.addEventListener(
          "mouseup",
          () => {
            setContentEditable(false);
          },
          { once: true }
        );
      }}
      onKeyDown={(e) => {
        const ref = focusedBlockRef();
        if (!ref) return;
        if (isMac) {
          if (e.metaKey) {
            switch (e.key) {
              case "z":
                actions.dispatchUndoEvent(ref);
                break;
              case "Z":
                actions.dispatchRedoEvent(ref);
                break;
            }
          }
        } else {
          if (e.ctrlKey) {
            switch (e.key) {
              case "z":
                actions.dispatchUndoEvent(ref);
                break;
              case "y":
              case "Z":
                actions.dispatchRedoEvent(ref);
                break;
            }
          }
        }
      }}
    >
      <div>
        <For each={actions.getActiveDocument()?.blocks ?? []}>
          {(block, index) => (
            <div class="flex relative">
              <Show
                when={actions.getActiveDocument()?.focusedBlockId === block.id}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger class="text-gray-300 absolute top-0 left-[-35px] cursor-pointer">
                    <GripVertical />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent class="left-[-110px]">
                    <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
                      Galeria
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
                      Team
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Show>
              <TextBlock
                indexSequence={[index()]}
                block={block}
                setFocusedBlockRef={setFocusedBlockRef}
              />
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
