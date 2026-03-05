import { cache } from "@solidjs/router";
import { getRequestEvent } from "solid-js/web";
import { auth } from "~/lib/auth";

export const getUser = cache(async () => {
  "use server";
  const event = getRequestEvent();
  if (!event) return null;
  const session = await auth.api.getSession({
    headers: event.request.headers,
  });
  return session?.user ?? null;
}, "user");
