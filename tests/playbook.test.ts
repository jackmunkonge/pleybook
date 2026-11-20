import { describe, expect, it } from "vitest";
import { ruleInput, slugifyKey, withStatus, type PlaybookRule } from "@/lib/playbook/rules";

const rule = (o: Partial<PlaybookRule> = {}): PlaybookRule => ({
  key: "cap",
  name: "Liability cap",
  category: "liability",
  text: "Cap liability.",
  preferred: "12 months",
  fallback: "6 months",
  variants: ["a", "b"],
  ...o,
});

describe("slugifyKey", () => {
  it("makes a url-safe slug", () => expect(slugifyKey("Limitation of Liability: Cap!", [])).toBe("limitation-of-liability-cap"));
  it("suffixes when taken", () => expect(slugifyKey("Cap", ["cap", "cap-2"])).toBe("cap-3"));
  it("falls back for empty names", () => expect(slugifyKey("???", [])).toBe("rule"));
});

describe("withStatus", () => {
  it("marks unchanged, edited and added rules", () => {
    const defaults = [rule(), rule({ key: "ip" })];
    const mine = [rule(), rule({ key: "ip", text: "Changed" }), rule({ key: "new" })];
    expect(withStatus(mine, defaults).map((r) => r.status)).toEqual(["default", "edited", "added"]);
  });
  it("treats changed variants as an edit", () => {
    expect(withStatus([rule({ variants: ["a"] })], [rule()])[0].status).toBe("edited");
  });
});

describe("ruleInput", () => {
  it("requires a name and rule text", () => {
    expect(ruleInput.safeParse({ name: " ", text: "x" }).success).toBe(false);
    expect(ruleInput.safeParse({ name: "x", text: "" }).success).toBe(false);
  });
  it("trims and defaults optional fields", () => {
    expect(ruleInput.parse({ name: " A ", text: " B " })).toEqual({ name: "A", text: "B", category: "", preferred: "", fallback: "", variants: [] });
  });
  it("caps the number of phrasings", () => {
    expect(ruleInput.safeParse({ name: "a", text: "b", variants: Array(11).fill("x") }).success).toBe(false);
  });
});
