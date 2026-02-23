import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import Nav from "~/components/Nav";
import "./app.css";
import { createApplicationStore, StoreContext } from "./store/storeContext";
import { isServer } from "solid-js/web";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/solid-query";

const queryClient = new QueryClient();

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
                  <Suspense>{props.children}</Suspense>
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
