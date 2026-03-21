import type { APIEvent } from "@solidjs/start/server";
import { RPCHandler } from "@orpc/server/fetch";
import { router } from "~/routers";
import { onError } from "@orpc/server";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { auth } from "~/lib/auth";

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
  plugins: [new BatchHandlerPlugin()],
});

async function handle({ request }: APIEvent) {
  console.log("RPC request:", request.url);
  const session = await auth.api.getSession({ headers: request.headers });

  console.log("RPC session:", session?.user?.id ?? "none");

  const context = {
    user: session
      ? {
          id: session.user.id,
          userName: session.user.name,
          email: session.user.email,
        }
      : undefined,
  };

  const { response } = await handler.handle(request, {
    prefix: "/rpc",
    context,
  });

  return response ?? new Response("Not Found", { status: 404 });
}

export const HEAD = handle;
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
