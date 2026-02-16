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
import { Button } from "~/components/ui/button";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import { createStore } from "solid-js/store";
import { checklist, getListComponent, setChecklist } from "~/store/checklist";
import { useParams, useSearchParams } from "@solidjs/router";
import { UploadButton } from "~/lib/uploadthing";
import { ImageCaroulsel } from "~/components/ImageCarousel";

import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";

export default function Home() {
  const [editTitle, setEditTitle] = createSignal(false);
  const [title, setTitle] = createSignal("");
  const [params, _] = useSearchParams();

  const [html] = createResource(
    () => getListComponent(params.pattern)?.markdown,
    parseMarkdown,
  );
  let previewDiv: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;
  createEffect(() => {
    if (previewDiv) {
      previewDiv.innerHTML = html() || "";
    }
  });

  if (!params.pattern) {
    return <div>Lista ou Padrão não encontrado</div>;
  }

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
          {getListComponent(params.pattern)?.title}
        </div>
        <ImageCaroulsel
          class="max-w-2xl"
          images={getListComponent(params.pattern)?.images || []}
        />
        <div
          class="prose w-full h-full mt-[30px] wrap-break-word"
          ref={previewDiv}
        ></div>
      </div>

      <div class="w-[calc(33%+3rem)] h-full bg-gray-200 rounded-md py-8 px-4 flex flex-col items-center justify-start overflow-y-auto">
        <Switch>
          <Match when={editTitle()}>
            <TextField class="w-3/4">
              <TextFieldInput
                onBlur={() => setEditTitle(false)}
                value={title() || getListComponent(params.pattern)?.title}
                class="w-full"
                type="text"
                id="text"
                onInput={(e) => {
                  setTitle(e.currentTarget.value);
                }}
                placeholder="categorias separadas por virgula."
              />
            </TextField>
          </Match>
          <Match when={!editTitle()}>
            <div onMouseDown={() => setEditTitle(true)}>
              {getListComponent(params.pattern)?.title}
            </div>
          </Match>
        </Switch>
        <ImageCaroulsel
          class="max-w-lg"
          images={getListComponent(params.pattern)?.images || []}
        />
        <UploadButton
          onClientUploadComplete={(res) => {
            // Do something with the response
            console.log("Files: ", res);
            alert("Upload Completed");
          }}
          onUploadError={(error: Error) => {
            // Do something with the error.
            alert(`ERROR! ${error.message}`);
          }}
          content={{
            button({ ready, isUploading }) {
              if (!ready()) return "Preparando...";
              if (isUploading()) return "Enviando...";
              return "Escolher arquivo"; // The default text whens ready
            },
          }}
          class="my-6 ut-button:px-3 ut-button:py-1 ut-button:bg-gray-300 ut-button:ut-readying:bg-gray-300/50"
          endpoint="imageUploader"
        />
        <TextField class="grid grid-cols-4 w-full max-w-lg items-center gap-1.5 mb-6">
          <TextFieldLabel class="col-span-1" for="email">
            Categorias
          </TextFieldLabel>
          <TextFieldInput
            class="col-span-3"
            type="email"
            id="email"
            placeholder="categorias separadas por virgula."
          />
        </TextField>
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
            {getListComponent(params.pattern)?.markdown}
          </textarea>
        </div>
      </div>
    </main>
  );
}
