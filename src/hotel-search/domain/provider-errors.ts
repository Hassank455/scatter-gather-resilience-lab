// Provider-independent errors. Adapters translate every provider's raw error
// into one of these, so later layers (retry, circuit breaker, orchestrator)
// never need to know that A uses HTTP codes, B uses "B-503", and C hides errors in the body.
export abstract class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    options?: ErrorOptions, // { cause } keeps the raw provider error for debugging
  ) {
    super(`[${provider}] ${message}`, options);
    this.name = new.target.name; // shows "ProviderUnavailableError" instead of "Error"
  }
}

// Provider is down or broken on its side (5xx, connection reset).
export class ProviderUnavailableError extends ProviderError {}

// We are calling too fast (429). The provider itself is healthy.
export class ProviderRateLimitedError extends ProviderError {
  constructor(
    provider: string,
    readonly retryAfterMs: number | undefined,
    options?: ErrorOptions,
  ) {
    super(provider, 'rate limited', options);
  }
}

// Our request was rejected (4xx). Sending it again will fail again.
export class InvalidProviderRequestError extends ProviderError {}

// The provider answered, but the response does not match its own contract.
export class ProviderResponseError extends ProviderError {}
