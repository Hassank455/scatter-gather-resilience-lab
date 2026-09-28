import {
  InvalidProviderRequestError,
  ProviderRateLimitedError,
  ProviderResponseError,
  ProviderUnavailableError,
} from '../../hotel-search/domain/provider-errors';
import { FaultScenario, SimulatedFailure } from '../simulation/fault-scenario';
import { ProviderAAdapter } from './provider-a.adapter';
import { ProviderAMockClient } from './provider-a.mock-client';

const request = {
  city: 'Amman',
  checkIn: '2026-10-01',
  checkOut: '2026-10-03',
  guests: 2,
};
const ctx = () => ({ signal: new AbortController().signal });

// latencyMs: 0 keeps tests fast. We test the adapter, not the waiting.
function adapterWith(scenario: FaultScenario) {
  return new ProviderAAdapter(
    new ProviderAMockClient({ latencyMs: 0, scenario }),
  );
}

describe('ProviderAAdapter', () => {
  it('maps A hotels to HotelOffer (string price → number)', async () => {
    const offers = await adapterWith({ kind: 'ok' }).search(request, ctx());

    expect(offers).toContainEqual({
      provider: 'A',
      hotelId: 'A-100',
      name: 'Grand Hyatt Amman',
      price: 240,
      currency: 'EUR',
    });
  });

  // One test per row: A's raw failure → the domain error we expect.
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

  it('converts Retry-After seconds into milliseconds', async () => {
    const adapter = adapterWith({ kind: 'fail', error: 'rate-limited' });

    await expect(adapter.search(request, ctx())).rejects.toMatchObject({
      retryAfterMs: 1000,
    });
  });

  it('lets an abort reason pass through untranslated', async () => {
    const controller = new AbortController();
    const reason = new Error('search cancelled');
    controller.abort(reason);

    await expect(
      adapterWith({ kind: 'ok' }).search(request, {
        signal: controller.signal,
      }),
    ).rejects.toBe(reason);
  });
});
