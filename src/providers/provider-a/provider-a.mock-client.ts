import { SimulationConfig } from '../simulation/fault-scenario';
import { simulateCall } from '../simulation/simulate';
import { SimulationStats } from '../simulation/simulation-stats';
import {
  ProviderAHttpError,
  ProviderASearchRequest,
  ProviderASearchResponse,
} from './provider-a.types';

// Provider A's static "database", keyed by lower-case city name.
const HOTELS: Record<string, { id: string; name: string; nightly: number }[]> =
  {
    amman: [
      { id: 'A-100', name: 'Grand Hyatt Amman', nightly: 120 },
      { id: 'A-101', name: 'Amman Rotana', nightly: 95 },
    ],
    dubai: [{ id: 'A-200', name: 'Address Downtown', nightly: 310 }],
  };

const DAY_MS = 24 * 60 * 60 * 1000;

function nightsBetween(checkIn: string, checkOut: string): number {
  return (Date.parse(checkOut) - Date.parse(checkIn)) / DAY_MS;
}

// Pretends to be Provider A's remote API.
// In a real project this class would make an HTTP call. Here it only simulates one.
export class ProviderAMockClient {
  readonly stats = new SimulationStats();

  constructor(private readonly config: SimulationConfig) {}

  async search(
    request: ProviderASearchRequest,
    signal?: AbortSignal,
  ): Promise<ProviderASearchResponse> {
    const outcome = await simulateCall(this.config, this.stats, signal);

    // Provider A's way of failing: throw an HTTP-style error.
    switch (outcome) {
      case 'unavailable':
        throw new ProviderAHttpError(503, { message: 'Service Unavailable' });
      case 'rate-limited':
        throw new ProviderAHttpError(429, {
          message: 'Too Many Requests',
          retryAfterSeconds: 1,
        });
      case 'bad-request':
        throw new ProviderAHttpError(400, { message: 'Invalid dates' });
      case 'malformed':
        // Provider broke its own contract: missing hotel_name and price.
        return {
          results: [{ id: 'A-BROKEN' }],
        } as unknown as ProviderASearchResponse;
    }

    // outcome is 'ok' here. TypeScript knows it, because every failure returned or threw above.
    const nights = nightsBetween(request.checkIn, request.checkOut);
    const hotels = HOTELS[request.city.toLowerCase()] ?? [];

    return {
      results: hotels.map((hotel) => ({
        id: hotel.id,
        hotel_name: hotel.name,
        price: { amount: (hotel.nightly * nights).toFixed(2), currency: 'EUR' },
      })),
    };
  }
}
