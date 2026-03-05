import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import Nav from "~/components/Nav";
import AuthGuard from "~/components/AuthGuard";
import "./app.css";
import { createApplicationStore, StoreContext } from "./store/storeContext";
import { isServer } from "solid-js/web";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/solid-query";

import {
  ColorModeProvider,
  ColorModeScript,
  cookieStorageManagerSSR,
} from "@kobalte/core";
import { getCookie } from "vinxi/http";

function getServerCookies() {
  "use server";
  const colorMode = getCookie("kb-color-mode");
  return colorMode ? `kb-color-mode=${colorMode}` : "";
}

export default function App() {
  const queryClient = new QueryClient();
  const storageManager = cookieStorageManagerSSR(
    isServer ? getServerCookies() : document.cookie,
  );
  return (
    <Router
      root={(props) => {
        return (
          <>
            <QueryClientProvider client={queryClient}>
              <ColorModeScript storageType={storageManager.type} />
              <ColorModeProvider storageManager={storageManager}>
                <StoreContext>
                  <Nav />
                  <AuthGuard>
                    <Suspense>{props.children}</Suspense>
                  </AuthGuard>
                </StoreContext>
              </ColorModeProvider>
            </QueryClientProvider>
          </>
        );
      }}
    >
      <FileRoutes />
    </Router>
  );
}
