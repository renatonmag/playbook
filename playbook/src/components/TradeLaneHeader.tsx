import { Component, createSignal } from "solid-js";
import { TradingLane } from "../stores/tradeStore";

interface TradeLaneHeaderProps {
  lane: TradingLane;
  onTitleUpdate: (title: string) => void;
  onDelete: () => void;
}

export const TradeLaneHeader: Component<TradeLaneHeaderProps> = (props) => {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editTitle, setEditTitle] = createSignal(props.lane.title);

  const handleTitleEdit = () => {
    setIsEditing(true);
    setEditTitle(props.lane.title);
  };

  const handleTitleSave = () => {
    if (editTitle().trim()) {
      props.onTitleUpdate(editTitle().trim());
    }
    setIsEditing(false);
  };

  const handleTitleCancel = () => {
    setEditTitle(props.lane.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTitleSave();
    } else if (e.key === "Escape") {
      handleTitleCancel();
    }
  };

  return (
    <div class="flex items-center justify-between p-4 border-b border-gray-200">
      <div class="flex-1 min-w-0">
        {isEditing() ? (
          <input
            type="text"
            value={editTitle()}
            onInput={(e) => setEditTitle(e.currentTarget.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleKeyDown}
            class="w-full text-lg font-semibold text-gray-900 bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
            autoFocus
          />
        ) : (
          <h3
            class="text-lg font-semibold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
            onClick={handleTitleEdit}
            title="Click to edit title"
          >
            {props.lane.title}
          </h3>
        )}
      </div>

      <button
        onClick={props.onDelete}
        class="ml-3 text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-full transition-colors"
        title="Delete lane"
      >
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  );
};
