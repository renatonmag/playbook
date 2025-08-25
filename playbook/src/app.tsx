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
import { setupConvex, ConvexProvider } from "convex-solidjs";
import { ConvexContext } from "../cvxsolid";
import { ConvexClient } from "convex/browser";

const convex = new ConvexClient(import.meta.env.VITE_CONVEX_URL!);

export default function App() {
  const store = createApplicationStore();
  return (
    <ConvexContext.Provider value={convex}>
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
    </ConvexContext.Provider>
  );
}
