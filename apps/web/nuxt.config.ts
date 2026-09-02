import tailwindcss from "@tailwindcss/vite";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['shadcn-nuxt'],
  shadcn: {
    /**
     * Prefix for all the imported component.
     * @default "Ui"
     */
    prefix: '',
    /**
     * Directory that the component lives in.
     * Will respect the Nuxt aliases.
     * @link https://nuxt.com/docs/api/nuxt-config#alias
     * @default "@/components/ui"
     */
    componentDir: '@/components/ui'
  },
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    // Override in production with NUXT_PUBLIC_API_BASE.
    public: {
      apiBase: 'http://localhost:8000',
    },
  },
  nitro: {
    // `docs/forma/rules.json` is the saved Forma rules, read by `/api/rules` for the bench at
    // `/rules`. Mounted from the repo root rather than copied into the app so the rules stay a
    // domain artefact in `docs/`, versioned next to the ADRs. See issue #11.
    // `dir` resolves against Nitro's srcDir, which Nuxt sets to `<rootDir>/server` — hence three
    // levels up from `apps/web/server`, not two.
    serverAssets: [{ baseName: 'forma', dir: '../../../docs/forma' }],
  },
  vite: {
    plugins: [
      tailwindcss(),
    ],
  },
})
