import { useGlobalStore } from "~/stores/storeContext";
import { TextEditor } from "./TextEditor/TextEditor";
import { Separator } from "./ui/separator";
import { useParams } from "@solidjs/router";

const Document = (props: any) => {
  const [_, actions] = useGlobalStore();

  return (
    <div class="min-h-screen">
      <div class="w-[700px] mx-auto px-4 py-8">
        <div class="text-3xl font-bold text-gray-800">
          {actions.getActiveDocument()?.title}
        </div>
        <Separator class="my-4" />
        <TextEditor />
      </div>
    </div>
  );
};

export default Document;
