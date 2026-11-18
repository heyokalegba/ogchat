import { errorJson } from "./http";

/**
 * ogchat has no login, so the API protects itself the way a local tool can:
 *
 *  - Host must be a loopback name (or listed in OGCHAT_ALLOWED_HOSTS). This
 *    stops DNS-rebinding pages from reading sessions through a foreign name.
 *  - Requests that change state must come from the app's own origin. This
 *    stops any other site open in the browser from, say, repointing the API
 *    base URL so that the next message sends the key somewhere else.
 *
 * Returns a 403 response to send, or null when the request may proceed.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostname(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.split(":")[0] ?? h;
}

function allowedHosts(): Set<string> {
  const extra = (process.env.OGCHAT_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => hostname(h))
    .filter(Boolean);
  return new Set([...LOOPBACK, ...extra]);
}

export function guard(request: Request): Response | null {
  let host = request.headers.get("host");
  if (!host) {
    try {
      host = new URL(request.url).host;
    } catch {
      host = "";
    }
  }
  if (!allowedHosts().has(hostname(host))) {
    return errorJson(403, "forbidden_host", "This host is not allowed to use the ogchat API.");
  }

  if (SAFE_METHODS.has(request.method.toUpperCase())) return null;

  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return errorJson(403, "cross_origin", "Cross-origin requests are not allowed.");
  }
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      // "null" and other opaque origins fall through to the mismatch below.
    }
    if (originHost !== host.trim().toLowerCase()) {
      return errorJson(403, "cross_origin", "Cross-origin requests are not allowed.");
    }
  }
  return null;
}
