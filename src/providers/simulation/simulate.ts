import { SimulatedFailure, SimulationConfig } from './fault-scenario';
import { SimulationStats } from './simulation-stats';

// Waits `ms` milliseconds, but stops early if the signal is aborted,
// the same way a real HTTP client (fetch, axios) stops an aborted request.
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason as Error);
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason as Error);
    };

    const timer = setTimeout(() => {
      // Clean up, otherwise every finished call leaves a listener behind.
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// Never settles on its own, like a server that accepted the connection and went silent.
// The only way out is an abort (that is Stage 6's job).
export function hangUntilAborted(signal?: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason as Error);
      return;
    }
    signal?.addEventListener('abort', () => reject(signal.reason as Error), {
      once: true,
    });
  });
}

// Simulates ONE remote call: count it, wait the latency, then pick the outcome.
// It only returns WHAT should happen ('ok' or a failure kind).
// Each client decides HOW that looks in its own raw format.
export async function simulateCall(
  config: SimulationConfig,
  stats: SimulationStats,
  signal?: AbortSignal,
): Promise<'ok' | SimulatedFailure> {
  const { scenario } = config;
  stats.start();
  try {
    if (scenario.kind === 'hang') {
      return await hangUntilAborted(signal);
    }
    // From here TypeScript knows scenario is 'ok' or 'fail' (the 'hang' case returned above).
    await delay(config.latencyMs, signal);
    return scenario.kind === 'ok' ? 'ok' : scenario.error;
  } finally {
    // `finally` runs on success, failure AND abort, so inFlight is always correct.
    stats.finish();
  }
}
