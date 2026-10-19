import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite root is this folder (`vite demo`). The workspace packages are TS sources
// resolved through node_modules symlinks; dedupe keeps a single three / react copy.
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["three", "react", "react-dom", "@react-three/fiber"] },
  server: { port: 5174 },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
