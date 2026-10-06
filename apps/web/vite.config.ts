import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One shared .env at the repo root (also read by apps/api). Only VITE_* vars reach the browser.
  envDir: "../..",
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Scan every page (including lazy ones) at startup, so Vite pre-bundles all libraries once.
  // Otherwise opening a lazy page first triggers a re-bundle mid-load -> "Failed to fetch dynamically imported module".
  optimizeDeps: { entries: ["index.html", "src/**/*.tsx"] },
  // strictPort: fail loudly instead of moving to 3001, which the API's CORS (WEB_ORIGIN) would reject.
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
});
