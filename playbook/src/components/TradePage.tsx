import { Component, onMount } from "solid-js";
import {
  tradeStore,
  addLane,
  deleteLane,
  updateLaneContent,
  setLaneFocus,
  updateLaneTitle,
} from "../stores/tradeStore";
import { TextEditor } from "./TextEditor/TextEditor";
import { Button } from "./ui/button";
import {
  createOverlayScrollbars,
  OverlayScrollbarsComponent,
} from "overlayscrollbars-solid";
import { createStore } from "solid-js/store";
import "./trade-page.css";

export const TradePage: Component = () => {
  return (
    <div class="flex h-[calc(100vh-200px)] bg-white rounded-lg shadow-sm border">
      <div class="flex-1 max-w-[calc(100vw-50px)] p-6 overflow-x-auto">
        <OverlayScrollbarsComponent
          options={{
            scrollbars: { autoHide: "scroll" },
          }}
          defer
        >
          {tradeStore.map((lane) => (
            <TextEditor onContentChange={() => {}} laneID={lane.id} />
          ))}
        </OverlayScrollbarsComponent>
      </div>
    </div>
  );
};
