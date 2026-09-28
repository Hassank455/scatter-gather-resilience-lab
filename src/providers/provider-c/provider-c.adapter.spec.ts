import {
  InvalidProviderRequestError,
  ProviderRateLimitedError,
  ProviderResponseError,
  ProviderUnavailableError,
} from '../../hotel-search/domain/provider-errors';
import { FaultScenario, SimulatedFailure } from '../simulation/fault-scenario';
import { ProviderCAdapter } from './provider-c.adapter';
import { ProviderCMockClient } from './provider-c.mock-client';

const request = {
  city: 'Amman',
  checkIn: '2026-10-01',
  checkOut: '2026-10-03',
  guests: 2,
};
const ctx = () => ({ signal: new AbortController().signal });

function adapterWith(scenario: FaultScenario) {
  return new ProviderCAdapter(
    new ProviderCMockClient({ latencyMs: 0, scenario }),
  );
}

describe('ProviderCAdapter', () => {
  it('turns the nightly tuple price into a total stay price', async () => {
    const offers = await adapterWith({ kind: 'ok' }).search(request, ctx());

    // 118.5/night × 2 nights = 237
    expect(offers).toContainEqual({
      provider: 'C',
      hotelId: 'C-9001',
      name: 'Grand Hyatt Amman',
      price: 237,
      currency: 'EUR',
    });
  });

  // C never throws: these errors arrive inside a "successful" response.
  it.each<[SimulatedFailure, new (...args: never[]) => Error]>([
    ['unavailable', ProviderUnavailableError],
    ['rate-limited', ProviderRateLimitedError],
    ['bad-request', InvalidProviderRequestError],
    ['malformed', ProviderResponseError],
  ])('translates %s into %p', async (failure, expected) => {
    const adapter = adapterWith({ kind: 'fail', error: failure });

    await expect(adapter.search(request, ctx())).rejects.toBeInstanceOf(
      expected,
    );
  });
});
