import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOOK,
  cleanLook,
  lookVariables,
  pageChange,
  pageFor,
} from "@/components/shell/look";

describe("the page a chat is shown on", () => {
  it("is formal for a chat on Claude and the scene for any other, to begin with", () => {
    expect(DEFAULT_LOOK.claudePage).toBe("formal");
    expect(pageFor(DEFAULT_LOOK, true)).toBe("formal");
    expect(pageFor(DEFAULT_LOOK, false)).toBe("scene");
  });

  it("is chosen for chats on Claude and for the rest apart", () => {
    const look = { ...DEFAULT_LOOK, page: "formal" as const, claudePage: "plain" as const };
    expect(pageFor(look, true)).toBe("plain");
    expect(pageFor(look, false)).toBe("formal");
  });

  it("switches black on white to white on black for the kind of chat on screen only", () => {
    const plain = { ...DEFAULT_LOOK, page: "plain" as const, claudePage: "plain" as const };
    const other = { ...plain, ...pageChange(false, "formal") };
    expect(pageFor(other, false)).toBe("formal");
    expect(pageFor(other, true)).toBe("plain");
    const claude = { ...plain, ...pageChange(true, "formal") };
    expect(pageFor(claude, true)).toBe("formal");
    expect(pageFor(claude, false)).toBe("plain");
  });

  it("brings a hidden chat back when a page is picked", () => {
    const hidden = { ...DEFAULT_LOOK, chatShown: false };
    expect({ ...hidden, ...pageChange(false, "plain") }.chatShown).toBe(true);
    expect({ ...hidden, ...pageChange(true, "plain") }.chatShown).toBe(true);
  });

  it("reads the choice back from what was saved, and takes anything else as the default", () => {
    expect(cleanLook({ page: "formal", claudePage: "plain" })).toMatchObject({
      page: "formal",
      claudePage: "plain",
    });
    expect(cleanLook({ page: "sepia", claudePage: 7 })).toMatchObject({
      page: "scene",
      claudePage: "formal",
    });
    expect(cleanLook({})).toMatchObject({ page: "scene", claudePage: "formal" });
    expect(cleanLook(null)).toMatchObject({ page: "scene", claudePage: "formal" });
  });

  it("reads a look saved before there were three pages to choose from", () => {
    // Plain was a switch of its own, and chats on Claude were formal or like the rest.
    expect(cleanLook({ plain: true })).toMatchObject({ page: "plain", claudePage: "formal" });
    expect(cleanLook({ plain: true, claudePage: "same" })).toMatchObject({
      page: "plain",
      claudePage: "plain",
    });
    expect(cleanLook({ plain: false, claudePage: "same" })).toMatchObject({
      page: "scene",
      claudePage: "scene",
    });
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
