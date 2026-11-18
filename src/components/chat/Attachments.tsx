"use client";

import { formatBytes } from "@/lib/limits";
import type { Attachment } from "@/lib/types";
import styles from "./chat.module.css";
import { CloseIcon, FileIcon } from "./icons";

/** Files on a sent message: image thumbnails first-class, everything else as a labelled chip. */
export function MessageAttachments(props: {
  attachments: Attachment[];
  fileUrl: (attachment: Attachment) => string;
}) {
  const { attachments, fileUrl } = props;
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

/** Files queued in the composer, each removable before sending. */
export function PendingFiles(props: { files: File[]; onRemove: (index: number) => void }) {
  const { files, onRemove } = props;
  if (files.length === 0) return null;
  return (
    <div className={styles.pending}>
      {files.map((file, index) => (
        <span key={`${file.name}-${file.size}-${index}`} className={styles.chip}>
          <FileIcon />
          <span className={styles.chipName}>{file.name}</span>
          <span className={styles.chipMeta}>{formatBytes(file.size)}</span>
          <button
            type="button"
            className={styles.chipRemove}
            onClick={() => onRemove(index)}
            aria-label={`Remove ${file.name}`}
          >
            <CloseIcon />
          </button>
        </span>
      ))}
    </div>
  );
}
