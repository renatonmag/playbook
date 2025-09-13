import { clientOnly } from "@solidjs/start";
import Editor from "~/prose-mirror/editor";

const ClientEditor = clientOnly(() => import("~/prose-mirror/editor"));

const Prosem = () => {
  let editorRef;
  return (
    <div>
      <h1>Prosem Editor</h1>
      <Editor ref={editorRef} />
    </div>
  );
};

export default Prosem;
