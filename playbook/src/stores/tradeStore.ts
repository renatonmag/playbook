import { createStore } from "solid-js/store";

export interface TradingLane {
  id: string;
  title: string;
  content: string;
  isFocused: boolean;
}

export const [tradeStore, setTradeStore] = createStore<TradingLane[]>([
  { id: "1", title: "Trading Lane 1", content: "", isFocused: false },
  { id: "2", title: "Trading Lane 2", content: "", isFocused: false },
  { id: "3", title: "Trading Lane 3", content: "", isFocused: false },
]);

export const addLane = () => {
  const newId = (tradeStore.length + 1).toString();
  setTradeStore([
    ...tradeStore,
    {
      id: newId,
      title: `Trading Lane ${newId}`,
      content: "",
      isFocused: false,
    },
  ]);
};

export const deleteLane = (id: string) => {
  if (tradeStore.length > 1) {
    setTradeStore(tradeStore.filter((lane) => lane.id !== id));
  }
};

export const updateLaneContent = (id: string, content: string) => {
  setTradeStore(
    tradeStore.map((lane) => (lane.id === id ? { ...lane, content } : lane))
  );
};

export const setLaneFocus = (id: string, isFocused: boolean) => {
  setTradeStore(
    tradeStore.map((lane) => (lane.id === id ? { ...lane, isFocused } : lane))
  );
};

export const updateLaneTitle = (id: string, title: string) => {
  setTradeStore(
    tradeStore.map((lane) => (lane.id === id ? { ...lane, title } : lane))
  );
};
