import { useGlobalStore } from "~/stores/storeContext";
import { TextEditor } from "./TextEditor/TextEditor";
import { Separator } from "./ui/separator";
import { useParams } from "@solidjs/router";
import { OverlayScrollbarsComponent } from "overlayscrollbars-solid";
import { getSelectionBlockDataIds } from "~/lib/caret";

const Document = (props: any) => {
  const [store, actions] = useGlobalStore();
  const activeDoc = () => actions.getActiveDocument();
  const handleTitleInput = (e: InputEvent) => {
    const target = e.target as HTMLInputElement;
    const doc = activeDoc();
    if (!doc) return;
    actions.updateDocumentTitleLocal(doc.id, target.value);
  };
  const handleTitleBlur = async (e: FocusEvent) => {
    const target = e.target as HTMLInputElement;
    const doc = activeDoc();
    if (!doc) return;
    const normalized = target.value.trim() || "Untitled";
    actions.updateDocumentTitleLocal(doc.id, normalized);
    await actions.persistDocumentTitle(doc.id, normalized);
  };

  return (
    <div class="min-h-[calc(100vh-78px)] max-h-[calc(100vh-78px)] overflow-y-auto">
      <OverlayScrollbarsComponent defer>
        <div
          class="w-[700px] mx-auto px-4 py-8"
          onSelectStart={(e: any) => {
            const selection = window.getSelection();
            const blockDataIds = getSelectionBlockDataIds();
            console.log({
              blockDataIds,
            });
          }}
        >
          <input
            value={activeDoc()?.title || ""}
            onInput={handleTitleInput}
            onBlur={handleTitleBlur}
            placeholder="Untitled"
            aria-label="Document title"
            class="w-full text-3xl font-bold text-gray-800 outline-none focus:ring-0 placeholder:text-gray-400"
          />
          <Separator class="my-4" />
          <TextEditor />
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
};

export default Document;
