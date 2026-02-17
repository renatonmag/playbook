import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import Nav from "~/components/Nav";
import "./app.css";
import { createApplicationStore, StoreContext } from "./store/storeContext";

export default function App() {
  return (
    <Router
      root={(props) => {
        const store = createApplicationStore(); // now inside Router context

        return (
          <StoreContext.Provider value={store}>
            <Nav />
            <Suspense>{props.children}</Suspense>
          </StoreContext.Provider>
        );
      }}
    >
      <FileRoutes />
    </Router>
  );
}
