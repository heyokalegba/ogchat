import { describe, expect, it } from "vitest";
import {
  CLAUDE_MODELS,
  CODE_MODELS,
  EFFORT_LEVELS,
  describePaidBy,
  describeRanOn,
  effortFacts,
  effortName,
  modelName,
  paidByOf,
} from "@/lib/models";

describe("model names", () => {
  it("offers Fable 5.2 and 5.1, through the API and pinned in Claude Code", () => {
    expect(CLAUDE_MODELS.map((m) => m.id)).toEqual(
      expect.arrayContaining(["claude-fable-5-2", "claude-fable-5-1"]),
    );
    expect(CODE_MODELS.map((m) => m.id)).toEqual(
      expect.arrayContaining(["claude-fable-5-2", "claude-fable-5-1", "fable", "default"]),
    );
  });

  it("names ids it knows, and ones it does not", () => {
    expect(modelName("claude-fable-5-2")).toBe("Claude Fable 5.2");
    expect(modelName("claude-opus-5-5-20261101")).toBe("Claude Opus 5.5");
    expect(modelName("claude-opus-5-5[1m]")).toBe("Claude Opus 5.5 (1M context)");
    expect(modelName("claude-mythos-5")).toBe("Claude Mythos 5");
    expect(modelName("abliterated-model-large-v2")).toBe("abliterated-model-large-v2");
  });

  it("names thinking levels as Claude's apps do, with Extra for xhigh", () => {
    expect(EFFORT_LEVELS.map((level) => level.name)).toEqual([
      "Auto",
      "Low",
      "Medium",
      "High",
      "Extra",
      "Max",
    ]);
    expect(EFFORT_LEVELS.find((level) => level.id === "max")?.warning).toMatch(/sparingly/);
    expect(effortName(null)).toBe("auto");
    expect(effortName("default")).toBe("auto");
    expect(effortName("xhigh")).toBe("extra");
    expect(effortName("max")).toBe("max");
  });

  it("knows each model's default and recommended level", () => {
    expect(effortFacts("claude", "claude-fable-5-2")).toEqual({
      default: "high",
      recommended: "high",
    });
    expect(effortFacts("claude", "claude-opus-5-5")).toEqual({
      default: "medium",
      recommended: "medium",
    });
    expect(effortFacts("claudecode", "fable")?.recommended).toBe("high");
    expect(effortFacts("claude", "claude-unknown-9")).toBeNull();
    expect(effortFacts("compatible", "claude-opus-5-5")).toBeNull();
  });
});

describe("what a reply says it was written by", () => {
  it("through the API", () => {
    const { short, full } = describeRanOn({
      provider: "claude",
      requested: "claude-fable-5-2",
      model: "claude-fable-5-2",
      effort: "high",
    });
    // The API is always paid for in API tokens, and a reply says so.
    expect(short).toBe("Fable 5.2 · API tokens · think: high");
    expect(full).toContain("Paid for in: API tokens, on the Claude API key.");
    expect(full).toContain("Model: Claude Fable 5.2 (claude-fable-5-2).");
    expect(full).toContain('Thinking: high (sent as effort "high").');
  });

  it("when the API handed the request to another model", () => {
    const { short, full } = describeRanOn({
      provider: "claude",
      requested: "claude-fable-5-2",
      model: "claude-opus-5-5",
      effort: null,
    });
    expect(short).toBe("Opus 5.5 (in place of Fable 5.2) · API tokens · think: auto");
    expect(full).toContain("handed the request on");
    expect(full).toContain("Thinking: auto (no level sent; Opus 5.5 defaults to medium).");
  });

  it("through Claude Code, before and after an alias is resolved", () => {
    const before = describeRanOn({
      provider: "claudecode",
      requested: "fable",
      model: "fable",
      effort: "xhigh",
    });
    expect(before.short).toBe("Claude Code · fable (its newest) · think: extra");
    const after = describeRanOn({
      provider: "claudecode",
      requested: "fable",
      model: "claude-fable-5-1",
      effort: "xhigh",
    });
    expect(after.short).toBe("Claude Code · Fable 5.1 · think: extra");
    expect(after.full).toContain('Chosen by Claude Code from "fable".');
    const pinned = describeRanOn({
      provider: "claudecode",
      requested: "claude-fable-5-2",
      model: "claude-fable-5-2",
      effort: null,
    });
    expect(pinned.short).toBe("Claude Code · Fable 5.2 · think: auto");
    expect(pinned.full).not.toContain("Chosen by");
  });

  it("names the account, where there is more than one", () => {
    const one = { provider: "claudecode", requested: "opus", model: "claude-opus-5-5" } as const;
    const { short, full } = describeRanOn({ ...one, effort: "high", account: "work" });
    expect(short).toBe("Claude Code · Opus 5.5 · think: high · account: work");
    expect(full).toContain("Through: Claude Code.\nAccount: work.");
    const single = describeRanOn({ ...one, effort: "high" });
    expect(single.short).not.toContain("account");
    expect(single.full).not.toContain("Account");
  });

  it("says what it was paid for with: a plan's usage, or API tokens", () => {
    const one = { provider: "claudecode", requested: "opus", model: "claude-opus-5-5" } as const;
    const plan = describeRanOn({ ...one, effort: "high", account: "work", paidBy: "plan" });
    expect(plan.short).toBe("Claude Code · Opus 5.5 · plan usage · think: high · account: work");
    expect(plan.full).toContain("Paid for by: your Claude plan.");
    expect(plan.full).toContain("no API tokens are spent");
    const tokens = describeRanOn({ ...one, effort: "high", paidBy: "api" });
    expect(tokens.short).toBe("Claude Code · Opus 5.5 · API tokens · think: high");
    expect(tokens.full).toContain("signed in to the Anthropic Console, not a plan");
    // A reply written before this was recorded, or on a provider that is neither, says nothing.
    expect(describeRanOn({ ...one, effort: "high" }).short).not.toMatch(/plan|tokens/i);
    const other = describeRanOn({
      provider: "compatible",
      requested: "some-model",
      model: "some-model",
      effort: null,
    });
    expect(`${other.short}\n${other.full}`).not.toMatch(/plan|tokens/i);
  });
});

describe("what a chat is paid for with", () => {
  const plan = { state: "plan", email: "someone@example.com" } as const;
  const console_ = { state: "api", email: null } as const;

  it("is API tokens on the Claude API, whatever Claude Code is signed in to", () => {
    expect(paidByOf("claude", null)).toBe("api");
    expect(paidByOf("claude", plan)).toBe("api");
    expect(describePaidBy("claude", plan)).toMatchObject({ kind: "api", label: "api tokens" });
    expect(describePaidBy("claude", plan)?.full).toContain("plan's usage limits are not touched");
  });

  it("is the plan's usage on Claude Code signed in to a plan, and API tokens on the Console", () => {
    expect(paidByOf("claudecode", plan)).toBe("plan");
    expect(describePaidBy("claudecode", plan)).toMatchObject({ kind: "plan", label: "your plan" });
    expect(describePaidBy("claudecode", plan)?.full).toContain("signed in as someone@example.com");
    expect(describePaidBy("claudecode", plan)?.full).toContain("No API tokens are spent.");
    expect(paidByOf("claudecode", console_)).toBe("api");
    expect(describePaidBy("claudecode", console_)).toMatchObject({
      kind: "api",
      label: "api tokens",
    });
  });

  it("says so when Claude Code is signed out, and nothing when it cannot tell", () => {
    const out = { state: "out", email: null } as const;
    expect(paidByOf("claudecode", out)).toBeNull();
    expect(describePaidBy("claudecode", out)).toMatchObject({
      kind: "out",
      label: "not signed in",
    });
    expect(paidByOf("claudecode", null)).toBeNull();
    expect(describePaidBy("claudecode", null)).toBeNull();
    expect(describePaidBy("claudecode", { state: "unknown", email: null })).toBeNull();
  });

  it("is neither on another provider", () => {
    expect(paidByOf("compatible", plan)).toBeNull();
    expect(describePaidBy("compatible", plan)).toBeNull();
  });
});
