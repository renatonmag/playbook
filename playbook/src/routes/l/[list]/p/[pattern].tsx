import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  Switch,
} from "solid-js";
import { parseMarkdown } from "~/lib/parseMarkdown";
import { Button } from "~/components/button";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import { createStore } from "solid-js/store";
import { checklist, setChecklist } from "~/store/checklist";
import { useParams } from "@solidjs/router";
import { UploadButton } from "~/lib/uploadthing";
import { ImageCaroulsel } from "~/components/ImageCarousel";
import { param } from "drizzle-orm";

export default function Home() {
  const params = useParams();

  const [html] = createResource(
    () => getListComponent(params.list, params.pattern)?.markdown,
    parseMarkdown,
  );
  let previewDiv: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;
  createEffect(() => {
    if (previewDiv) {
      previewDiv.innerHTML = html() || "";
    }
  });

  return (
    <main class="flex w-full h-[calc(100vh-50px)] text-gray-800 p-1.5 gap-1">
      <div class="w-2/3 h-full py-8 px-4 flex flex-col items-center justify-start relative overflow-y-auto">
        <Button
          as="a"
          href={"/lists"}
          variant="outline"
          size="icon"
          class="absolute top-4 left-4"
        >
          <ArrowLeft />
        </Button>

        <div class="font-bold text-lg text-gray-700 mb-4">
          {getListComponent()?.title}
        </div>
        <ImageCaroulsel
          class="max-w-2xl"
          images={getListComponent()?.images || []}
        />
        <div
          class="prose w-full h-full mt-[30px] wrap-break-word"
          ref={previewDiv}
        ></div>
      </div>

      <div class="w-[calc(33%+3rem)] h-full bg-gray-200 rounded-md py-8 px-4 flex flex-col items-center justify-start overflow-y-auto">
        <div class="font-bold text-lg text-gray-700 mb-4">
          {getListComponent()?.title}
        </div>
        <ImageCaroulsel
          class="max-w-lg"
          images={getListComponent()?.images || []}
        />
        <UploadButton
          content={{
            button({ ready, isUploading }) {
              if (!ready()) return "Preparando...";
              if (isUploading()) return "Enviando...";
              return "Escolher arquivo"; // The default text whens ready
            },
          }}
          class="my-4 ut-button:px-3 ut-button:py-1 ut-button:bg-gray-300 ut-button:ut-readying:bg-gray-300/50"
          endpoint="imageUploader"
        />
        <div class="h-full w-full">
          <textarea
            placeholder="Escreva seu texto aqui..."
            id="markdown"
            class="w-full min-h-full outline-none resize-none bg-transparent field-sizing-content"
            onInput={(e) => {
              setChecklist(
                (_item) => _item.id === params.list,
                "components",
                (component) => component.id === params.pattern,
                "markdown",
                e.currentTarget.value,
              );
            }}
          >
            {getListComponent()?.markdown ?? ""}
          </textarea>
        </div>
      </div>
    </main>
  );
}
