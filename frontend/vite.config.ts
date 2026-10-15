import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The portal talks to Solana RPC directly from the browser, so it is a plain
// static bundle. Two browser shims are required by @solana/web3.js:
//   - `global` -> `globalThis`
//   - `buffer` -> the npm `buffer` package, because Vite externalizes the Node
//     builtin of the same name (which silently breaks transaction encoding).
export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      buffer: "buffer/",
    },
  },
  optimizeDeps: {
    include: ["buffer"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
