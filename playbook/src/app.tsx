import { Router, useLocation } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Show, Suspense } from "solid-js";
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
                  <Show
                    when={useLocation().pathname.startsWith("/trade/shared/")}
                    fallback={
                      <>
                        <Nav />
                        <AuthGuard>
                          <Suspense>{props.children}</Suspense>
                        </AuthGuard>
                      </>
                    }
                  >
                    <Suspense>{props.children}</Suspense>
                  </Show>
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
