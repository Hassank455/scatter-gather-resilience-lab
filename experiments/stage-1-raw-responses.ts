// Stage 1 experiment: three providers, three incompatible response shapes.
// Run it: npx ts-node experiments/stage-1-raw-responses.ts
import { ProviderAMockClient } from '../src/providers/provider-a/provider-a.mock-client';
import { ProviderBMockClient } from '../src/providers/provider-b/provider-b.mock-client';
import { ProviderCMockClient } from '../src/providers/provider-c/provider-c.mock-client';

// Runs one call and prints how long it took plus what came back (or what was thrown).
async function show(label: string, call: () => Promise<unknown>) {
  const start = performance.now();
  try {
    const result = await call();
    console.log(
      `\n${label} OK after ${Math.round(performance.now() - start)} ms`,
    );
    console.dir(result, { depth: null });
  } catch (error) {
    console.log(
      `\n${label} THREW after ${Math.round(performance.now() - start)} ms`,
    );
    console.dir(error, { depth: null });
  }
}

async function main() {
  // The same search (Amman, 2 nights, 2 guests), expressed in three different "languages".
  const a = new ProviderAMockClient({
    latencyMs: 300,
    scenario: { kind: 'ok' },
  });
  const b = new ProviderBMockClient({
    latencyMs: 700,
    scenario: { kind: 'ok' },
  });
  const c = new ProviderCMockClient({
    latencyMs: 1500,
    scenario: { kind: 'ok' },
  });

  console.log('===== Round 1: every provider healthy =====');
  await show('A', () =>
    a.search({
      city: 'Amman',
      checkIn: '2026-10-01',
      checkOut: '2026-10-03',
      guests: 2,
    }),
  );
  await show('B', () =>
    b.search({
      destination: { cityCode: 'AMM' },
      stay: { from: '2026-10-01', nights: 2 },
      occupancy: { adults: 2 },
    }),
  );
  await show('C', () =>
    c.search({ loc: 1001, d1: '2026-10-01', d2: '2026-10-03', pax: 2 }),
  );

  // The same failure ("rate limited") looks different at every provider.
  const rateLimited = { kind: 'fail', error: 'rate-limited' } as const;
  const aFail = new ProviderAMockClient({
    latencyMs: 300,
    scenario: rateLimited,
  });
  const bFail = new ProviderBMockClient({
    latencyMs: 700,
    scenario: rateLimited,
  });
  const cFail = new ProviderCMockClient({
    latencyMs: 1500,
    scenario: rateLimited,
  });

  console.log('\n===== Round 2: every provider rate-limited =====');
  await show('A', () =>
    aFail.search({
      city: 'Amman',
      checkIn: '2026-10-01',
      checkOut: '2026-10-03',
      guests: 2,
    }),
  );
  await show('B', () =>
    bFail.search({
      destination: { cityCode: 'AMM' },
      stay: { from: '2026-10-01', nights: 2 },
      occupancy: { adults: 2 },
    }),
  );
  await show('C', () =>
    cFail.search({ loc: 1001, d1: '2026-10-01', d2: '2026-10-03', pax: 2 }),
  );

  console.log(
    '\nStats A:',
    a.stats,
    '\nStats B:',
    b.stats,
    '\nStats C:',
    c.stats,
  );
}

void main();
