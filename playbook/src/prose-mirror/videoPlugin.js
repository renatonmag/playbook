import { Plugin } from "prosemirror-state";

// We'll define a variable for our plugin
export const videoPastePlugin = new Plugin({
  props: {
    handlePaste(view, event, slice) {
      // 1. Get the pasted text from the slice
      const text = slice.content.textBetween(0, slice.content.size);

      // 2. Check if the text is a video URL
      if (
        text.endsWith(".mp4") ||
        text.endsWith(".mov") ||
        text.endsWith(".webm")
      ) {
        // 3. Get the cursor position where the paste happened
        const { from } = view.state.selection;
        const to = from + text.length;

        // 4. Create the new video node using our schema
        // The node type 'video' must be defined in your schema
        const videoNode = view.state.schema.nodes.video.create({
          src: text,
        });

        // 5. Create a new transaction to replace the text with the video node
        const tr = view.state.tr.replaceWith(from, to, videoNode);

        // 6. Dispatch the transaction to apply the change to the editor
        view.dispatch(tr);

        // 7. Tell ProseMirror that we handled the paste, so it doesn't do its default action
        return true;
      }
      // If the text is not a video URL, return false so ProseMirror handles it normally
      return false;
    },
  },
});
