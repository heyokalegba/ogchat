import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, cleanLook, lookVariables, pageFor } from "@/components/shell/look";

describe("the page a chat is shown on", () => {
  it("is formal for a chat on Claude, and the scene or the plain page for any other", () => {
    expect(DEFAULT_LOOK.claudePage).toBe("formal");
    expect(pageFor(DEFAULT_LOOK, true)).toBe("formal");
    expect(pageFor(DEFAULT_LOOK, false)).toBe("scene");
    expect(pageFor({ ...DEFAULT_LOOK, plain: true }, true)).toBe("formal");
    expect(pageFor({ ...DEFAULT_LOOK, plain: true }, false)).toBe("plain");
  });

  it("is like the rest when the look panel says so", () => {
    const same = { ...DEFAULT_LOOK, claudePage: "same" as const };
    expect(pageFor(same, true)).toBe("scene");
    expect(pageFor({ ...same, plain: true }, true)).toBe("plain");
  });

  it("reads the choice back from what was saved, and takes anything else as formal", () => {
    expect(cleanLook({ claudePage: "same" }).claudePage).toBe("same");
    expect(cleanLook({ claudePage: "formal" }).claudePage).toBe("formal");
    expect(cleanLook({ claudePage: 7 }).claudePage).toBe("formal");
    expect(cleanLook({}).claudePage).toBe("formal");
    expect(cleanLook(null).claudePage).toBe("formal");
  });

  it("writes white on black on the formal page, whatever the look panel had painted", () => {
    const painted = { ...DEFAULT_LOOK, textSize: 120, sidebarWidth: 300 };
    const formal = lookVariables(painted, "formal") as Record<string, string | number>;
    expect(formal).toMatchObject({
      "--og-wall-text": "#f4f4f5",
      "--og-input-bg": "#0c0c0e",
      "--og-input-ink": "#f4f4f5",
      "--og-halo": "none",
    });
    // Its size and the sidebar's width are still the user's own.
    const scene = lookVariables(painted, "scene") as Record<string, string | number>;
    expect(formal["--og-type"]).toBe(scene["--og-type"]);
    expect(formal["--og-sidebar"]).toBe(scene["--og-sidebar"]);
    expect(scene["--og-wall-text"]).not.toBe("#f4f4f5");
  });
});
