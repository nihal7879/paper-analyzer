import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const API_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:4100";
const API_PROXY = {
  "/api": { target: API_TARGET, changeOrigin: true },
  "/files": { target: API_TARGET, changeOrigin: true },
};

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
  // Everything goes through port 3000: the browser calls /api and /files on this same address, and Vite
  // passes them on to the API on 4100. So only port 3000 needs forwarding (tunnels, phones on Wi-Fi, …).
  // allowedHosts: accept forwarded / tunnel host names, not just localhost.
  // strictPort: fail loudly instead of moving to 3001.
  server: { port: 3000, strictPort: true, host: true, allowedHosts: true, proxy: API_PROXY },
  preview: { port: 3000, strictPort: true, host: true, allowedHosts: true, proxy: API_PROXY },
});
