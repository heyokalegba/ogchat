import { describe, expect, it } from "vitest";
import {
  ACCOUNT_COLORS,
  accountRefOf,
  accountTags,
  colorHex,
  findAccount,
  isAccountColor,
  nextAccountColor,
} from "@/lib/accounts";
import type { ClaudeAccount, RanOn } from "@/lib/types";

const account = (id: string, name: string, color: string): ClaudeAccount => ({
  id,
  name,
  color,
  tag: name.slice(0, 1).toUpperCase(),
  configDir: "",
  key: { set: false, masked: null, source: null },
  workspace: "",
});
const ACCOUNTS = [account("main", "personal", "blue"), account("a-work", "Work", "green")];
const ran = (over: Partial<RanOn> = {}) =>
  ({ provider: "claudecode", model: "claude-fable-5-2", ...over }) as RanOn;

describe("the colours of Claude accounts", () => {
  it("are a few, each with a name, and no two alike", () => {
    expect(ACCOUNT_COLORS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ACCOUNT_COLORS.map((one) => one.hex)).size).toBe(ACCOUNT_COLORS.length);
    for (const one of ACCOUNT_COLORS) expect(one.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(isAccountColor("green")).toBe(true);
    expect(isAccountColor("#3fc380")).toBe(false);
    expect(isAccountColor(null)).toBe(false);
    expect(colorHex("green")).toBe(ACCOUNT_COLORS[1].hex);
    // Anything else is drawn in the first colour, never in something made up.
    expect(colorHex("url(x)")).toBe(ACCOUNT_COLORS[0].hex);
  });

  it("are handed out so that no two accounts share one until they run out", () => {
    expect(nextAccountColor([])).toBe("blue");
    expect(nextAccountColor(["blue", undefined, "violet"])).toBe("green");
    const all = ACCOUNT_COLORS.map((one) => one.id);
    expect(isAccountColor(nextAccountColor(all))).toBe(true);
  });
});

describe("the letters of Claude accounts", () => {
  it("are the first of each name, so the accounts are told apart without colour", () => {
    expect(accountTags(["personal", "work"])).toEqual(["P", "W"]);
    expect(accountTags(["main", "satanicdaoist", "Console"])).toEqual(["M", "S", "C"]);
    // What comes before the first letter or digit is passed over.
    expect(accountTags(["  (work)", "2nd key", "émile"])).toEqual(["W", "2", "É"]);
  });

  it("number the ones that start alike, in the order they are listed", () => {
    expect(accountTags(["work", "personal", "Work two", "west"])).toEqual(["W1", "P", "W2", "W3"]);
    const tags = accountTags(["a", "A", "b", "", "…"]);
    expect(tags).toEqual(["A1", "A2", "B", "?1", "?2"]);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("which account a reply ran on", () => {
  it("is found by its id, or for an older reply by its name", () => {
    expect(findAccount(ACCOUNTS, accountRefOf(ran({ accountId: "a-work" })))?.id).toBe("a-work");
    // The id wins: the account has since been given another name.
    expect(
      findAccount(ACCOUNTS, accountRefOf(ran({ accountId: "a-work", account: "old name" })))?.id,
    ).toBe("a-work");
    expect(findAccount(ACCOUNTS, accountRefOf(ran({ account: "work" })))?.id).toBe("a-work");
  });

  it("is the main one for a reply from Claude that names none, and nobody's for any other model", () => {
    expect(accountRefOf(ran())).toEqual({});
    expect(findAccount(ACCOUNTS, accountRefOf(ran()))?.id).toBe("main");
    expect(accountRefOf(ran({ provider: "compatible", account: "work" }))).toBeNull();
    expect(accountRefOf(null)).toBeNull();
    expect(findAccount(ACCOUNTS, null)).toBeNull();
  });

  it("is no account at all once that account is off the list", () => {
    expect(findAccount(ACCOUNTS, { id: "a-gone", name: "Work" })).toBeNull();
    expect(findAccount(ACCOUNTS, { name: "gone" })).toBeNull();
  });
});
