import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base, testDir: "tests/capture", timeout: 900_000, use: { ...base.use, trace: "off" } });
