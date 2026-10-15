import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.BACKEND_URL || "http://localhost:8091";
  return {
    plugins: [react(), tailwindcss()],

    server: {
      proxy: {
        "/api": {
          target: backend,
          ws: true,
          changeOrigin: false,
        },
        "/healthz": {
          target: backend,
          changeOrigin: false,
        },
      },
    },

    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            epub: ["epubjs"],
          },
        },
      },
    },
  };
});
