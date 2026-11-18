const DOTS = "••••••••";

/** Masked form of a secret: fixed-width dots plus the last four characters of longer keys. */
export function maskKey(key: string | null | undefined): string {
  if (!key) return "(none)";
  return key.length >= 12 ? `${DOTS}${key.slice(-4)}` : DOTS;
}

/**
 * Scrubs a secret out of arbitrary text (provider error bodies sometimes echo
 * the key back) and blanks anything that looks like a bearer credential.
 */
export function redactSecret(text: string, secret?: string | null): string {
  let out = text;
  if (secret) out = out.split(secret).join(maskKey(secret));
  return out.replace(/(Bearer\s+)[^\s"',]+/gi, `$1${DOTS}`);
}
