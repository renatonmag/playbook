import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import "@fontsource/inter";
import "./app.css";
import "overlayscrollbars/styles/overlayscrollbars.css";

import { ConvexContext } from "./cvxsolid";
import { ConvexClient } from "convex/browser";
import { GlobalStoreProvider } from "./providers/GlobalStoreProvider";

const convex = new ConvexClient(import.meta.env.VITE_CONVEX_URL!);

export default function App() {
  return (
    <ConvexContext.Provider value={convex}>
      <GlobalStoreProvider>
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
      </GlobalStoreProvider>
    </ConvexContext.Provider>
  );
}
