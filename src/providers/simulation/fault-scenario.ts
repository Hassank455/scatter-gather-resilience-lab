// The kinds of failure a mock provider can simulate.
// Each mock client turns these into its OWN raw error format.
// That difference is exactly what the adapters in Stage 2 will translate.
export type SimulatedFailure =
  | 'unavailable' // provider is down (like HTTP 503)
  | 'rate-limited' // we are calling too fast (like HTTP 429)
  | 'bad-request' // our request is wrong (like HTTP 400)
  | 'malformed'; // provider answers, but with a broken response shape

// More kinds (fail-first-n, down-for) are added in the stages that need them.
export type FaultScenario =
  { kind: 'ok' } | { kind: 'fail'; error: SimulatedFailure } | { kind: 'hang' }; // never answers (only an abort ends it)

// How one mock provider behaves.
export interface SimulationConfig {
  latencyMs: number;
  scenario: FaultScenario;
}
