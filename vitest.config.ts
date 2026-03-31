import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "tests/e2e/**/*.test.ts"],
    environment: "node"
  }
});
