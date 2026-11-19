"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import styles from "./chat.module.css";

/**
 * A terminal's cursor for a text box: a solid block sitting on the character
 * it is at, with that character shown in reverse, instead of the thin line a
 * browser draws.
 *
 * A text box cannot be told to draw its cursor this way, so the box's own
 * cursor is made invisible (in CSS) and this draws one over it. It lays the
 * same text out again in an unseen copy placed exactly on top of the box,
 * with one element in it where the cursor is; that element is the block. The
 * copy takes its type, spacing and padding from the box itself, so it works
 * for any text box it is put beside (the box's parent must be positioned). Because the copy wraps and scrolls
 * like the box, the block is always where the next character will go.
 *
 * Out of focus the block is an outline, as in a terminal that is not the
 * active window. While text is selected there is no block: the selection
 * shows where you are.
 */
/** What makes text wrap where it wraps: copied from the box to its unseen twin. */
const TYPE = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontStretch",
  "fontVariant",
  "fontFeatureSettings",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textIndent",
  "textTransform",
  "tabSize",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
] as const;

export function BlockCaret(props: {
  target: RefObject<HTMLTextAreaElement | null>;
  value: string;
  /** Shown under the block when the box is empty, so the block sits on its first letter. */
  placeholder?: string;
  /** The colours to draw in: the message box's own, or plain ink on white paper. */
  tone?: "input" | "paper";
}) {
  const { target, value, placeholder = "", tone = "input" } = props;
  const copy = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState({ at: 0, collapsed: true, focused: false });

  // Keep the copy exactly over the box: same place, same size, same type, scrolled as far.
  const place = () => {
    const box = target.current;
    const over = copy.current;
    if (!box || !over) return;
    const type = getComputedStyle(box);
    for (const name of TYPE) over.style[name] = type[name];
    over.style.left = `${box.offsetLeft + box.clientLeft}px`;
    over.style.top = `${box.offsetTop + box.clientTop}px`;
    over.style.width = `${box.clientWidth}px`;
    over.style.height = `${box.clientHeight}px`;
    over.scrollTop = box.scrollTop;
  };

  useEffect(() => {
    const box = target.current;
    if (!box) return;
    const read = () => {
      const next = {
        at: box.selectionStart ?? 0,
        collapsed: box.selectionStart === box.selectionEnd,
        focused: document.activeElement === box,
      };
      setCaret((was) =>
        was.at === next.at && was.collapsed === next.collapsed && was.focused === next.focused
          ? was
          : next,
      );
      place();
    };
    read();
    // The cursor moves by typing, by the arrow keys, by a click, by a selection made anywhere.
    document.addEventListener("selectionchange", read);
    for (const type of ["input", "focus", "blur", "keyup", "pointerup"]) {
      box.addEventListener(type, read);
    }
    box.addEventListener("scroll", place);
    const resized = new ResizeObserver(place);
    resized.observe(box);
    return () => {
      document.removeEventListener("selectionchange", read);
      for (const type of ["input", "focus", "blur", "keyup", "pointerup"]) {
        box.removeEventListener(type, read);
      }
      box.removeEventListener("scroll", place);
      resized.disconnect();
    };
    // `place` only reads refs, and the box is the same element for the life of the form.
  }, [target]);

  // After every change to the text (the box has grown or shrunk by now), line up again.
  useLayoutEffect(() => {
    const box = target.current;
    if (box) {
      const at = Math.min(box.selectionStart ?? 0, value.length);
      setCaret((was) => (was.at === at ? was : { ...was, at }));
    }
    place();
  });

  const at = Math.min(caret.at, value.length);
  // The character the block sits on. None at the end of a line or of the text.
  const point = value.codePointAt(at);
  const under = point === undefined || point === 10 ? "" : String.fromCodePoint(point);
  const ghost = value === "" ? placeholder.slice(0, 1) : "";
  const look = `${styles.blockCaret} ${caret.focused ? "" : styles.blockCaretIdle}`;
  // A new key whenever the cursor moves or the text changes: the blink starts over, lit.
  const beat = `${at}:${value.length}`;

  return (
    <div
      ref={copy}
      className={`${styles.caretCopy} ${tone === "paper" ? styles.caretCopyPaper : ""}`}
      aria-hidden="true"
    >
      {value.slice(0, at)}
      {caret.collapsed &&
        (under || ghost ? (
          <span key={beat} className={look}>
            {under || ghost}
          </span>
        ) : (
          <span key={beat} className={`${look} ${styles.blockCaretEnd}`} />
        ))}
      {value.slice(at + (caret.collapsed ? under.length : 0))}
    </div>
  );
}
