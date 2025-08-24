import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import "@fontsource/inter";
import "./app.css";
import "overlayscrollbars/styles/overlayscrollbars.css";
import {
  createApplicationStore,
  GlobalStoreContext,
} from "./stores/storeContext";

export default function App() {
  const store = createApplicationStore();
  return (
    <GlobalStoreContext.Provider value={store}>
      <Router
        root={(props) => (
          <MetaProvider>
            <Title>Playbook</Title>
            <Suspense>{props.children}</Suspense>
          </MetaProvider>
        )}
      >
        <FileRoutes />
      </Router>
    </GlobalStoreContext.Provider>
  );
}
