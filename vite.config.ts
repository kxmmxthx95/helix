import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: { port: 5555 },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Helix",
        short_name: "Helix",
        description: "ระบบจัดการสถานศึกษา",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        lang: "th",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        // Web push handlers (public/push-sw.js) — see migration 0185.
        importScripts: ["push-sw.js"],
        // Precache only what the POS needs to start offline: the entry, its vendor chunks, styles and fonts.
        // Every other route/tab chunk (three.js, pdfmake, exams, admin tabs...) is cached on first use below,
        // so a low-end tablet never downloads ~8 MB in the background on each deploy.
        globPatterns: [
          "index.html",
          "assets/index-*.{js,css}",
          "assets/vendor-{react,query,supabase,motion}-*.js",
          // POS start path, lazy so students don't download it: login, till and its shared hooks.
          "assets/{PosLogin,CardTopup,useCardTopup}-*.js",
          "fonts/*.woff2",
          "*.{svg,png}",
        ],
        // Cache-as-you-go: Supabase reads served stale-while-revalidate so the
        // app still renders offline. Writes go through the outbox, not here.
        runtimeCaching: [
          {
            // Hashed filenames never change content, so the first fetch is the only one.
            urlPattern: ({ request, url }) => request.destination === "script" && url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: { cacheName: "lazy-chunks", expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            // Product photos: the URL carries ?v=updated_at, so a re-upload is a new cache key.
            // Same photos from Supabase Storage or, once the bucket is flipped, from the files-worker (/o/pos-products/…).
            urlPattern: ({ url }) => /^\/(storage\/v1\/object\/public|o)\/pos-products\//.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "pos-product-images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Identity/role lookups must never be served from a stale cache —
            // otherwise a role change (e.g. promotion to super_admin) can render
            // with the old role until the cache entry expires or is refreshed.
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/profile(s|_roles)(\?|$)/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-rest",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vite's dynamic-import helper must live in a small chunk: left alone it lands in vendor-three,
          // so every lazy route would drag the whole 1 MB three.js bundle into the first load.
          if (id.includes("vite/preload-helper")) return "vendor-react";
          if (id.includes("node_modules/three") || id.includes("node_modules/@react-three")) {
            return "vendor-three";
          }
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules/scheduler")
          ) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@supabase")) {
            return "vendor-supabase";
          }
          if (id.includes("node_modules/@tanstack")) {
            return "vendor-query";
          }
          if (id.includes("node_modules/framer-motion")) {
            return "vendor-motion";
          }
        },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
