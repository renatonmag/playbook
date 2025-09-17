import { ContentEditable } from "@bigmistqke/solid-contenteditable";
import { createSignal, For, Show } from "solid-js";
import {
  Combobox,
  ComboboxItem,
  ComboboxItemLabel,
  ComboboxItemIndicator,
  ComboboxSection,
  ComboboxControl,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxContent,
} from "~/components/ui/combobox";

export default function HashTagHighlighter() {
  const [text, setText] = createSignal("this is a #hashtag");
  return (
    <ContentEditable
      textContent={text()}
      onTextContent={setText}
      singleline
      render={(textContent) => (
        <For each={textContent().split(" ")}>
          {(word, wordIndex) => (
            <>
              <Show when={word.startsWith("#")} fallback={word}>
                <button onClick={() => console.log("clicked!")}>{word}</button>
              </Show>
              <Show when={word === "combo"}>
                <div contentEditable={false} class="inline-block">
                  sss
                  <Combobox<Food, Category>
                    options={ALL_OPTIONS}
                    optionValue="value"
                    optionTextValue="label"
                    optionLabel="label"
                    optionDisabled="disabled"
                    optionGroupChildren="options"
                    placeholder="Search a food…"
                    itemComponent={(props) => (
                      <ComboboxItem item={props.item}>
                        <ComboboxItemLabel>
                          {props.item.rawValue.label}
                        </ComboboxItemLabel>
                        <ComboboxItemIndicator />
                      </ComboboxItem>
                    )}
                    sectionComponent={(props) => (
                      <ComboboxSection>
                        {props.section.rawValue.label}
                      </ComboboxSection>
                    )}
                  >
                    <ComboboxControl aria-label="Food">
                      <ComboboxInput />
                      <ComboboxTrigger />
                    </ComboboxControl>
                    <ComboboxContent />
                  </Combobox>
                </div>
              </Show>
              <Show
                when={textContent().split(" ").length - 1 !== wordIndex()}
                children=" "
              />
            </>
          )}
        </For>
      )}
    />
  );
}

interface Food {
  value: string;
  label: string;
  disabled: boolean;
}
interface Category {
  label: string;
  options: Food[];
}
const ALL_OPTIONS: Category[] = [
  {
    label: "Fruits",
    options: [
      { value: "apple", label: "Apple", disabled: false },
      { value: "banana", label: "Banana", disabled: false },
      { value: "blueberry", label: "Blueberry", disabled: false },
      { value: "grapes", label: "Grapes", disabled: true },
      { value: "pineapple", label: "Pineapple", disabled: false },
    ],
  },
  {
    label: "Meat",
    options: [
      { value: "beef", label: "Beef", disabled: false },
      { value: "chicken", label: "Chicken", disabled: false },
      { value: "lamb", label: "Lamb", disabled: false },
      { value: "pork", label: "Pork", disabled: false },
    ],
  },
];
