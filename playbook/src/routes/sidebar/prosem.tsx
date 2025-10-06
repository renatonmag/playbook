import {
  getCaretPositionFromSelection,
  getSelectionOffsets,
} from "~/lib/caret";

let last = null;

const Prosem = () => {
  let inputRef;

  return (
    <div>
      <h1>Prosem Editor</h1>
      <div
        contentEditable
        ref={inputRef}
        onKeyUp={(e) => {
          // if (last !== e.key) {
          //   console.log(pos);
          // }else if (last !== e.key && pos.column === 0) {
          //   console.log(pos);
          // }
          const pos = getCaretPositionFromSelection(inputRef!);
          console.log(inputRef);
          last = e.key;
        }}
        onMouseUp={(e) => {
          // if (last !== e.key) {
          //   console.log(pos);
          // }else if (last !== e.key && pos.column === 0) {
          //   console.log(pos);
          // }
          const pos = getCaretPositionFromSelection(inputRef!);
          console.log(inputRef);
        }}
      />
    </div>
  );
};

export default Prosem;
