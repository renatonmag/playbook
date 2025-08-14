import { Component, JSX } from "solid-js";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "~/components/ui/dropdown-menu";
import {
  IconBold,
  IconItalic,
  IconUnderline,
  IconColor,
} from "~/components/icons";

export interface FormattingToolbarProps {
  onFormatChange: (format: string, value?: any) => void;
  isActive: (format: string) => boolean;
}

const FormattingToolbar: Component<FormattingToolbarProps> = (props) => {
  const handleFormatChange = (value: string) => {
    props.onFormatChange(value);
  };

  const handleColorChange = (color: string) => {
    props.onFormatChange("color", color);
  };

  const colorOptions = [
    { label: "Default", value: "inherit" },
    { label: "Red", value: "#ef4444" },
    { label: "Green", value: "#22c55e" },
    { label: "Blue", value: "#3b82f6" },
    { label: "Yellow", value: "#eab308" },
    { label: "Purple", value: "#a855f7" },
    { label: "Orange", value: "#f97316" },
  ];

  return (
    <div class="flex items-center gap-2 p-2 bg-gray-50 border-b border-gray-200">
      <ToggleGroup
        multiple
        value={[
          props.isActive("bold") ? "bold" : "",
          props.isActive("italic") ? "italic" : "",
          props.isActive("underline") ? "underline" : "",
        ].filter(Boolean)}
        onChange={(values: string[]) => {
          // Handle individual format changes
          if (values.includes("bold")) {
            handleFormatChange("bold");
          }

          if (values.includes("italic")) {
            handleFormatChange("italic");
          }

          if (values.includes("underline")) {
            handleFormatChange("underline");
          }
        }}
      >
        <ToggleGroupItem
          value="bold"
          aria-label="Bold"
          title="Bold (Ctrl+B)"
          class={props.isActive("bold") ? "bg-blue-100 text-blue-700" : ""}
        >
          <IconBold class="size-6" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="italic"
          aria-label="Italic"
          title="Italic (Ctrl+I)"
          class={props.isActive("italic") ? "bg-blue-100 text-blue-700" : ""}
        >
          <IconItalic class="size-6" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="underline"
          aria-label="Underline"
          title="Underline (Ctrl+U)"
          class={props.isActive("underline") ? "bg-blue-100 text-blue-700" : ""}
        >
          <IconUnderline class="size-6" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
};

export default FormattingToolbar;
