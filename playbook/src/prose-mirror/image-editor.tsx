import { createSignal, Show } from "solid-js";

function Image(props) {
  return (
    <div>
      <Show when={props.src} fallback={"No Image"}>
        <div class="image">
          <img src={props.src} alt="test" />
        </div>
      </Show>
    </div>
  );
}
function Input(props) {
  const [editing, setEditing] = createSignal(false);
  const toggleEditing = () => setEditing(!editing());

  let inputRef;

  const myChange = () => {
    if (editing()) {
      props.change(inputRef.value);
    }

    toggleEditing();
  };

  return (
    <div class="imageMenuBar">
      <button onClick={myChange}>{editing() ? "Close" : "Edit"}</button>
      <Show when={editing()} fallback={""}>
        <input ref={inputRef} value={props.value} />
      </Show>
    </div>
  );
}

export default function ImageEditor(props) {
  return (
    <div classList={{ imageNodeView: true, selected: props.isSelected }}>
      <Input value={props.image} change={props.change} />
      <Image src={props.image} />
    </div>
  );
}
