import { SimulationConfig } from '../simulation/fault-scenario';
import { simulateCall } from '../simulation/simulate';
import { SimulationStats } from '../simulation/simulation-stats';
import {
  ProviderBApiError,
  ProviderBSearchRequest,
  ProviderBSearchResponse,
} from './provider-b.types';

// Provider B's static "database", keyed by city code.
// Nightly prices are in cents. There are two rates per hotel.
const HOTELS: Record<
  string,
  { code: string; title: string; roomOnly: number; breakfast: number }[]
> = {
  AMM: [
    {
      code: 'B-GHA',
      title: 'Grand Hyatt Amman',
      roomOnly: 11500,
      breakfast: 13500,
    },
    {
      code: 'B-KMP',
      title: 'Kempinski Amman',
      roomOnly: 14000,
      breakfast: 16000,
    },
  ],
  DXB: [
    {
      code: 'B-ATL',
      title: 'Atlantis The Palm',
      roomOnly: 45000,
      breakfast: 49000,
    },
  ],
};

export class ProviderBMockClient {
  readonly stats = new SimulationStats();

  constructor(private readonly config: SimulationConfig) {}

  async search(
    request: ProviderBSearchRequest,
    signal?: AbortSignal,
  ): Promise<ProviderBSearchResponse> {
    const outcome = await simulateCall(this.config, this.stats, signal);

    // Provider B's way of failing: throw its own error codes.
    switch (outcome) {
      case 'unavailable':
        throw new ProviderBApiError('B-503');
      case 'rate-limited':
        throw new ProviderBApiError('B-429');
      case 'bad-request':
        throw new ProviderBApiError('B-400');
      case 'malformed':
        return { data: null } as unknown as ProviderBSearchResponse;
    }

    const { nights } = request.stay;
    const hotels = HOTELS[request.destination.cityCode] ?? [];

    return {
      data: {
        hotels: hotels.map((hotel) => ({
          code: hotel.code,
          title: hotel.title,
          rates: [
            { rateId: 'RO', totalCents: hotel.roomOnly * nights, cur: 'eur' },
            { rateId: 'BB', totalCents: hotel.breakfast * nights, cur: 'eur' },
          ],
        })),
      },
    };
  }
}
