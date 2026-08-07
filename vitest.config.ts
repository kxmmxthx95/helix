import path from "node:path";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose: vitest 2.x pins its own vite copy,
// so sharing one config file makes the two Plugin types collide under tsc.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
