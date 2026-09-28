import { SimulationConfig } from './simulation/fault-scenario';

// How each simulated provider behaves. Change a scenario here to run an experiment,
// e.g. { kind: 'fail', error: 'unavailable' }.
// `satisfies` checks the shape but keeps the exact literal types.
export const providerConfig = {
  // a: { simulation: { latencyMs: 300, scenario: { kind: 'ok' } } },
  a: {
    simulation: {
      latencyMs: 300,
      scenario: { kind: 'fail', error: 'rate-limited' },
    },
  },
  // b: { simulation: { latencyMs: 700, scenario: { kind: 'ok' } } },
  b: {
    simulation: {
      latencyMs: 700,
      scenario: { kind: 'fail', error: 'unavailable' },
    },
  },

  c: { simulation: { latencyMs: 1500, scenario: { kind: 'ok' } } },
  // c: {
  //   simulation: {
  //     latencyMs: 1500,
  //     scenario: { kind: 'fail', error: 'malformed' },
  //   },
  // },
  // c: {
  //   simulation: {
  //     latencyMs: 1500,
  //     scenario: { kind: 'hang' },
  //   },
  // },
} satisfies Record<string, { simulation: SimulationConfig }>;
