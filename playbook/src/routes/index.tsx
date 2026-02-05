
import { createEffect, createMemo, createResource, createSignal } from "solid-js";
import remarkParse from "remark-parse";
import rehypeStringify from "rehype-stringify";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

export default function Home() {
  const [markdown, setMarkdown] = createSignal("");
  const parseMarkdown = async (content: string) => {
    const file = await unified()
      .use(remarkParse)          // Parse markdown to mdast
      .use(remarkRehype)         // Transform mdast to hast
      .use(rehypeStringify)      // Transform hast to HTML string
      .process(content);
    
    return String(file);
  };
  const [html] = createResource(() => markdown(), parseMarkdown);
  let previewDiv: HTMLDivElement | undefined;
  
  createEffect(() => {
    if (previewDiv && html()) {
      previewDiv.innerHTML = html() || "";
    }
  });
  
  return (
    <main class="flex w-full h-[calc(100vh-50px)] text-gray-700 p-1.5 gap-1">
      <div class="w-1/2 h-full wrap-break-word">
        <div ref={previewDiv}></div>
      </div>
      <div class="w-1/2 h-full bg-gray-100 rounded-md py-8 px-4 flex flex-col items-center justify-center">
        <div class="font-bold text-lg mb-4">Markdown</div>
        <textarea
        placeholder="Escreva seu texto aqui..."
          id="markdown"
          class="w-full h-full outline-none resize-none bg-gray-100"
          value={markdown()}
          onInput={(e) => {
            setMarkdown(e.currentTarget.value);
          }}
          />
        </div>
    </main>
  );
}
