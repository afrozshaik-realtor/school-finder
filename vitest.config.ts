import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Default to "node": several lib modules import the "server-only"
    // package, which throws if `window` is defined -- true in jsdom.
    // Component tests opt into jsdom per-file with a
    // `// @vitest-environment jsdom` comment at the top of the file.
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    setupFiles: ["./tests/unit/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next.js resolves "server-only" to its harmless empty.js via a
      // bundler-level "react-server" export condition when bundling
      // actual server code, and only to its throwing index.js when
      // something tries to bundle it for the client (the whole point of
      // the package). Vitest has no such condition, so it always hits
      // the throwing branch -- alias straight to the empty shim so
      // server-only modules (src/lib/rateLimit.ts, src/lib/env.ts's
      // server half, etc.) can be unit-tested directly.
      "server-only": path.resolve(__dirname, "./node_modules/server-only/empty.js"),
    },
  },
});
