import { createEffect, Show } from "solid-js";
import { ImageCaroulsel } from "~/components/ImageCarousel";
import { Button } from "~/components/ui/button";
import ArrowLeft from "lucide-solid/icons/arrow-left";

type PatternPreviewProps = {
  title: string;
  images: { uri: string; key: string }[];
  html: string;
};

export function PatternPreview(props: PatternPreviewProps) {
  let previewDiv: HTMLDivElement | undefined;

  createEffect(() => {
    if (previewDiv) previewDiv.innerHTML = props.html;
  });

  return (
    <>
      <Button
        as="a"
        href="/lists"
        variant="outline"
        size="icon"
        class="absolute top-4 left-4"
      >
        <ArrowLeft />
      </Button>
      <div class="font-bold text-xl text-gray-700 mb-4">{props.title}</div>
      <Show when={props.images.length > 0}>
        <ImageCaroulsel class="max-w-2xl" images={props.images} />
      </Show>
      <div class="prose w-full h-full mt-7 wrap-break-word" ref={previewDiv} />
    </>
  );
}
