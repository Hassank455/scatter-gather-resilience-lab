import { HotelOffer } from './hotel-offer';
import { HotelSearchRequest } from './hotel-search-request';

// DI token. The orchestrator asks Nest for HOTEL_PROVIDERS and gets HotelProvider[],
// without knowing which providers exist.
// A Symbol (not a class) because an interface does not exist at runtime.
export const HOTEL_PROVIDERS = Symbol('HOTEL_PROVIDERS');

// Per-call information passed down to the provider.
// For now only the cancellation signal. `metrics` joins it in Stage 8.
export interface ProviderCallContext {
  signal: AbortSignal;
}

// The "port": the contract the search use case needs from any provider.
// It lives in the domain (the consumer owns the interface), and the
// adapters in providers/ implement it.
export interface HotelProvider {
  readonly name: string;
  search(
    request: HotelSearchRequest,
    ctx: ProviderCallContext,
  ): Promise<HotelOffer[]>;
}
