import { describe, expect, it } from "vitest";
import {
  CLAUDE_MODELS,
  CODE_MODELS,
  EFFORT_LEVELS,
  describeRanOn,
  effortFacts,
  effortName,
  modelName,
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
    expect(short).toBe("Fable 5.2 · think: high");
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
    expect(short).toBe("Opus 5.5 (in place of Fable 5.2) · think: auto");
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
});
