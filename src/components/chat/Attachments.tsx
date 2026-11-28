"use client";

import { formatBytes } from "@/lib/limits";
import type { Attachment } from "@/lib/types";
import styles from "./chat.module.css";
import { CloseIcon, FileIcon } from "./icons";

/**
 * Files on a sent message: image thumbnails first-class, everything else as a
 * labelled chip. A chip opens the file over the chat, where it can be read.
 */
export function MessageAttachments(props: {
  attachments: Attachment[];
  fileUrl: (attachment: Attachment) => string;
  onOpen?: (attachment: Attachment, url: string) => void;
}) {
  const { attachments, fileUrl, onOpen } = props;
  if (attachments.length === 0) return null;
  return (
    <div className={styles.attachments}>
      {attachments.map((attachment) => {
        const url = fileUrl(attachment);
        const label = `${attachment.name} · ${formatBytes(attachment.size)}${
          attachment.truncated ? " · truncated" : ""
        }`;
        if (attachment.kind === "image" && url) {
          return (
            <a
              key={attachment.id}
              className={styles.thumb}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={label}
              onClick={(event) => {
                // A plain click opens the picture over the chat; a modified one still opens a window.
                if (!onOpen || event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                onOpen(attachment, url);
              }}
            >
              {/* A plain img: these are local files served by ogchat itself. */}
              <img src={url} alt={attachment.name} loading="lazy" />
            </a>
          );
        }
        const body = (
          <>
            <FileIcon />
            <span className={styles.chipName}>{attachment.name}</span>
            <span className={styles.chipMeta}>
              {formatBytes(attachment.size)}
              {attachment.truncated ? " · truncated" : ""}
            </span>
          </>
        );
        if (url && onOpen) {
          return (
            <button
              key={attachment.id}
              type="button"
              className={styles.chip}
              onClick={() => onOpen(attachment, url)}
              title={`Open ${attachment.name}`}
            >
              {body}
            </button>
          );
        }
        return url ? (
          <a
            key={attachment.id}
            className={styles.chip}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${attachment.name}`}
          >
            {body}
          </a>
        ) : (
          <span key={attachment.id} className={styles.chip}>
            {body}
          </span>
        );
      })}
    </div>
  );
}

/** Files queued in the composer: each opens to be read or edited, and can be removed, before sending. */
export function PendingFiles(props: {
  files: File[];
  onRemove: (index: number) => void;
  onOpen?: (file: File) => void;
}) {
  const { files, onRemove, onOpen } = props;
  if (files.length === 0) return null;
  return (
    <div className={styles.pending}>
      {files.map((file, index) => {
        const body = (
          <>
            <FileIcon />
            <span className={styles.chipName}>{file.name}</span>
            <span className={styles.chipMeta}>{formatBytes(file.size)}</span>
          </>
        );
        return (
          <span key={`${file.name}-${file.size}-${index}`} className={styles.chip}>
            {onOpen ? (
              <button
                type="button"
                className={styles.chipOpen}
                onClick={() => onOpen(file)}
                aria-label={`Open ${file.name}`}
                title="Open to read or edit"
              >
                {body}
              </button>
            ) : (
              body
            )}
            <button
              type="button"
              className={styles.chipRemove}
              onClick={() => onRemove(index)}
              aria-label={`Remove ${file.name}`}
            >
              <CloseIcon />
            </button>
          </span>
        );
      })}
    </div>
  );
}
