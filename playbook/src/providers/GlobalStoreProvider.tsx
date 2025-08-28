import { JSX } from "solid-js";
import {
  createApplicationStore,
  GlobalStoreContext,
} from "../stores/storeContext";

export const GlobalStoreProvider = (props: { children: JSX.Element }) => {
  const store = createApplicationStore();
  return (
    <GlobalStoreContext.Provider value={store}>
      {props.children}
    </GlobalStoreContext.Provider>
  );
};
