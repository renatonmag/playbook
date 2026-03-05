import { Show } from "solid-js";
import { ImageCaroulsel } from "~/components/ImageCarousel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { UploadButton } from "~/lib/uploadthing";

type Props = {
  open: boolean;
  onClose: () => void;
  selectedSheetId: () => [number, number] | undefined;
  setups: { items: any[] };
  addSetupImage: (
    cardIdx: number,
    subIdx: number,
    img: { uri: string; key: string },
  ) => void;
  removeSetupImage: (cardIdx: number, subIdx: number, key: string) => void;
};

export function ImageDialog(props: Props) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent class="min-w-3xl px-20">
        <DialogHeader>
          <DialogTitle>Gerenciar imagens</DialogTitle>
        </DialogHeader>
        <Show when={props.selectedSheetId() !== undefined}>
          <Show
            when={
              ((
                props.setups.items[props.selectedSheetId()![0]]?.setups[
                  props.selectedSheetId()![1]
                ] as any
              )?.images?.length ?? 0) > 0
            }
          >
            <ImageCaroulsel
              images={
                (
                  props.setups.items[props.selectedSheetId()![0]]?.setups[
                    props.selectedSheetId()![1]
                  ] as any
                )?.images ?? []
              }
              onDelete={(key) =>
                props.removeSetupImage(
                  props.selectedSheetId()![0],
                  props.selectedSheetId()![1],
                  key,
                )
              }
            />
          </Show>
          <UploadButton
            endpoint="imageUploader"
            class="ut-button:inline-flex ut-button:items-center ut-button:justify-center ut-button:rounded-md ut-button:text-sm ut-button:font-medium ut-button:h-10 ut-button:px-4 ut-button:py-2 ut-button:bg-primary ut-button:text-primary-foreground ut-button:transition-colors ut-button:hover:bg-primary/90 ut-button:ut-readying:bg-primary/70 ut-button:ut-uploading:bg-primary/70 ut-allowed-content:hidden"
            onClientUploadComplete={(res) => {
              const [cardIdx, subIdx] = props.selectedSheetId()!;
              for (const r of res) {
                props.addSetupImage(cardIdx, subIdx, {
                  uri: r.ufsUrl,
                  key: r.key,
                });
              }
            }}
            content={{
              button({ ready, isUploading }) {
                if (!ready()) return "Preparando...";
                if (isUploading()) return "Enviando...";
                return "Escolher imagem";
              },
            }}
            onUploadError={(error: Error) => alert(`ERROR! ${error.message}`)}
          />
        </Show>
      </DialogContent>
    </Dialog>
  );
}
