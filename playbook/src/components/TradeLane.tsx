import { Component } from "solid-js";
import { TradingLane } from "../stores/tradeStore";
import { TradeLaneHeader } from "./TradeLaneHeader";

interface TradeLaneProps {
  lane: TradingLane;
  onContentUpdate: (content: string) => void;
  onFocusChange: (isFocused: boolean) => void;
  onTitleUpdate: (title: string) => void;
  onDelete: () => void;
}

export const TradeLane: Component<TradeLaneProps> = (props) => {
  const handleFocus = () => {
    props.onFocusChange(true);
  };

  const handleBlur = () => {
    props.onFocusChange(false);
  };

  return (
    <div
      class={`w-80 bg-white rounded-lg border-2 transition-colors ${
        props.lane.isFocused
          ? "border-green-300 shadow-md"
          : "border-gray-200 hover:border-gray-300"
      }`}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <TradeLaneHeader
        lane={props.lane}
        onTitleUpdate={props.onTitleUpdate}
        onDelete={props.onDelete}
      />

      <div class="p-4">
        <div class="h-32 bg-gray-50 rounded border p-3">
          <textarea
            class="w-full h-full bg-transparent border-none outline-none resize-none text-sm text-gray-700"
            placeholder="Enter your trading strategy or notes here..."
            value={props.lane.content}
            onInput={(e) => props.onContentUpdate(e.currentTarget.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>
      </div>
    </div>
  );
};
