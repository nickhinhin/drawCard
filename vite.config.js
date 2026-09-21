import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The legacy web administrator implementation remains in source temporarily for
// migration reference, but is removed before React transforms in every web mode.
// This prevents its Firestore mutation code and UI strings entering public assets.
function stripLegacyWebAdmin() {
  return {
    name: "strip-legacy-web-admin",
    enforce: "pre",
    transform(source, id) {
      if (!id.endsWith("/src/App.jsx")) return null;
      const startMarker = "function AdminPanel({ profile })";
      const endMarker = "function normalizeSlug(value)";
      const start = source.indexOf(startMarker);
      const end = source.indexOf(endMarker);
      if (start < 0 || end < 0 || end <= start) {
        throw new Error("Unable to locate the legacy web admin block.");
      }
      return `${source.slice(0, start)}${source.slice(end)}`;
    },
  };
}

export default defineConfig({
  plugins: [stripLegacyWebAdmin(), react()],
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
