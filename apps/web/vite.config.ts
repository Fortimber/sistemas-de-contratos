import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    // Docker Desktop no Windows não propaga eventos de inotify de forma
    // confiável através do bind mount — sem polling, edições no host não
    // disparam HMR (achado real: precisou reiniciar o container pra ver
    // um arquivo novo).
    watch: {
      usePolling: true,
    },
  },
});
