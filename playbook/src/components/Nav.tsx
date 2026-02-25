import { useLocation } from "@solidjs/router";
import { ModeToggle } from "./ModeToggle";

export default function Nav() {
  const location = useLocation();
  const active = (path: string) =>
    path == location.pathname
      ? "border-gray-600"
      : "border-transparent hover:border-gray-600";
  return (
    <nav class="flex border-b border-gray-200">
      <ul class="container flex items-center p-3 text-gray-700">
        <li class={`border-b-2 ${active("/")} mx-1.5 sm:mx-6`}>
          <a href="/">Home</a>
        </li>
        <li class={`border-b-2 ${active("/lists")} mx-1.5 sm:mx-6`}>
          <a href="/lists">Lists</a>
        </li>
      </ul>
      {/* <ModeToggle /> */}
    </nav>
  );
}
