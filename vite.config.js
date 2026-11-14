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

const IS_ADMIN_BUILD = process.env.VITE_ADMIN_SITE === "true";

// The revamped site is previewed at /beta (beta/index.html) before it replaces the
// main site. Serve its index for every /beta/... route in dev and preview, like the
// Hosting rewrite does in production.
const betaRouteFallback = {
  name: "beta-route-fallback",
  configureServer(server) {
    server.middlewares.use(rewriteBetaRoute);
  },
  configurePreviewServer(server) {
    server.middlewares.use(rewriteBetaRoute);
  },
};
function rewriteBetaRoute(req, _res, next) {
  const [pathname, query = ""] = (req.url || "").split("?");
  if ((pathname === "/beta" || pathname.startsWith("/beta/")) && !/\.[a-z0-9]+$/i.test(pathname)) {
    req.url = "/beta/index.html" + (query ? "?" + query : "");
  }
  next();
}

export default defineConfig({
  // Stamp each build so incident reports distinguish an old open tab from a new release.
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.VITE_APP_VERSION || new Date().toISOString()) },
  plugins: [react(), dropBannerPreloadOnAdmin, betaRouteFallback],
  build: {
    rollupOptions: {
      // The admin site never ships the /beta preview.
      input: IS_ADMIN_BUILD
        ? { main: "index.html" }
        : { main: "index.html", beta: "beta/index.html" },
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
