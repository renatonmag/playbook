import { Component, createSignal, onMount } from "solid-js";
import { TextEditor } from "../../components/TextEditor/TextEditor";
import type { Block } from "../../components/TextEditor/TextEditor";
import { loadCurrentDocument, saveCurrentDocument } from "~/lib/storage";
import { UploadButton, UploadDropzone } from "~/ut/utUtils";
import { SidebarInset, SidebarTrigger } from "~/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { IconChevronDown } from "~/components/app-sidebar";

const Document: Component = () => {
  const [blocks, setBlocks] = createSignal<Block[]>([
    {
      id: "1",
      content: "'this is a hashtag'",
      type: "text",
    },
  ]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      setIsLoading(true);
      const savedDocument = await loadCurrentDocument();
      if (savedDocument && savedDocument.blocks.length > 0) {
        setBlocks(savedDocument.blocks);
      }
    } catch (err) {
      setError("Failed to load saved document");
      console.error("Error loading document:", err);
    } finally {
      setIsLoading(false);
    }
  });

  const handleContentChange = async (newBlocks: Block[]) => {
    setBlocks(newBlocks);

    // Auto-save functionality
    try {
      const document = {
        id: "current",
        title: "Trading Strategy Rules",
        blocks: newBlocks,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      };
      await saveCurrentDocument(document);
    } catch (err) {
      console.error("Error auto-saving document:", err);
      // Don't show error to user for auto-save failures
    }
  };

  if (isLoading()) {
    return (
      <div class="flex items-center justify-center min-h-screen">
        <div class="text-lg">Loading document...</div>
      </div>
    );
  }

  if (error()) {
    return (
      <div class="flex items-center bg-red-500 justify-center min-h-screen">
        <div class="text-red-600 text-lg">{error()}</div>
      </div>
    );
  }

  return (
    <div class="min-h-screen">
      <SidebarInset>
        <div class="py-8">
          <TextEditor
            initialBlocks={blocks()}
            onContentChange={handleContentChange}
          />
        </div>
      </SidebarInset>
    </div>
  );
};

export default Document;
