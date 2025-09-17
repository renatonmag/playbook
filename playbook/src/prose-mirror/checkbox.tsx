import { createRoot, createSignal, Index } from "solid-js";
import { render } from "solid-js/web";
import { Card, CardContent } from "~/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "~/components/ui/carousel";
import { Checkbox } from "~/components/ui/checkbox";
import { useGlobalStore } from "~/stores/storeContext";
import { Slider, SliderProvider, SliderButton } from "solid-slider";
import { Combobox } from "@kobalte/core/combobox";
import "./combostyle.css";

const CarouselComponent = () => {
  return (
    <Slider>
      <div>Slide 1</div>
      <div>Slide 2</div>
      <div>Slide 3</div>
    </Slider>
  );
};

// const ALL_OPTIONS = [
//   {
//     label: "Fruits",
//     options: [
//       { value: "apple", label: "Apple", disabled: false },
//       { value: "banana", label: "Banana", disabled: false },
//       { value: "blueberry", label: "Blueberry", disabled: false },
//       { value: "grapes", label: "Grapes", disabled: true },
//       { value: "pineapple", label: "Pineapple", disabled: false },
//     ],
//   },
//   {
//     label: "Meat",
//     options: [
//       { value: "beef", label: "Beef", disabled: false },
//       { value: "chicken", label: "Chicken", disabled: false },
//       { value: "lamb", label: "Lamb", disabled: false },
//       { value: "pork", label: "Pork", disabled: false },
//     ],
//   },
// ];
const ALL_OPTIONS = ["Apple", "Banana", "Blueberry", "Grapes", "Pineapple"];
/**
 * CheckboxView - A ProseMirror NodeView for rendering interactive checkboxes
 */
export default class CheckboxView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = null;
    this.contentDOM = null;

    // Create DOM structure
    this.createDOM();
  }

  createDOM() {
    // Add event listener for changes
    const [checked, setChecked] = createSignal(this.node.attrs.checked);
    this.setChecked = setChecked;
    // Create the main container
    this.dom = document.createElement("div");
    this.dom.contentEditable = "false";
    // this.dom.className = "checkbox-node flex items-center gap-2";

    // Create content DOM for text content
    this.contentDOM = document.createElement("span");
    this.contentDOM.className = "relative";

    // Create checkbox container
    const checkboxContainer = document.createElement("div");
    checkboxContainer.className = "checkbox-wrapper";

    // Append container to main DOM
    // this.dom.appendChild(checkboxContainer);
    // Handle checkbox changes - this is the key fix!
    const handleChange = (newChecked) => {
      console.log("Checkbox changed:", newChecked); // Debug log

      // Update local signal
      //   setChecked(newChecked);

      // Update the ProseMirror document
      const pos = this.getPos();
      if (pos !== undefined) {
        const tr = this.view.state.tr.setNodeAttribute(
          pos,
          "checked",
          newChecked
        );
        this.view.dispatch(tr);
      }
    };

    this.dispose = render(
      () => (
        <div class="relative w-xl p-50">
          <Combobox
            options={ALL_OPTIONS}
            placeholder="Search a fruit…"
            itemComponent={(props) => (
              <Combobox.Item item={props.item} class="combobox__item">
                <Combobox.ItemLabel>{props.item.rawValue}</Combobox.ItemLabel>
                <Combobox.ItemIndicator class="combobox__item-indicator">
                  C
                </Combobox.ItemIndicator>
              </Combobox.Item>
            )}
          >
            <Combobox.Control class="combobox__control" aria-label="Fruit">
              <Combobox.Input class="combobox__input" />
              <Combobox.Trigger class="combobox__trigger">
                <Combobox.Icon class="combobox__icon">S</Combobox.Icon>
              </Combobox.Trigger>
            </Combobox.Control>
            <Combobox.Portal>
              <Combobox.Content class="combobox__content">
                <Combobox.Listbox class="combobox__listbox" />
              </Combobox.Content>
            </Combobox.Portal>
          </Combobox>
        </div>
      ),
      this.dom
    );
    console.log(this.dom);
    // Append elements to container
    // this.dom.appendChild(this.cleanUp);
    // this.dom.appendChild(this.contentDOM);

    // Make the checkbox container non-editable but keep content editable
    // checkboxContainer.contentEditable = "false";
  }

  toggleChecked() {
    this.setChecked((prev) => !prev);
  }

  /**
   * Update method called when the node's attributes change externally
   */
  update(node) {
    console.log({ node });
    if (node.type !== this.node.type) return false;

    this.node = node;
    // this.toggleChecked();

    return true;
  }

  /**
   * Clean up event listeners when the view is destroyed
   */
  destroy() {
    this.dom.remove();
    // this.cleanUp();
  }
}
