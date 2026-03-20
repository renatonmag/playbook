import { createMiddleware } from "@solidjs/start/middleware";

export default createMiddleware({
  onRequest: [
    (event) => {
      const { pathname } = new URL(event.request.url);
      const isProtected = ["/lists", "/pattern", "/trade"].some(
        (p) => pathname === p || pathname.startsWith(p + "/"),
      );
      if (!isProtected) return;

      const cookie = event.request.headers.get("cookie") ?? "";
      const hasSession = cookie.includes("better-auth.session_token=");
      if (!hasSession) {
        return new Response(null, {
          status: 302,
          headers: { Location: "/auth/login" },
        });
      }
    },
  ],
});
