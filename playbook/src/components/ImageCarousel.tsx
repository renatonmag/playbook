import { Index, Show } from "solid-js";

import { Card, CardContent } from "~/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "~/components/ui/carousel";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import SquareMinus from "lucide-solid/icons/square-minus";
import { deleteFiles } from "~/server/functions";

export function ImageCaroulsel(props: { images: any[]; class?: string }) {
  return (
    <Carousel class={cn("w-full", props.class)}>
      <CarouselContent>
        <Index each={props.images}>
          {(image, index) => (
            <CarouselItem>
              <Card>
                <CardContent class="flex aspect-square items-center justify-center p-2 relative">
                  <Show when={props.onDelete}>
                    <Button
                      class="absolute top-4 right-4"
                      variant="destructive"
                      size="icon"
                      onClick={async () => {
                        const res = await deleteFiles([image().key]);
                        if (res) {
                          props.onDelete(image().key);
                        }
                      }}
                    >
                      <SquareMinus class="text-white" />
                    </Button>
                  </Show>
                  <img src={image().uri} class="w-full h-full object-contain" />
                </CardContent>
              </Card>
            </CarouselItem>
          )}
        </Index>
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
