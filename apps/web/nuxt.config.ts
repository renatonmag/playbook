import tailwindcss from "@tailwindcss/vite";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    // Override in production with NUXT_PUBLIC_API_BASE.
    public: {
      apiBase: 'http://localhost:8000',
    },
  },
  vite: {
    plugins: [
      tailwindcss(),
    ],
  },
})
