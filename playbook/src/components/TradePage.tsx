import { Component } from "solid-js";
import { TradeLane } from "~/components/TradeLane";
import {
  tradeStore,
  addLane,
  deleteLane,
  updateLaneContent,
  setLaneFocus,
  updateLaneTitle,
} from "../stores/tradeStore";
import { TextEditor } from "./TextEditor/TextEditor";

export const TradePage: Component = () => {
  return (
    <div class="flex h-[calc(100vh-200px)] bg-white rounded-lg shadow-sm border">
      {/* Left Sidebar - Lane Navigation */}
      <div class="w-64 bg-gray-50 border-r border-gray-200 p-4">
        <div class="mb-4">
          <h2 class="text-lg font-semibold text-gray-900 mb-3">
            Trading Lanes
          </h2>
          <button
            onClick={addLane}
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            + Add Lane
          </button>
        </div>

        <div class="space-y-2">
          {tradeStore.map((lane) => (
            <div
              class={`p-3 rounded-md cursor-pointer transition-colors ${
                lane.isFocused
                  ? "bg-green-100 border border-green-300"
                  : "bg-white hover:bg-gray-100 border border-gray-200"
              }`}
              onClick={() => setLaneFocus(lane.id, true)}
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-900 truncate">
                  {lane.title}
                </span>
                {tradeStore.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteLane(lane.id);
                    }}
                    class="text-red-500 hover:text-red-700 text-xs"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div class="flex-1 p-6 overflow-x-auto">
        <div class="flex space-x-6 h-full">
          {tradeStore.map((lane) => (
            <TextEditor
              initialBlocks={lane}
              onContentChange={handleContentChange}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
