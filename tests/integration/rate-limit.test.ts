import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./setup";
import { rateLimit } from "@/lib/rate-limit";

let env: Awaited<ReturnType<typeof freshDb>>;
beforeAll(async () => { env = await freshDb(); }, 120_000);
afterAll(async () => env?.dispose());

describe("rate limiter (D1)", () => {
  it("allows up to the limit, then blocks, per key", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await rateLimit("k1", 3, 60, env.d1));
    expect(results).toEqual([true, true, true, false, false]);
    expect(await rateLimit("k2", 3, 60, env.d1)).toBe(true);
  });
  it("is atomic under concurrency", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit("k3", 10, 60, env.d1)));
    expect(results.filter(Boolean)).toHaveLength(10);
  });
});
