import { resolve } from "node:path";
import { defineConfig } from "vite";

// The UI is four static pages, bundled locally. No CDN, no remote fonts.
export default defineConfig({
  root: "ui",
  clearScreen: false,
  // The repository root too: the app shows the changelog kept there.
  server: { port: 1420, strictPort: true, fs: { allow: [resolve(__dirname, "../..")] } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "ui/index.html"),
        badge: resolve(__dirname, "ui/badge.html"),
        lookalike: resolve(__dirname, "ui/lookalike.html"),
        details: resolve(__dirname, "ui/details.html"),
      },
    },
  },
});
