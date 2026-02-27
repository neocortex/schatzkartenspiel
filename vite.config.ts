import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "ES2020",
    outDir: "dist",
    assetsDir: "assets",
  },
  server: {
    port: 3000,
    open: true,
  },
});
