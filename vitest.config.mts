import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "tests/unit/server-only-stub.ts") } },
  test: { include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"], testTimeout: 30000, hookTimeout: 120000, fileParallelism: false, environment: "node" },
});
