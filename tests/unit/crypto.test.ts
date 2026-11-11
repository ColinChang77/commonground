import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hmacSha256Hex, sha256Hex, timingSafeEqual, b64encode } from "@/lib/crypto";

const key = b64encode(crypto.getRandomValues(new Uint8Array(32)));

describe("credential encryption", () => {
  it("round-trips and never contains the plaintext", async () => {
    const ct = await encryptSecret("sk-ant-secret-value", key, "user-1");
    expect(ct).not.toContain("sk-ant");
    expect(await decryptSecret(ct, key, "user-1")).toBe("sk-ant-secret-value");
  });
  it("is bound to its owner (AAD) — swapping rows between users fails", async () => {
    const ct = await encryptSecret("secret", key, "user-1");
    await expect(decryptSecret(ct, key, "user-2")).rejects.toThrow();
  });
  it("fails with the wrong key and on tampering", async () => {
    const ct = await encryptSecret("secret", key, "u");
    const other = b64encode(crypto.getRandomValues(new Uint8Array(32)));
    await expect(decryptSecret(ct, other, "u")).rejects.toThrow();
    const [v, iv, body] = ct.split(".");
    const flipped = body.slice(0, -2) + (body.at(-2) === "A" ? "B" : "A") + body.at(-1);
    await expect(decryptSecret(`${v}.${iv}.${flipped}`, key, "u")).rejects.toThrow();
  });
  it("uses a fresh IV each time", async () => {
    expect(await encryptSecret("x", key, "u")).not.toBe(await encryptSecret("x", key, "u"));
  });
  it("rejects short keys", async () => {
    await expect(encryptSecret("x", b64encode(new Uint8Array(16)), "u")).rejects.toThrow(/32 bytes/);
  });
});

describe("hashing", () => {
  it("sha256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("hmac matches GitHub's documented example", async () => {
    // https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries#testing-the-webhook-payload-validation
    expect(await hmacSha256Hex("It's a Secret to Everybody", "Hello, World!")).toBe(
      "757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
    );
  });
  it("timing-safe equality", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
