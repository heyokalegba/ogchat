import { describe, expect, it } from "vitest";
import {
  ACCOUNT_COLORS,
  accountRefOf,
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
