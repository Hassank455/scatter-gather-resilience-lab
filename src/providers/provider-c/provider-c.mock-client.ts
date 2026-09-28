import { SimulationConfig } from '../simulation/fault-scenario';
import { simulateCall } from '../simulation/simulate';
import { SimulationStats } from '../simulation/simulation-stats';
import {
  ProviderCRow,
  ProviderCSearchRequest,
  ProviderCSearchResponse,
} from './provider-c.types';

// Provider C's static "database", keyed by its own numeric location ids.
const HOTELS: Record<number, ProviderCRow[]> = {
  1001: [
    ['C-9001', 'Grand Hyatt Amman', 118.5, 'EUR'],
    ['C-9002', 'The House Boutique', 70, 'EUR'],
  ],
  2002: [['C-9101', 'Jumeirah Beach Hotel', 380, 'EUR']],
};

export class ProviderCMockClient {
  readonly stats = new SimulationStats();

  constructor(private readonly config: SimulationConfig) {}

  async search(
    request: ProviderCSearchRequest,
    signal?: AbortSignal,
  ): Promise<ProviderCSearchResponse> {
    const outcome = await simulateCall(this.config, this.stats, signal);

    // Provider C's way of failing: it does NOT throw. It returns an error inside the body.
    switch (outcome) {
      case 'unavailable':
        return { status: 'ERROR', code: 'SERVICE_DOWN' };
      case 'rate-limited':
        return { status: 'ERROR', code: 'RATE_LIMIT' };
      case 'bad-request':
        return { status: 'ERROR', code: 'INVALID_QUERY' };
      case 'malformed':
        // The row is too short: price and currency are missing.
        return {
          status: 'OK',
          payload: [['C-BROKEN', 'Broken Hotel']],
        } as unknown as ProviderCSearchResponse;
    }

    return { status: 'OK', payload: HOTELS[request.loc] ?? [] };
  }
}
