import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The agent tests exercise the real Qloo client (through its cache), so
    // they need room to breathe and must not run concurrently against quota.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
