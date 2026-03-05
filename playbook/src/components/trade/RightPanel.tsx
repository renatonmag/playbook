import { Show } from "solid-js";
import { ImageCaroulsel } from "~/components/ImageCarousel";

type Props = {
  component: () => any;
  showItem: () => string;
  html: () => string | undefined;
};

export function RightPanel(props: Props) {
  return (
    <div class="w-1/3">
      <Show when={props.showItem() === props.component()?.id}>
        <div class="pt-4 flex flex-col h-full relative justify-start items-center">
          <div class="text-lg font-bold text-gray-700 mb-4 sticky top-0">
            {props.component()?.title}
          </div>
          <div class="flex flex-col h-full w-full justify-start items-center overflow-y-auto">
            <ImageCaroulsel
              class="max-w-lg"
              images={props.component()?.exemples || []}
            />
            <div
              class="prose w-full h-full mx-auto wrap-break-word mt-4"
              innerHTML={props.html() || "Sem descrição..."}
            ></div>
          </div>
        </div>
      </Show>
    </div>
  );
}
