import { defineConfig } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    preset: "vercel",
    esbuild: {
      options: {
        target: "node22",
      },
    },
  },
  middleware: "./src/middleware.ts",
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      external: ["postgres", "drizzle-orm"],
    },
  }
});
