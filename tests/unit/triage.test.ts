import { describe, expect, it } from "vitest";
import { demoTriage } from "@/lib/suggestions";
import { canConfirmSuggestion, canDecideSuggestion, earnsPoints } from "@/lib/permissions";

describe("demo triage quality gate", () => {
  it("turns a specific UI complaint into an actionable change", () => {
    const t = demoTriage("The button is too small on my phone, I keep missing it.");
    expect(t.quality).toBe("actionable");
    expect(t.risk).toBe("small");
  });
  it("holds back vague comments and asks for specifics", () => {
    for (const c of ["this looks bad lol", "ugly", "make it better", "meh, not good"]) {
      const t = demoTriage(c);
      expect(t.quality, c).toBe("vague");
      expect(t.reply).toBeTruthy();
    }
  });
  it("drops spam and abuse without replying", () => {
    expect(demoTriage("Buy now! promo code CHEAP at https://a.example and https://b.example").quality).toBe("spam");
    expect(demoTriage("you are an idiot").quality).toBe("abusive");
    expect(demoTriage("you are an idiot").reply).toBeNull();
  });
  it("sends big-scope requests to the builder instead of running agents", () => {
    expect(demoTriage("You should redesign the whole app and add login with a new menu").quality).toBe("needs_builder");
  });
  it("does not treat praise or questions as change requests", () => {
    expect(demoTriage("Love this, great work!").quality).toBe("not_a_change");
    expect(demoTriage("Which framework did you use?").quality).toBe("not_a_change");
  });
});

describe("showcase permissions", () => {
  it("only the commenter confirms, only the builder decides, no self-awarded points", () => {
    expect(canConfirmSuggestion("u1", "u1")).toBe(true);
    expect(canConfirmSuggestion("u2", "u1")).toBe(false);
    expect(canConfirmSuggestion(null, "u1")).toBe(false);
    expect(canDecideSuggestion("b", "b")).toBe(true);
    expect(canDecideSuggestion("u1", "b")).toBe(false);
    expect(earnsPoints("b", "b")).toBe(false);
    expect(earnsPoints("u1", "b")).toBe(true);
  });
});
