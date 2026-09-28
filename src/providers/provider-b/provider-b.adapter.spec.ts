import {
  InvalidProviderRequestError,
  ProviderRateLimitedError,
  ProviderResponseError,
  ProviderUnavailableError,
} from '../../hotel-search/domain/provider-errors';
import { FaultScenario, SimulatedFailure } from '../simulation/fault-scenario';
import { ProviderBAdapter } from './provider-b.adapter';
import { ProviderBMockClient } from './provider-b.mock-client';

const request = {
  city: 'Amman',
  checkIn: '2026-10-01',
  checkOut: '2026-10-03',
  guests: 2,
};
const ctx = () => ({ signal: new AbortController().signal });

function setup(scenario: FaultScenario) {
  const client = new ProviderBMockClient({ latencyMs: 0, scenario });
  return { client, adapter: new ProviderBAdapter(client) };
}

describe('ProviderBAdapter', () => {
  it('picks the cheapest rate and converts cents + lower-case currency', async () => {
    const offers = await setup({ kind: 'ok' }).adapter.search(request, ctx());

    // Room only 115.00/night × 2 nights = 230, cheaper than breakfast (270).
    expect(offers).toContainEqual({
      provider: 'B',
      hotelId: 'B-GHA',
      name: 'Grand Hyatt Amman',
      price: 230,
      currency: 'EUR',
    });
  });

  it('skips the remote call for a city B does not cover', async () => {
    const { client, adapter } = setup({ kind: 'ok' });

    const offers = await adapter.search({ ...request, city: 'Paris' }, ctx());

    expect(offers).toEqual([]);
    expect(client.stats.totalCalls).toBe(0);
  });

  it.each<[SimulatedFailure, new (...args: never[]) => Error]>([
    ['unavailable', ProviderUnavailableError],
    ['rate-limited', ProviderRateLimitedError],
    ['bad-request', InvalidProviderRequestError],
    ['malformed', ProviderResponseError],
  ])('translates %s into %p', async (failure, expected) => {
    const { adapter } = setup({ kind: 'fail', error: failure });

    await expect(adapter.search(request, ctx())).rejects.toBeInstanceOf(
      expected,
    );
  });
});
