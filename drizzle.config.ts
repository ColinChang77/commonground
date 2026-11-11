import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into ./drizzle, applied with `wrangler d1 migrations apply`.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
