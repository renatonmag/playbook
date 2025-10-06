export type Patch = {
  kind:
    | "addBlock"
    | "removeBlock"
    | "updateBlock"
    | "setBlockTypeToText"
    | "addImagesToBlock"
    | "removeImageFromBlock"
    | "sinkBlock"
    | "liftBlock";
  indexSequence?: number[];
  content?: string;
  blockRef?: HTMLDivElement;
  undo?: string;
};

export function createHistory() {
  let past: Array<Patch> = [];
  let future: Array<Patch> = [];

  return {
    future: {
      clear() {
        future.length = 0;
      },
      pop() {
        return future.pop();
      },
      peek() {
        return future[future.length - 1];
      },
      push(patch: Patch) {
        future.push(patch);
      },
    },
    past: {
      pop() {
        const patch = past.pop();
        if (patch) {
          future.push(patch);
        }
        return patch;
      },
      peek() {
        return past[past.length - 1];
      },
      push(patch: Patch) {
        past.push(patch);
      },
    },
  };
}
