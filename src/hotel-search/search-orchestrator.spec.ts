import { HotelOffer } from './domain/hotel-offer';
import { HotelProvider } from './domain/hotel-provider';
import { SearchOrchestrator } from './search-orchestrator';

const request = {
  city: 'Amman',
  checkIn: '2026-10-01',
  checkOut: '2026-10-03',
  guests: 2,
};

// A scripted fake provider: we control its offers and see when it starts/ends.
// The orchestrator only knows the interface, so a fake is enough. No mock client, no Nest.
function fakeProvider(
  name: string,
  offers: HotelOffer[],
  events: string[] = [],
): HotelProvider {
  return {
    name,
    async search() {
      events.push(`${name}:start`);
      await Promise.resolve(); // let other code run, as real I/O would
      events.push(`${name}:end`);
      return offers;
    },
  };
}

function failingProvider(name: string, message: string): HotelProvider {
  return { name, search: () => Promise.reject(new Error(message)) };
}

const offer = (provider: string, price: number): HotelOffer => ({
  provider,
  hotelId: `${provider}-1`,
  name: `Hotel ${provider}`,
  price,
  currency: 'EUR',
});

describe('SearchOrchestrator (Stage 5: partial results)', () => {
  it('merges offers from all providers, cheapest first', async () => {
    const orchestrator = new SearchOrchestrator([
      fakeProvider('A', [offer('A', 300)]),
      fakeProvider('B', [offer('B', 100)]),
    ]);

    const response = await orchestrator.search(request);

    expect(response.offers.map((o) => o.price)).toEqual([100, 300]);
    expect(response.providers.map((p) => p.status)).toEqual([
      'success',
      'success',
    ]);
  });

  it('starts every provider before any of them finishes', async () => {
    const events: string[] = [];
    const orchestrator = new SearchOrchestrator([
      fakeProvider('A', [], events),
      fakeProvider('B', [], events),
    ]);

    await orchestrator.search(request);

    expect(events).toEqual(['A:start', 'B:start', 'A:end', 'B:end']);
  });

  // Flipped from Stage 4: one failure no longer fails the search.
  it('returns the other providers’ offers when one provider fails', async () => {
    const orchestrator = new SearchOrchestrator([
      fakeProvider('A', [offer('A', 300)]),
      failingProvider('B', 'B is down'),
    ]);

    const response = await orchestrator.search(request);

    expect(response.offers).toEqual([offer('A', 300)]);
    expect(response.providers).toMatchObject([
      { name: 'A', status: 'success' },
      { name: 'B', status: 'failed', error: 'B is down' },
    ]);
  });

  // Documents the NEXT weakness. Stage 6 (timeout) will flip it.
  it('waits forever for a provider that never answers', async () => {
    const hanging: HotelProvider = {
      name: 'C',
      search: () => new Promise(() => {}), // never settles
    };
    const orchestrator = new SearchOrchestrator([
      fakeProvider('A', [offer('A', 300)]),
      hanging,
    ]);

    let finished = false;
    void orchestrator.search(request).then(() => (finished = true));
    await new Promise((resolve) => setImmediate(resolve)); // let A finish

    // A finished long ago, but the whole search is stuck waiting for C.
    expect(finished).toBe(false);
  });
});
