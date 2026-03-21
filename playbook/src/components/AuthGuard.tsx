import { createResource, createEffect, Show, JSX } from "solid-js";
import { isServer } from "solid-js/web";
import { useLocation, useNavigate } from "@solidjs/router";
import { authClient } from "~/lib/auth-client";

const PROTECTED = ["/lists", "/pattern", "/trade", "/stats"];

function isProtectedPath(pathname: string) {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function AuthGuard(props: { children: JSX.Element }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Skip fetching on the server — authClient has no browser cookie during SSR.
  // Returning undefined as source keeps the resource in "not started" state until
  // the client hydrates, at which point the pathname becomes the source and
  // triggers a fresh fetch with the real cookie.
  const [session] = createResource(
    () => !isServer || undefined,
    () => authClient.getSession(),
  );

  createEffect(() => {
    if (session.loading) return;
    if (!session()?.data && isProtectedPath(location.pathname)) {
      navigate("/auth/login", { replace: true });
    }
  });

  const ready = () =>
    !isProtectedPath(location.pathname) ||
    (!session.loading && !!session()?.data);

  return <Show when={ready()}>{props.children}</Show>;
}
