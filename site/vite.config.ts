import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const desktop = resolve(__dirname, "../apps/desktop");

// Relative base so the built site works from any folder or static host.
// The hero embeds the desktop app's real windows (app/*.html), built from
// apps/desktop/ui with the app's own dependencies.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: { "@tauri-apps/api": resolve(desktop, "node_modules/@tauri-apps/api") },
  },
  server: { fs: { allow: [resolve(__dirname, "..")] } },
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        badge: resolve(__dirname, "app/badge.html"),
        lookalike: resolve(__dirname, "app/lookalike.html"),
      },
    },
  },
});
