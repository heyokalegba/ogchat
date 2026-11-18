export type ProviderErrorCode =
  | "not_configured"
  | "invalid_key"
  | "no_credits"
  | "forbidden"
  | "rate_limited"
  | "provider_error"
  | "network"
  | "timeout"
  | "empty_reply"
  | "aborted";

/** Base class. `message` is always safe to show to the user: plain and free of secrets. */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status?: number;

  constructor(code: ProviderErrorCode, message: string, status?: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

/** Nothing was sent: the key, base URL or model id is missing or malformed. */
export class ProviderConfigError extends ProviderError {
  constructor(message: string) {
    super("not_configured", message);
  }
}

/** What the provider itself said, appended to our own wording when it said anything. */
function quoted(detail?: string): string {
  return detail ? ` The provider said: "${detail}"` : "";
}

/** 401: the provider does not recognise the API key. */
export class ProviderAuthError extends ProviderError {
  constructor(status = 401, detail?: string) {
    super(
      "invalid_key",
      `The provider rejected the API key (${status}). Check the key in settings.${quoted(detail)}`,
      status,
    );
  }
}

/** 402: the key is fine, the account behind it has nothing left to spend. */
export class ProviderCreditsError extends ProviderError {
  constructor(detail?: string) {
    super(
      "no_credits",
      `The provider says this account is out of credits (402). The key is fine: add credits in the provider's console, then retry.${quoted(detail)}`,
      402,
    );
  }
}

/**
 * 403: the provider knows the key and still said no. Either the key may not
 * use this model or project, or the request itself was blocked by a policy.
 */
export class ProviderForbiddenError extends ProviderError {
  constructor(detail?: string) {
    const policy = /policy|moderat|content.?filter|safety/i.test(detail ?? "");
    super(
      "forbidden",
      policy
        ? `The provider blocked this request under its policy (403). The key is not the problem.${quoted(detail)}`
        : `The provider refused this request (403). This is usually not a wrong key: the key is not allowed to use this model or project. Check the key's permissions in the provider's console.${quoted(detail)}`,
      403,
    );
  }
}

/** 429. */
export class ProviderRateLimitError extends ProviderError {
  constructor(detail?: string) {
    super(
      "rate_limited",
      `The provider is rate limiting requests (429). Wait a moment and retry.${detail ? ` ${detail}` : ""}`,
      429,
    );
  }
}

/** Any other failure reported by the provider itself. */
export class ProviderHTTPError extends ProviderError {
  /** `advice` replaces the stock hint when the adapter knows exactly what is wrong. */
  constructor(status: number, detail?: string, advice?: string) {
    const hint = advice
      ? ` ${advice}`
      : status === 404
        ? " Check the API base URL and model id in settings."
        : "";
    super(
      "provider_error",
      `The provider returned an error (${status})${detail ? `: ${detail}` : "."}${hint}`,
      status,
    );
  }
}

/** The request never completed: DNS failure, refused or dropped connection, offline. */
export class ProviderNetworkError extends ProviderError {
  constructor(message: string) {
    super("network", message);
  }
}

/** The provider accepted the connection, then went quiet. */
export class ProviderTimeoutError extends ProviderError {
  constructor(message = "The provider stopped responding. Retry in a moment.") {
    super("timeout", message);
  }
}

/** A successful response that carried no text. */
export class ProviderEmptyReplyError extends ProviderError {
  /** `thoughtOnly`: the model sent reasoning and then stopped without an answer. */
  constructor(thoughtOnly = false) {
    super(
      "empty_reply",
      thoughtOnly
        ? "The model spent its whole reply thinking and never answered. Retry."
        : "The provider returned an empty reply.",
    );
  }
}

/** The caller cancelled the request. */
export class ProviderAbortedError extends ProviderError {
  constructor() {
    super("aborted", "Generation was stopped.");
  }
}
