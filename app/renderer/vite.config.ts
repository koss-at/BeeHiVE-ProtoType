import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  root: __dirname,
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // ★ パッケージ版(file://)で壊れないように本番だけ相対パスにする
  base: command === "build" ? "./" : "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
