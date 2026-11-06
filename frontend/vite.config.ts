import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: /^@\/domain\/(.*)$/,
        replacement: fileURLToPath(new URL("./src/domain/$1", import.meta.url)),
      },
      {
        find: /^@\/src\/(.*)$/,
        replacement: fileURLToPath(new URL("./src/$1", import.meta.url)),
      },
      {
        find: /^@\/(.*)$/,
        replacement: fileURLToPath(new URL("./src/$1", import.meta.url)),
      },
    ],
  },
  server: {
    port: 5144,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:5143",
        changeOrigin: true,
      },
    },
  },
});

