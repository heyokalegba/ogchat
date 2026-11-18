export type ProviderErrorCode =
  | "not_configured"
  | "invalid_key"
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

/** 401 / 403: the provider rejected the API key. */
export class ProviderAuthError extends ProviderError {
  constructor(status: number) {
    super(
      "invalid_key",
      `The provider rejected the API key (${status}). Check the key in settings.`,
      status,
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
  constructor(status: number, detail?: string) {
    const hint = status === 404 ? " Check the API base URL and model id in settings." : "";
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
  constructor() {
    super("empty_reply", "The provider returned an empty reply.");
  }
}

/** The caller cancelled the request. */
export class ProviderAbortedError extends ProviderError {
  constructor() {
    super("aborted", "Generation was stopped.");
  }
}
