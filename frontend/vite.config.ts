import { fileURLToPath } from "node:url";

import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";

// The portal consumes the published client contract directly from
// `../clients/ts` (one encoding, no copy). That directory is outside the Vite
// root, so it must be both aliased and explicitly allowed by the dev server.
const clientsDir = fileURLToPath(new URL("../clients/ts", import.meta.url));
const sharedDir = fileURLToPath(new URL("../shared/src", import.meta.url));

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
      "@rental-client": clientsDir,
      "@shared": sharedDir,
      buffer: "buffer/",
    },
    // The portal and the shared client are in different directories, so without
    // dedupe the bundle can pull two copies of web3.js (breaking
    // `instanceof PublicKey` at runtime).
    dedupe: ["@solana/web3.js"],
  },
  optimizeDeps: {
    include: ["buffer"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), fileURLToPath(new URL("..", import.meta.url))],
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
