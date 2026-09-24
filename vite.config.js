import process from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The admin site has no homepage banner, so it should not preload the banner image.
const dropBannerPreloadOnAdmin = {
  name: "drop-banner-preload-on-admin",
  transformIndexHtml(html) {
    if (process.env.VITE_ADMIN_SITE !== "true") return html;
    return html.replace(/\s*<link\s+rel="preload"\s+as="image"\s+href="\/default-live-banner\.webp"[^>]*\/>/, "");
  },
};

export default defineConfig({
  plugins: [react(), dropBannerPreloadOnAdmin],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("firebase")) return "firebase";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("react")) return "react";
          return "vendor";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
