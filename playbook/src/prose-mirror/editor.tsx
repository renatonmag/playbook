import { EditorView } from "prosemirror-view";
import { EditorState } from "prosemirror-state";
import { undo, redo, history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { Schema } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import {
  addListNodes,
  splitListItem,
  sinkListItem,
} from "prosemirror-schema-list";
import { inputRules, wrappingInputRule } from "prosemirror-inputrules";

// import schema from "./schema";
import menu from "./menu";
import doc from "./doc";
import ImageView from "./image";
import { onMount } from "solid-js";
import { videoPastePlugin } from "./videoPlugin";

export default function Editor() {
  let ref;
  let view;

  onMount(() => {
    const mySchema = new Schema({
      nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
      marks: schema.spec.marks,
    });

    const orderedListRule = wrappingInputRule(
      // regex captures the starting number: e.g. "1. " -> match[1] === "1"
      /^(\d+)\.\s$/,
      mySchema.nodes.ordered_list,
      // optional getAttrs: return {order: parsedNumber} if you want to start there
      (match) => {
        console.log({ match });
        const n = parseInt(match[1], 10);
        return n > 1 ? { order: n } : null; // null -> use default attr
      }
      // make the wrapper create list_item children
      // prosemirror-schema-list's wrappingInputRule uses the node type;
      // ensure list_item exists in schema (it does after addListNodes)
    );

    const unorderedListRule = wrappingInputRule(
      // regex captures the starting number: e.g. "1. " -> match[1] === "1"
      /^(\-)\s$/,
      mySchema.nodes.bullet_list
    );

    const listKeymap = keymap({
      Enter: splitListItem(mySchema.nodes.list_item),
      Tab: sinkListItem(mySchema.nodes.list_item),
    });

    let state = EditorState.create({
      doc: mySchema.node("doc", null, [
        mySchema.node("heading", null, mySchema.text("Chapter 1. Loomings")),
        mySchema.node("paragraph", null, [
          mySchema.text(
            "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people’s hats off—then, I account it high time to get to sea as soon as I can. This is my substitute for pistol and ball. With a philosophical flourish Cato throws himself upon his sword; I quietly take to the ship. There is nothing surprising in this. If they but knew it, almost all men in their degree, some time or other, cherish very nearly the same feelings towards the ocean with me."
          ),
        ]),
      ]),
      schema: mySchema,
      plugins: [
        listKeymap,
        videoPastePlugin,
        history(),
        keymap({ "Mod-z": undo, "Mod-Shift-z": redo }),
        keymap(baseKeymap),
        inputRules({ rules: [orderedListRule, unorderedListRule] }),
        menu,
      ],
    });
    view = new EditorView(ref, {
      state,
      nodeViews: {
        image(node, view, getPos) {
          return new ImageView(node, view, getPos);
        },
      },
    });
  });

  return (
    <div
      class="mx-auto outline-none h-[500px] w-[700px] prose prose-base"
      ref={ref}
    ></div>
  );
}
