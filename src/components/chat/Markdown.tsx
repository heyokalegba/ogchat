"use client";

import {
  Children,
  isValidElement,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import styles from "./chat.module.css";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable (non-secure context): fall back to a selection copy.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

/** A quiet text button that copies `text` and confirms briefly. */
export function CopyButton({ text, label = "copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const onClick = useCallback(async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  }, [text]);
  return (
    <button
      type="button"
      className={`${styles.action} ${copied ? styles.actionDone : ""}`}
      onClick={onClick}
      aria-label={copied ? "Copied" : `Copy ${label === "copy" ? "to clipboard" : label}`}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

function CodeBlock({ children }: ComponentProps<"pre">) {
  const code = Children.toArray(children).find((child) => isValidElement(child));
  const className = isValidElement<{ className?: string }>(code)
    ? (code.props.className ?? "")
    : "";
  const language = /language-([\w+#.-]+)/.exec(className)?.[1] ?? "text";
  const text = textOf(children).replace(/\n$/, "");
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeBar}>
        <span>{language}</span>
        <CopyButton text={text} label="code" />
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const components: Components = {
  pre: ({ node: _node, ...props }) => <CodeBlock {...props} />,
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  table: ({ node: _node, ...props }) => (
    <div className={styles.tableWrap}>
      <table {...props} />
    </div>
  ),
};

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

/** Renders assistant markdown: GFM, highlighted code blocks with copy buttons. Raw HTML is not rendered. */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className={styles.md}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
