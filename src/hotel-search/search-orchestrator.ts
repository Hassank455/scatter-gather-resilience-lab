import { Inject, Injectable, Logger } from '@nestjs/common';
import { HotelOffer } from './domain/hotel-offer';
import { HOTEL_PROVIDERS, HotelProvider } from './domain/hotel-provider';
import { HotelSearchRequest } from './domain/hotel-search-request';
import { ProviderResult, SearchResponse } from './domain/search-response';

// What one provider call produces: its offers + how it went.
interface ProviderOutcome {
  offers: HotelOffer[];
  result: ProviderResult;
}

// Facade + Scatter-Gather.
// Stage 5 version: a failing provider no longer fails the search (partial results).
@Injectable()
export class SearchOrchestrator {
  private readonly logger = new Logger(SearchOrchestrator.name);

  constructor(
    @Inject(HOTEL_PROVIDERS) private readonly providers: HotelProvider[],
  ) {}

  async search(request: HotelSearchRequest): Promise<SearchResponse> {
    const searchStart = performance.now();

    // Nobody aborts this signal yet. Cancellation arrives in Stage 6.
    const signal = new AbortController().signal;

    // SCATTER: start every provider call right now.
    const calls = this.providers.map((provider) =>
      this.callProvider(provider, request, signal),
    );

    // GATHER: callProvider never rejects (it turns errors into a 'failed' outcome),
    // so Promise.all can no longer fail-fast. It simply waits for everyone.
    const outcomes = await Promise.all(calls);

    return {
      offers: outcomes
        .flatMap((outcome) => outcome.offers)
        .sort((a, b) => a.price - b.price),
      providers: outcomes.map((outcome) => outcome.result),
      durationMs: Math.round(performance.now() - searchStart),
    };
  }

  // Runs ONE provider, measures it, and ALWAYS resolves: success or failure.
  // This try/catch is the error-isolation boundary: one provider's error stops here
  // and cannot reach the other providers or the HTTP response.
  private async callProvider(
    provider: HotelProvider,
    request: HotelSearchRequest,
    signal: AbortSignal,
  ): Promise<ProviderOutcome> {
    const start = performance.now();
    const elapsed = () => Math.round(performance.now() - start);

    try {
      const offers = await provider.search(request, { signal });
      return {
        offers,
        result: {
          name: provider.name,
          status: 'success',
          latencyMs: elapsed(),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Nest no longer logs this error for us (nothing is thrown), so we do.
      this.logger.warn(`Provider ${provider.name} failed: ${message}`);

      return {
        offers: [], // a failed provider contributes nothing, the others still count
        result: {
          name: provider.name,
          status: 'failed',
          latencyMs: elapsed(), // failures have a duration too (fast fail vs slow fail)
          error: message,
        },
      };
    }
  }
}
