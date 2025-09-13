import { createRoot, createSignal } from "solid-js";

import ImageEditor from "./image-editor";

import schema from "./schema";

export default class ImageView {
  constructor(node, view, getPos) {
    // Store for later
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    const [src, setSrc] = createSignal(node.attrs.src);
    this.setSrc = setSrc;

    const [selected, setSelected] = createSignal(false);
    this.setSelected = setSelected;

    this.dom = createRoot(() => (
      <ImageEditor
        image={src()}
        change={(src) => this.change(src)}
        isSelected={selected()}
      />
    ))();

    this.update(node);
  }

  change(src) {
    let start = this.getPos();
    let tr = this.view.state.tr.replaceWith(
      start,
      start + 1,
      schema.node("image", { src })
    );
    this.view.dispatch(tr);
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;

    this.setSrc(node.attrs.src);

    return true;
  }

  selectNode() {
    this.setSelected(true);
  }

  deselectNode() {
    this.setSelected(false);
  }

  stopEvent() {
    return true;
  }

  destroy() {
    this.dom.remove();
  }
}
