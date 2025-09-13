import { Schema } from "prosemirror-model";

const schema = new Schema({
  nodes: {
    doc: { content: "block*" },
    paragraph: {
      content: "text*",
      group: "block",
      toDOM(node) {
        return ["p", 0];
      },
      parseDOM: [{ tag: "p" }],
    },
    video: {
      // We'll define this as a block node.
      group: "block",
      // And as you wisely suggested, it's an atom, meaning its internal
      // structure isn't editable by the user.
      // atom: true,
      selectable: true,
      // These are the attributes that hold the data for our video node.
      attrs: {
        src: { default: null }, // The URL of the video source.
        alt: { default: null }, // An optional alt text for accessibility.
        title: { default: null }, // An optional title for the video.
      },
      // This is where we tell ProseMirror how to convert our node into
      // a DOM element.
      toDOM: (node) => {
        const attrs = {
          src: node.attrs.src,
          title: node.attrs.title,
          // We'll add some default controls and preload behavior.
          controls: true,
          preload: "metadata",
        };
        return ["video", attrs];
      },
      // This is where we tell ProseMirror how to convert a DOM element
      // back into our node.
      parseDOM: [
        {
          tag: "video[src]",
          getAttrs: (dom) => {
            return {
              src: dom.getAttribute("src"),
              alt: dom.getAttribute("alt"),
              title: dom.getAttribute("title"),
            };
          },
        },
      ],
    },
    image: {
      atom: true,
      draggable: true,
      selectable: true,
      group: "block",
      toDOM(node) {
        return ["img", { src: node.attrs.src }];
      },
      parseDOM: [
        {
          tag: "img",
          getAttrs: (dom) => {
            let src = dom.getAttribute("src");
            return { src };
          },
        },
      ],
      attrs: {
        src: {
          default:
            "https://cdn.pixabay.com/photo/2015/04/23/22/00/tree-736885__480.jpg",
        },
      },
    },
    text: {},
  },
  marks: {
    strong: {
      toDOM() {
        return ["strong", 0];
      },
      parseDOM: [
        { tag: "strong" },
        { tag: "b" },
        { style: "font-weight=bold" },
      ],
    },
    em: {
      toDOM() {
        return ["em", 0];
      },
      parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
    },
  },
});

export default schema;
