import { HotelOffer } from './hotel-offer';

// How a provider's part of the search ended.
// More statuses arrive with their patterns: 'timeout' (Stage 6),
// 'circuit_open' (Stage 9), 'rejected' (Stage 10).
export type ProviderStatus = 'success' | 'failed';

// What happened with ONE provider during a search.
export interface ProviderResult {
  name: string;
  status: ProviderStatus;
  latencyMs: number; // how long the orchestrator waited for this provider
  error?: string; // short reason, only when status is not 'success'
}

// What the API returns.
export interface SearchResponse {
  offers: HotelOffer[]; // offers from the providers that succeeded, cheapest first
  providers: ProviderResult[]; // one entry per provider, successful or not
  durationMs: number; // the whole search, as the client experienced it
}
