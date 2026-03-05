import { createRouterClient } from "@orpc/server";
import { getRequestEvent } from "solid-js/web";
import { router } from "~/routers";
import { auth } from "~/lib/auth";

if (typeof window !== "undefined") {
  throw new Error("This file should not be imported in the browser");
}

/**
 * This is part of the Optimize SSR setup.
 *
 * @see {@link https://orpc.dev/docs/adapters/solid-start#optimize-ssr}
 */
globalThis.$client = createRouterClient(router, {
  /**
   * Provide initial context if needed.
   *
   * Because this client instance is shared across all requests,
   * only include context that's safe to reuse globally.
   * For per-request context, use middleware context or pass a function as the initial context.
   */
  context: async () => {
    const headers = getRequestEvent()?.request.headers;
    const session = headers
      ? await auth.api.getSession({ headers })
      : null;

    return {
      headers,
      user: session
        ? { id: session.user.id, userName: session.user.name, email: session.user.email }
        : undefined,
    };
  },
});
