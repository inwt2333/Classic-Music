import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import react from "@vitejs/plugin-react";
import { reviewApiPlugin } from "./scripts/review-api";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [
    react(),
    reviewApiPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "app-icon-180.png"],
      manifest: {
        name: "古典音乐演出日历",
        short_name: "古典音乐日历",
        description: "全国主要城市古典音乐演出与作品指南",
        lang: "zh-CN",
        display: "standalone",
        start_url: ".",
        background_color: "#f7faf9",
        theme_color: "#2f695d",
        icons: [
          { src: "app-icon-180.png", sizes: "180x180", type: "image/png", purpose: "any" },
          { src: "favicon.png", sizes: "64x64", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["index.html", "assets/*", "app-icon-180.png", "favicon.png"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: new RegExp("data/(events-index|entities|stats|redirects)\\.json"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "core-data-json" },
          },
          {
            urlPattern: new RegExp("data/knowledge/.*\\.json"),
            handler: "CacheFirst",
            options: {
              cacheName: "knowledge-json",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
});
