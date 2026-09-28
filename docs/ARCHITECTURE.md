# Architecture: Hotel Search Aggregator

Status: **Draft, awaiting approval**. No code has been written against this yet.

This is a learning project. Its goal is to understand *why* each pattern exists by
experiencing the problem first, then introducing the pattern that solves it.

Scope limits:

- No real external APIs. Providers are simulated in-process.
- No caching.
- No hotel deduplication across providers. A `hotelId` is only unique within its provider.
- No currency conversion. All mock providers price in EUR (in different formats).
- Single process. Circuit breaker and bulkhead state are in-memory.

---

## 1. Proposed Architecture

```text
                        GET /hotels/search
                               │
                               ▼
                      HotelSearchController
                               │
                               ▼
                 SearchOrchestrator  (Facade + Scatter-Gather)
                   │  owns the search deadline (AbortController)
                   │  fans out to HotelProvider[]  (Promise.allSettled)
                   │  gathers offers + per-provider status
        ┌──────────┼──────────────┐
        ▼          ▼              ▼
   HotelProvider  HotelProvider  HotelProvider      ← resilient pipelines
   (A pipeline)   (B pipeline)   (C pipeline)         built by ResilientProviderFactory
        │          │              │
        ▼          ▼              ▼
   ProviderA      ProviderB      ProviderC          ← Adapters: call client, map
   Adapter        Adapter        Adapter              response, translate errors
        │          │              │
        ▼          ▼              ▼
   ProviderA      ProviderB      ProviderC          ← Mock clients: raw shapes,
   MockClient     MockClient     MockClient           latency, fault scenarios
```

Three layers with a strict dependency direction:

| Layer | Knows about | Must not know about |
|---|---|---|
| `hotel-search` (use case + domain) | `HotelProvider` port, domain model | Any provider, any resilience policy |
| `providers` (integration) | Domain port, raw provider shapes, resilience policies | The orchestrator |
| `resilience` (generic) | Nothing but `AbortSignal` and functions | Hotels, providers, NestJS |

---

## 2. Request Flow (final state, after Stage 11)

```text
1. Controller parses and validates query → HotelSearchRequest
2. Orchestrator creates a deadline AbortController (e.g. 3000 ms)
3. For each provider, in parallel:
     a. start latency timer, create metrics { attempts: 0 }
     b. provider.search(request, { signal: deadlineSignal, metrics })
          Budget Timeout   ── combines deadline signal + own budget timer
            Retry          ── loop: attempt → classify error → backoff → attempt
              Circuit Breaker ── reject fast if OPEN; record outcome
                Bulkhead      ── acquire slot (or queue / reject); release in finally
                  Attempt Timeout ── per-attempt timer; aborts inner signal
                    AttemptCounter ── metrics.attempts++
                      Adapter      ── map request → client call → map response
                                       translate provider errors → domain errors
                        MockClient ── simulate latency/fault, honors signal
     c. stop latency timer
4. Promise.allSettled waits for all pipelines (each is bounded by its budget)
5. Map each settled result → ProviderResult { status, latencyMs, attempts }
6. Flatten fulfilled offers, sort by price
7. If every provider failed → 503, else 200. Same body shape for both.
```

---

## 3. Component Responsibilities

| Component | Responsibility | Does NOT |
|---|---|---|
| `HotelSearchController` | HTTP → `HotelSearchRequest`; status code from result | Know how many providers exist |
| `SearchOrchestrator` | Deadline, fan-out, gather, status mapping, latency | Retry, time out, or classify provider errors |
| `HotelProvider` (port) | The contract every provider pipeline satisfies | — |
| `ProviderXAdapter` | Build raw request, call client, call mapper, translate errors | Retry, time out, count concurrency |
| `ProviderXMapper` | Pure function: raw response → `HotelOffer[]` | Perform I/O |
| `ProviderXMockClient` | Pretend to be a remote API: raw shapes, latency, faults | Know about the domain model |
| Resilience policies | One concern each: timeout, retry, circuit breaker, bulkhead | Know about hotels |
| `PolicyDecoratedProvider` | Wrap a `HotelProvider` with one policy (Decorator) | Contain policy logic |
| `ResilientProviderFactory` | Build each pipeline in the **one** agreed order | Choose which providers participate |

---

## 4. Folder Structure

```text
src/
├── main.ts
├── app.module.ts
│
├── hotel-search/                         # the use case: "search hotels"
│   ├── hotel-search.module.ts
│   ├── hotel-search.controller.ts
│   ├── search-orchestrator.ts
│   ├── search-request.parser.ts          # query → HotelSearchRequest (manual validation)
│   └── domain/                           # provider-independent model; depends on nothing
│       ├── hotel-offer.ts
│       ├── hotel-search-request.ts
│       ├── search-response.ts
│       ├── hotel-provider.ts             # port + HOTEL_PROVIDERS DI token
│       └── provider-errors.ts            # ProviderUnavailableError, ...
│
├── providers/                            # integration with the "outside world"
│   ├── providers.module.ts               # wires HOTEL_PROVIDERS
│   ├── provider-config.ts                # latency, scenario, resilience settings per provider
│   ├── provider-a/
│   │   ├── provider-a.types.ts           # raw request/response/error shapes
│   │   ├── provider-a.mock-client.ts
│   │   ├── provider-a.mapper.ts
│   │   └── provider-a.adapter.ts
│   ├── provider-b/  (same four files)
│   ├── provider-c/  (same four files)
│   ├── simulation/                       # shared by all mock clients
│   │   ├── fault-scenario.ts
│   │   ├── simulate.ts                   # abort-aware delay + scenario evaluation
│   │   ├── simulation-stats.ts           # inFlight, maxInFlight, totalCalls per provider
│   │   └── simulation.controller.ts      # dev-only (Stage 9+)
│   └── composition/                      # Stage 8+
│       ├── policy-decorated-provider.ts  # the Decorator
│       ├── attempt-counting-provider.ts  # innermost Decorator: metrics.attempts++
│       ├── error-classification.ts       # isRetryable / countsAsFailure
│       └── resilient-provider.factory.ts
│
└── resilience/                           # generic; no hotel or Nest imports
    ├── resilience-policy.ts              # interface ResiliencePolicy
    ├── resilience-errors.ts              # TimeoutError, CircuitOpenError, BulkheadRejectedError
    ├── timeout.policy.ts                 # used twice: attempt timeout and budget timeout
    ├── retry.policy.ts
    ├── backoff.strategy.ts               # Strategy: Fixed, Exponential, ExponentialJitter
    ├── circuit-breaker.policy.ts
    └── bulkhead.policy.ts

experiments/                              # load scripts + expected observations (not tests)
docs/
└── adr/0001-resilience-pipeline-order.md
```

Why this shape:

- **Grouped by responsibility, not by pattern name.** There is no `adapters/` folder. An
  adapter only makes sense next to the client and raw types it adapts, so each provider
  folder is self-contained. Deleting `provider-b/` removes Provider B completely.
- **No `common/` folder.** Every candidate has a real owner: provider errors belong to the
  domain port, resilience errors belong to `resilience/`. A `common/` folder is created
  only when something is genuinely shared and ownerless.
- **`resilience/` is generic.** It can wrap any `(signal) => Promise<T>`. This is what keeps
  it unit-testable without hotel fixtures, and reusable if a second use case appears.

### Where each item lives

| Item | Location |
|---|---|
| Controller | `hotel-search/hotel-search.controller.ts` |
| Search Orchestrator | `hotel-search/search-orchestrator.ts` |
| Domain models | `hotel-search/domain/` |
| Provider interface | `hotel-search/domain/hotel-provider.ts` (the consumer owns the port) |
| Provider adapters | `providers/provider-x/provider-x.adapter.ts` |
| Mock provider clients | `providers/provider-x/provider-x.mock-client.ts` |
| Factory | `providers/composition/resilient-provider.factory.ts` |
| Registry | Not built (see §10) |
| Decorators | `providers/composition/` |
| Timeout / Retry / Circuit Breaker / Bulkhead | `resilience/` |
| Provider error types | `hotel-search/domain/provider-errors.ts` |
| Resilience error types | `resilience/resilience-errors.ts` |

---

## 5. Important Interfaces

### Domain

```ts
// hotel-search/domain/hotel-search-request.ts
export interface HotelSearchRequest {
  city: string;
  checkIn: string;   // ISO date, YYYY-MM-DD
  checkOut: string;
  guests: number;
}

// hotel-search/domain/hotel-offer.ts
export interface HotelOffer {
  provider: string;
  hotelId: string;   // unique per provider only
  name: string;
  price: number;     // major units, total stay
  currency: string;  // ISO 4217, upper case
}

// hotel-search/domain/hotel-provider.ts
export const HOTEL_PROVIDERS = Symbol('HOTEL_PROVIDERS');

export interface ProviderCallMetrics {
  attempts: number;  // how many times the adapter was actually invoked
}

export interface ProviderCallContext {
  signal: AbortSignal;
  metrics: ProviderCallMetrics;
}

export interface HotelProvider {
  readonly name: string;
  search(request: HotelSearchRequest, ctx: ProviderCallContext): Promise<HotelOffer[]>;
}
```

### Response contract

```ts
// hotel-search/domain/search-response.ts
export type ProviderStatus = 'success' | 'failed' | 'timeout' | 'circuit_open' | 'rejected';

export interface ProviderResult {
  name: string;
  status: ProviderStatus;
  latencyMs: number;
  attempts: number;
  error?: string;    // short, for learning/debugging only
}

export interface SearchResponse {
  offers: HotelOffer[];
  providers: ProviderResult[];
  durationMs: number;
}
```

HTTP semantics (a **project policy**, not a universal rule):

- At least one provider succeeded → `200`, even if `offers` is empty.
- Every provider failed → `503` with the same body, so the client still sees why.
- Invalid query → `400`.

Final error → status mapping, done in the orchestrator:

| Final error | Status |
|---|---|
| `TimeoutError` (attempt or budget), deadline abort | `timeout` |
| `CircuitOpenError` | `circuit_open` |
| `BulkheadRejectedError` | `rejected` |
| Anything else | `failed` |

### Errors

```ts
// hotel-search/domain/provider-errors.ts
export abstract class ProviderError extends Error {
  constructor(readonly provider: string, message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
export class ProviderUnavailableError extends ProviderError {}      // 5xx, connection reset
export class ProviderRateLimitedError extends ProviderError {        // 429
  constructor(provider: string, readonly retryAfterMs: number | undefined, message: string) {
    super(provider, message);
  }
}
export class InvalidProviderRequestError extends ProviderError {}   // 4xx: our bug
export class ProviderResponseError extends ProviderError {}         // malformed response

// resilience/resilience-errors.ts
export class TimeoutError extends Error {}
export class CircuitOpenError extends Error {}
export class BulkheadRejectedError extends Error {}
```

Classification lives in **one** table (`providers/composition/error-classification.ts`),
not in the error classes and not in the policies:

| Error | Retryable | Counts as CB failure |
|---|---|---|
| `ProviderUnavailableError` | yes | yes |
| `TimeoutError` (attempt) | yes | yes |
| `ProviderRateLimitedError` | yes, after `retryAfterMs` if it fits the budget | **no**: provider is healthy, we are too fast |
| `ProviderResponseError` | no | yes: provider broke its contract |
| `InvalidProviderRequestError` | no | no: our fault |
| `CircuitOpenError` | no | no |
| `BulkheadRejectedError` | no | no: local overload, not provider health |
| Caller's signal already aborted (deadline) | no | **no**: the provider did not fail, we gave up |

### Resilience

```ts
// resilience/resilience-policy.ts
export interface ResiliencePolicy {
  execute<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T>;
}

// resilience/backoff.strategy.ts   ← the one deliberate Strategy in the project
export interface BackoffStrategy {
  delayMs(attempt: number): number;  // attempt starts at 1
}
// FixedBackoff, ExponentialBackoff, ExponentialJitterBackoff(random = Math.random)

// providers/composition/policy-decorated-provider.ts   ← the Decorator
export class PolicyDecoratedProvider implements HotelProvider {
  constructor(private readonly inner: HotelProvider, private readonly policy: ResiliencePolicy) {}
  get name() { return this.inner.name; }
  search(request: HotelSearchRequest, ctx: ProviderCallContext) {
    return this.policy.execute((signal) => this.inner.search(request, { ...ctx, signal }), ctx.signal);
  }
}
```

### Simulation

```ts
// providers/simulation/fault-scenario.ts
export type FaultScenario =
  | { kind: 'ok' }
  | { kind: 'fail'; error: 'unavailable' | 'rate-limited' | 'bad-request' | 'malformed' }
  | { kind: 'fail-first-n'; n: number }       // retry experiments
  | { kind: 'down-for'; durationMs: number }  // circuit breaker recovery experiments
  | { kind: 'hang' };                         // never resolves unless aborted

export interface SimulationConfig {
  latencyMs: number;
  scenario: FaultScenario;
  honorsAbort: boolean;   // false = "rogue" client, used in the Bulkhead stage
}
```

No `Math.random()` in scenarios. Every experiment and test is reproducible.

### Mock provider raw shapes (intentionally different)

| | Provider A | Provider B | Provider C |
|---|---|---|---|
| Request | `{ city, checkIn, checkOut, guests }` | `{ destination: { cityCode }, stay: { from, nights }, occupancy: { adults } }` | `{ loc, d1, d2, pax }` |
| Response | `{ results: [{ id, hotel_name, price: { amount: "129.00", currency: "EUR" } }] }` | `{ data: { hotels: [{ code, title, rates: [{ totalCents: 12900, cur: "eur" }] }] } }` | `{ status: "OK", payload: [["C-001", "Hotel Name", 129.0, "EUR"]] }` |
| Errors | throws `{ httpStatus, body }` | throws `{ errorCode: "B-503" }` | returns `{ status: "ERROR", code: "RATE_LIMIT" }` **inside a success response** |
| Normal latency | 300 ms | 700 ms | 1500 ms |

Each difference gives the adapter/mapper real work: string decimal vs cents vs float,
lower-case currency, multiple rates per hotel (mapper picks the cheapest), tuple
payloads, and errors hidden inside successful responses.

---

## 6. Dependency Relationships

```text
hotel-search.controller ──► search-orchestrator ──► domain  ◄── providers/*
                                                      ▲            │
                                                      │            ▼
                                                      │       resilience
                                                      │
                          providers.module provides HOTEL_PROVIDERS (HotelProvider[])
```

Rules:

1. `domain/` imports nothing from the project.
2. `search-orchestrator` imports only `domain/` and `resilience/resilience-errors.ts`
   (for status mapping).
3. Nothing outside `providers/provider-x/` imports `provider-x.types.ts`.
4. `resilience/` imports nothing from the project and nothing from NestJS.
5. The orchestrator receives providers only through the `HOTEL_PROVIDERS` token.

NestJS wiring:

```ts
// Stage 2–7
{ provide: HOTEL_PROVIDERS, useFactory: (a, b, c) => [a, b, c], inject: [AAdapter, BAdapter, CAdapter] }

// Stage 8+
{
  provide: HOTEL_PROVIDERS,
  useFactory: (a, b, c, factory: ResilientProviderFactory) => [
    factory.create(a, providerConfig.a.resilience),
    factory.create(b, providerConfig.b.resilience),
    factory.create(c, providerConfig.c.resilience),
  ],
  inject: [AAdapter, BAdapter, CAdapter, ResilientProviderFactory],
}
```

Because these are singletons, each provider's circuit breaker and bulkhead state lives
exactly once per process.

---

## 7. Pattern-to-Component Mapping

Classification:

- **Required:** the current requirements fail without it.
- **Required by simulated failures:** only needed because we deliberately simulate
  failures. With real APIs these would move to "Required".
- **Structural:** not a feature by itself; needed to keep the other patterns clean.
- **Learning:** cheap and educational, not strictly needed.
- **Not built:** no current requirement justifies it.

| Pattern | Component | Class | Problem it solves | Main tradeoff |
|---|---|---|---|---|
| Adapter | `ProviderXAdapter` + mapper | Required | 3 incompatible APIs | One more layer per provider |
| Facade / Orchestrator | `SearchOrchestrator` | Required | Controller should not know about fan-out | Can grow into a god class if policies leak in (Stage 7 shows this) |
| Scatter-Gather | `SearchOrchestrator` | Required | Sequential latency = sum of all providers | Harder error handling; needs partial results |
| Partial Results | `allSettled` + `ProviderResult` | Required | One failure must not fail the search | Client must handle incomplete data |
| Timeout | `TimeoutPolicy` | Required | Provider C can hang | Too short = false failures; too long = slow search |
| Retry | `RetryPolicy` | Required by simulated failures | Transient failures lose results | Multiplies load; retry storms |
| Backoff Strategy | `BackoffStrategy` | Learning | Different delay algorithms | Almost none |
| Circuit Breaker | `CircuitBreakerPolicy` | Required by simulated failures | Wasting time and load on a dead provider | Tuning; can reject while the provider is already healthy again |
| Bulkhead | `BulkheadPolicy` | Required by simulated failures, **only under load** | One slow provider accumulating unbounded in-flight work | Rejects work that could have succeeded |
| Decorator | `PolicyDecoratedProvider` | Structural (Stage 8) | 4 policies tangled inside the orchestrator | Stack traces and debugging get deeper |
| Factory (composition) | `ResilientProviderFactory` | Structural (Stage 8) | Pipeline order must be defined in one place | One more indirection |
| Factory (selection) | — | Not built | No runtime provider selection | — |
| Registry | — | Not built | All providers always participate | — |

About Strategy: the three adapters are interchangeable through `HotelProvider`, but their
**primary intent is Adapter**. We do not claim "Strategy" just because an interface has
several implementations. `BackoffStrategy` is the explicit Strategy in this project.

---

## 8. Resilience Composition Order

Full reasoning, alternatives and consequences: [ADR 0001](adr/0001-resilience-pipeline-order.md).

```text
Budget Timeout           outermost; bounds the whole provider call (all retries + backoff)
  → Retry                attempts + backoff; stops when remaining budget cannot cover the delay
    → Circuit Breaker    sees every attempt; fails fast when OPEN
      → Bulkhead         each attempt acquires and releases its own slot
        → Attempt Timeout  bounds one attempt; aborts the inner signal
          → AttemptCounter metrics.attempts++
            → Adapter
```

This order is a **policy decision**, not a universally correct order. The key choice is
that the circuit breaker observes **attempts**, not logical operations.

### Retry details

- Max attempts: 3 (A, B), 2 (C).
- `ExponentialJitterBackoff`: base 100 ms, factor 2, cap 1000 ms, full jitter:
  `delay = random(0, min(cap, base × 2^(attempt-1)))`.
- The sleep is abort-aware: a deadline abort interrupts the backoff immediately.
- Before sleeping: if `remainingBudget <= delay`, stop and rethrow the last error.

Why not retry every error: a `400` will fail identically every time, so retrying only
adds load and latency. Retrying a dead provider multiplies its load by `maxAttempts` at
the worst possible moment. That is the retry storm Stage 7 demonstrates.

### Circuit breaker details

- Trips after **3 consecutive** counted failures (simplest to observe). A rolling
  failure-rate window is a documented alternative, not built.
- Cooldown (OPEN duration): 10 s, short enough for manual experiments.
- HALF_OPEN: allows **1** trial call. Other calls during HALF_OPEN get `CircuitOpenError`.
  Trial success → CLOSED. Trial failure → OPEN (new cooldown).
- Uncounted outcomes (see the classification table) are neither success nor failure.
- State: one instance per provider, in memory. With multiple app instances each replica
  would have its own view. That is acceptable here and noted as a limitation.

### Bulkhead details

| | A | B | C |
|---|---|---|---|
| Max concurrent | 5 | 10 | 3 |
| Max queued | 10 | 20 | 5 |

- Beyond `maxConcurrent + maxQueued` → `BulkheadRejectedError` immediately.
- Queued waiters are abort-aware: a deadline abort removes them from the queue.
- The slot is released in `finally`.

Why bulkhead matters in Node.js: there is no thread per request, so nothing naturally
caps concurrency. Every in-flight provider call still holds a socket, memory for its
closures and buffers, a timer, and a share of the provider's rate limit. A slow provider
turns incoming traffic into an ever-growing pile of pending promises and open sockets.
Once a shared resource such as the HTTP agent's socket pool or memory runs out, the healthy
providers suffer too. In Node a bulkhead is a semaphore that counts in-flight promises.

**Known limitation (demonstrated on purpose in Stage 10):** the slot is released when the
Attempt Timeout rejects. If the client ignores `AbortSignal`, the real work continues
after the slot is freed, so the bulkhead under-counts. `honorsAbort: false` reproduces this.

### Timeouts at three levels

| Level | Owner | Purpose | Example |
|---|---|---|---|
| Attempt timeout | Pipeline | Bound one call; make it retryable | A 800 · B 1200 · C 2000 ms |
| Provider budget | Pipeline (outermost) | Bound one provider including retries | 2500 ms each |
| Search deadline | Orchestrator | User-facing SLA; single cancel point | 3000 ms |

Invariant: `attempt timeout ≤ provider budget ≤ search deadline`. The budget timer combines
its own timer with the deadline signal, so whichever fires first wins. The orchestrator
never needs `Promise.race`: every layer rejects promptly when its incoming signal aborts,
even if the layer below ignores the signal.

### Latency measurement

- `performance.now()`, never `Date.now()` (monotonic clock).
- Per provider: measured in the orchestrator around the **whole pipeline**, which is what
  the user actually waits for. It includes queueing, retries and backoff.
- Whole search: `durationMs` in the response.
- Per-attempt latency: optional debug log in `AttemptCountingProvider`.

---

## 9. Tradeoffs

| Decision | Gain | Cost |
|---|---|---|
| Circuit breaker per attempt | Opens fast; stops retries mid-flight | Noisier; one bad operation can count up to 3 times |
| Bulkhead inside retry | No slot held during backoff | A retry can be rejected by the bulkhead after its first attempt was admitted |
| Generic `PolicyDecoratedProvider` + policy objects | One decorator class; policies testable without hotels | One level more abstract than one-class-per-concern decorators |
| Error classification in one table | Policies stay generic; the rules are visible | The table must be kept in sync with new error types |
| `503` when all providers fail | Client can't mistake an outage for "no hotels" | A different contract (200 + degraded flag) would also be valid |
| In-memory circuit breaker | Simple; no infra | Per-replica state |
| Build resilience ourselves | Deep understanding | Not production-hardened; compared with `cockatiel` at the end |
| Deterministic scenarios | Reproducible tests and experiments | Less "realistic" than random failures |

---

## 10. Potential Overengineering (deliberately avoided)

| Temptation | Why not now | Trigger to add it |
|---|---|---|
| Provider Registry | All providers always participate; `HotelProvider[]` via DI is enough | Runtime enable/disable, per-market selection, `getProviderByName`, health-based exclusion |
| Provider-selection Factory | Nothing to select | Providers chosen per request (market, user, tenant) |
| Clock abstraction | `jest.useFakeTimers()` already fakes `setTimeout` and `Date` | A timing path that fake timers cannot control |
| Ranking/merge Strategy | "Sort by price" is the whole requirement | A second ranking rule appears |
| `common/` folder | Everything has an owner | A genuinely ownerless shared item |
| `class-validator` / `@nestjs/config` | Four query params and static config | Real configuration management needs |
| Rolling-window circuit breaker | Consecutive failures are easier to observe | Low-traffic noise causing false trips |
| Distributed circuit breaker state | Single process | Multiple replicas that must agree |

---

## 11. Testing Strategy

| Level | What | How |
|---|---|---|
| Unit: mappers | Raw → `HotelOffer[]` for every quirk (cents, lower-case currency, tuples, multiple rates) | Plain inputs, no mocks |
| Unit: adapters | Error translation table per provider | Fake client that throws each raw error |
| Unit: policies | Timeout, retry (+ budget stop), backoff, circuit transitions, bulkhead queue/reject | `jest.useFakeTimers()` + `await jest.advanceTimersByTimeAsync()`; injected `random` for jitter |
| Integration: orchestrator | Partial results, status mapping, 503 rule, deadline | Scripted fake `HotelProvider`s |
| Integration: pipeline | Interactions (see below) | Factory-built pipeline over mock clients with scenarios |
| E2E | `GET /hotels/search` contract | `supertest` |
| Experiments | Load behavior | `autocannon` scripts in `experiments/`; not part of `pnpm test` |

Interaction tests that matter most:

1. The circuit opens mid-retry → the remaining attempts fail fast and retry stops.
2. The bulkhead holds **zero** slots for a provider during backoff sleep.
3. A deadline abort is **not** counted as a circuit breaker failure.
4. A rate-limited response retries without tripping the circuit.
5. Retry stops when the remaining budget cannot cover the next backoff delay.

Fake timer notes:

- Use `setTimeout` + `AbortController`, not `AbortSignal.timeout()`. The latter is
  not reliably controlled by fake timers.
- Stage 5–7 orchestrator integration tests act as **characterization tests** for the
  Stage 8 refactor: they must pass unchanged afterwards.

---

## 12. Incremental Implementation Plan

Each stage follows: **build → observe the problem → next stage fixes it.**
Estimates assume one focused session per stage.

| # | Stage | Build | Observe (the problem that motivates the next stage) | Est. |
|---|---|---|---|---|
| 1 | Mock clients | 3 clients with raw shapes, latency, `ok`/`fail` scenarios, stats | Three incompatible shapes; nothing can consume them uniformly | 45 min |
| 2 | Adapters | Domain model, `HotelProvider`, mappers, adapters, `HOTEL_PROVIDERS` | No raw type escapes `provider-x/` | 60 min |
| 3 | Sequential search | Controller, orchestrator (`for…await`), latency per provider | Total ≈ 300 + 700 + 1500 = **2.5 s** | 45 min |
| 4 | Scatter-Gather | `Promise.all` | Total ≈ **1.5 s**; set B to `fail` → the whole search returns 500 | 20 min |
| 5 | Partial results | `allSettled`, `ProviderResult`, 503 rule, characterization tests | Set C to `hang` → the search never finishes | 45 min |
| 6 | Timeout | Per-provider timeout + `AbortController` **in the orchestrator** | C is cut off ✔. Set A to `fail-first-n: 1` → A lost although a retry would succeed. With `honorsAbort: false`, C's `inFlight` stays up after the timeout | 60 min |
| 7 | Retry | Retry + `BackoffStrategy` **in the orchestrator** (deliberately) | Orchestrator now mixes 3 concerns. B `fail` → every search makes 3 calls to a dead provider (retry storm, visible in stats) | 60 min |
| 8 | Decorators | Policies, `PolicyDecoratedProvider`, `AttemptCountingProvider`, error classification, budget timeout, `ResilientProviderFactory`. Orchestrator back to pure scatter-gather | Same behavior, characterization tests pass. Retry storm still there | 90 min |
| 9 | Circuit breaker | `CircuitBreakerPolicy`; dev `SimulationController` to switch scenarios at runtime | B `down-for: 20s` → after 3 failures: `circuit_open`, 0 attempts, ~1 ms. After cooldown: HALF_OPEN trial → CLOSED | 90 min |
| 10 | Bulkhead | `BulkheadPolicy`; `autocannon` script | Before: 100 concurrent + slow C → C `inFlight` ≈ 100. After: ≤ 3 running, 5 queued, rest `rejected`. Rogue client: real `inFlight` > 3 | 90 min |
| 11 | Deadline | Search deadline, propagation through all layers; optional abort on client disconnect | Budget > deadline experiments; retries stop at deadline; circuit breaker ignores deadline aborts | 60 min |
| 12 | Experiments | Failure matrix in `experiments/README.md`; compare policies with `cockatiel` | What a library does differently, and why | 90 min |

Total: roughly 13 hours.

Why this order differs from the original draft:

- **Decorators move from Stage 10 to Stage 8.** Timeout and retry live in the orchestrator
  first (Stages 6–7), so the tangle is felt. The refactor happens *before* the circuit breaker
  because the circuit breaker needs per-provider state, and a decorator instance per
  provider is its natural home. Waiting until Stage 10 would mean writing the circuit breaker
  and bulkhead in the wrong place and then rewriting them.
- **Retry stays before Circuit Breaker.** The retry storm against a dead provider is exactly
  the problem that justifies a circuit breaker.
- **Deadline gets its own stage (11).** Per-provider timeouts and the user-facing deadline
  solve different problems, and their interaction with retry and the circuit breaker is where
  the subtle bugs live.
- **Registry is not a stage.** It is added only if a trigger from §10 appears.
