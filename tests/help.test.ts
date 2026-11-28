import { describe, expect, it } from "vitest";
import { HELP_TOPICS, helpPieces } from "@/lib/help";
import { describePaidBy, PAID_BY_NAMES } from "@/lib/models";

describe("the help", () => {
  it("has a topic for each thing that is not plain from looking", () => {
    expect(HELP_TOPICS.map((topic) => topic.id)).toEqual([
      "paid",
      "folder",
      "accounts",
      "colours",
      "page",
      "where",
    ]);
  });

  it("gives every topic a title, a place and something to say", () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.short.trim(), topic.id).not.toBe("");
      expect(topic.title.trim(), topic.id).not.toBe("");
      expect(topic.where.trim(), topic.id).not.toBe("");
      expect(topic.points.length, topic.id).toBeGreaterThan(0);
      // A line is shown under its own words as its key: no two the same.
      expect(new Set(topic.points).size, topic.id).toBe(topic.points.length);
    }
  });

  it("closes every mark it opens", () => {
    for (const topic of HELP_TOPICS) {
      for (const line of [topic.where, ...topic.points]) {
        expect(helpPieces(line).length % 2, line).toBe(1);
      }
    }
  });

  it("splits a line into plain words and the words on the screen", () => {
    expect(helpPieces("Press `choose…` to pick it.")).toEqual([
      "Press ",
      "choose…",
      " to pick it.",
    ]);
    expect(helpPieces("Nothing marked.")).toEqual(["Nothing marked."]);
  });

  it("quotes the labels as the window writes them", () => {
    const said = HELP_TOPICS.flatMap((topic) => [topic.where, ...topic.points]).join("\n");
    const plan = describePaidBy("claudecode", { state: "plan", email: null });
    const api = describePaidBy("claude", null);
    expect(said).toContain(`\`uses ${plan?.label}\``);
    expect(said).toContain(`\`uses ${api?.label}\``);
    expect(said).toContain(`\`${PAID_BY_NAMES.plan}\``);
    expect(said).toContain(`\`${PAID_BY_NAMES.api}\``);
  });
});
