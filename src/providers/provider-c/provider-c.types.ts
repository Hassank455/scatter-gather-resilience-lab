// Provider C: a legacy-style API.
// Short cryptic parameter names, numeric location ids, tuple rows,
// NIGHTLY prices, and errors reported INSIDE a successful response.

export interface ProviderCSearchRequest {
  loc: number; // Provider C's own location id, e.g. 1001 = Amman
  d1: string; // check-in, YYYY-MM-DD
  d2: string; // check-out, YYYY-MM-DD
  pax: number;
}

// One row = one hotel, as a positional array instead of an object.
export type ProviderCRow = [
  hotelId: string,
  name: string,
  nightlyPrice: number, // per NIGHT, not per stay
  currency: string,
];

// The call itself "succeeds" even on errors. You must check `status`.
export type ProviderCSearchResponse =
  | { status: 'OK'; payload: ProviderCRow[] }
  | { status: 'ERROR'; code: 'SERVICE_DOWN' | 'RATE_LIMIT' | 'INVALID_QUERY' };
