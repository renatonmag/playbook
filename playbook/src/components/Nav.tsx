import { useLocation, useNavigate, createAsync, revalidate, A } from "@solidjs/router";
import { Show } from "solid-js";
import { authClient } from "~/lib/auth-client";
import { getUser } from "~/lib/session";

export default function Nav() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = createAsync(() => getUser());

  const active = (path: string) =>
    path == location.pathname
      ? "border-gray-600"
      : "border-transparent hover:border-gray-600";

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: async () => {
          await revalidate("user");
          navigate("/auth/login");
        },
      },
    });
  };

  return (
    <nav class="flex border-b border-gray-200">
      <ul class="container flex items-center p-3 text-gray-700">
        <li class={`border-b-2 ${active("/")} mx-1.5 sm:mx-6`}>
          <A href="/">Home</A>
        </li>
        <Show when={user()}>
          <li class={`border-b-2 ${active("/lists")} mx-1.5 sm:mx-6`}>
            <A href="/lists">Lists</A>
          </li>
          <li class="ml-auto mx-1.5 sm:mx-6">
            <button
              onClick={handleLogout}
              class="text-gray-700 hover:text-gray-900"
            >
              Logout
            </button>
          </li>
        </Show>
        <Show when={!user()}>
          <li class={`border-b-2 ${active("/auth/login")} mx-1.5 sm:mx-6`}>
            <A href="/auth/login">Login</A>
          </li>
          <li class={`border-b-2 ${active("/auth/signup")} mx-1.5 sm:mx-6`}>
            <A href="/auth/signup">Sign Up</A>
          </li>
        </Show>
      </ul>
    </nav>
  );
}
