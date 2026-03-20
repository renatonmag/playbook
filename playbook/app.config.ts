import { defineConfig } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    preset: "vercel",
  },
  middleware: "./src/middleware.ts",
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      external: ["postgres", "drizzle-orm"],
    },
  }
});
