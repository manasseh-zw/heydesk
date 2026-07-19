import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(desktopRoot, "../web");

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(desktopRoot, "out/main"),
      rollupOptions: {
        input: resolve(desktopRoot, "src/main.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(desktopRoot, "out/preload"),
      rollupOptions: {
        input: resolve(desktopRoot, "src/preload.ts"),
        output: {
          entryFileNames: "preload.cjs",
          format: "cjs",
        },
      },
    },
  },
  renderer: {
    root: webRoot,
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      tailwindcss(),
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
    ],
    build: {
      outDir: resolve(desktopRoot, "out/renderer"),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(webRoot, "index.html"),
      },
    },
  },
});
