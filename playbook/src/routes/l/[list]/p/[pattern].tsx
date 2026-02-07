import {
  createEffect,
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

export default function Home() {
  const [markdown, setMarkdown] = createSignal("");
  const [view, setView] = createSignal("preview");

  const params = useParams();

  const getListComponent = () => {
    return checklist
      .find((item) => item.id === params.list)
      ?.components.find((component) => component.id === params.pattern);
  };

  const [html] = createResource(
    () => getListComponent()?.markdown,
    parseMarkdown,
  );
  let previewDiv: HTMLDivElement | undefined;

  createEffect(() => {
    if (previewDiv) {
      previewDiv.innerHTML = html() || "";
    }
  });

  return (
    <main class="flex w-full h-[calc(100vh-50px)] text-gray-800 p-1.5 gap-1">
      <div class="w-2/3 h-full py-8 px-4 flex flex-col items-center justify-center relative">
        <Button
          as="a"
          href={"/lists"}
          variant="outline"
          size="icon"
          class="absolute top-4 left-4"
          onMouseDown={() => setView("checklist")}
        >
          <ArrowLeft />
        </Button>
        <div class="font-bold text-lg text-gray-700 mb-4">
          {getListComponent()?.title}
        </div>
        <div class="prose w-full h-full wrap-break-word" ref={previewDiv}></div>
      </div>

      <div class="w-1/3 h-full bg-gray-200 rounded-md py-8 px-4 flex flex-col items-center justify-center">
        <div class="font-bold text-lg text-gray-700 mb-4">
          {getListComponent()?.title}
        </div>
        <textarea
          placeholder="Escreva seu texto aqui..."
          id="markdown"
          class="prose w-full h-full outline-none resize-none bg-transparent"
          value={getListComponent()?.markdown}
          onInput={(e) => {
            console.log(e.currentTarget.value);
            setChecklist(
              (_item) => _item.id === params.list,
              "components",
              (component) => component.id === params.pattern,
              "markdown",
              e.currentTarget.value,
            );
          }}
        />
      </div>
    </main>
  );
}
