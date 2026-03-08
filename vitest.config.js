import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["mcp/__tests__/**/*.test.js"],
    testTimeout: 15000,
  },
});
