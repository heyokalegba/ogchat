import { describe, expect, it } from "vitest";
import { editedFile, isOver, MAX_EDIT_CHARS, peekFile } from "@/lib/client/peek";
import { MAX_TEXT_CHARS } from "@/lib/limits";

const textFile = (text: string, name = "pasted text 10.04.33.txt") =>
  new File([text], name, { type: "text/plain" });

describe("peeking into a file before it is sent", () => {
  it("reads a paste as text that can be edited", async () => {
    expect(await peekFile(textFile("line one\nline two — ✓"))).toEqual({
      kind: "text",
      text: "line one\nline two — ✓",
      editable: true,
      over: false,
    });
  });

  it("goes by content, not by name or declared type", async () => {
    const code = new File(["const a = 1;\n"], "a.ts", { type: "video/mp2t" });
    expect(await peekFile(code)).toMatchObject({ kind: "text", editable: true });
    const untyped = new File(["plain"], "notes");
    expect(await peekFile(untyped)).toMatchObject({ kind: "text", text: "plain" });
  });

  it("knows pictures, PDFs, and files that are neither", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "a.png", {
      type: "image/png",
    });
    expect(await peekFile(png)).toEqual({ kind: "image" });
    expect(await peekFile(new File(["%PDF-1.7\n…"], "a.pdf"))).toEqual({ kind: "pdf" });
    const zip = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])], "a.zip");
    expect(await peekFile(zip)).toEqual({ kind: "other" });
    const latin1 = new File([new Uint8Array([0x63, 0x61, 0x66, 0xe9])], "cafe.txt");
    expect(await peekFile(latin1)).toEqual({ kind: "other" });
  });

  it("says when the end of the text will be cut off, and still lets it be trimmed", async () => {
    const long = "x".repeat(MAX_TEXT_CHARS + 1);
    expect(await peekFile(textFile(long))).toMatchObject({ editable: true, over: true });
    expect(isOver("x".repeat(MAX_TEXT_CHARS))).toBe(false);
    // The server counts characters: an emoji is one, though it takes two units of a string.
    expect(isOver("😀".repeat(MAX_TEXT_CHARS))).toBe(false);
    expect(isOver("😀".repeat(MAX_TEXT_CHARS + 1))).toBe(true);
  });

  it("shows only the beginning of text too long to edit", async () => {
    const peek = await peekFile(textFile("y".repeat(MAX_EDIT_CHARS + 1)));
    expect(peek).toMatchObject({ kind: "text", editable: false, over: true });
    expect(peek.kind === "text" && peek.text.length).toBe(MAX_TEXT_CHARS);
  });
});

describe("saving an edit", () => {
  it("keeps the name and type, and carries the new text", async () => {
    const before = textFile("first draft");
    const after = editedFile(before, "second draft, longer");
    expect(after).not.toBe(before);
    expect(after.name).toBe(before.name);
    expect(after.type).toBe("text/plain");
    expect(await after.text()).toBe("second draft, longer");
    expect(after.size).toBe(20);
  });

  it("gives a file with no declared type a text one", () => {
    expect(editedFile(new File(["a"], "notes"), "b").type).toBe("text/plain");
  });
});
