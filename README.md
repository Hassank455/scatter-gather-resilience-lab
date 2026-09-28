# Scatter-Gather Resilience Lab

A NestJS hotel search that queries several simulated providers **in parallel** and merges their results, built one stage at a time to learn **why** each resilience pattern exists.

Every stage follows the same loop:

```text
build → observe the problem → introduce the pattern that solves it → observe the improvement
```

No real external APIs and no caching: the providers are simulated in-process, so every failure is reproducible.

---

## The scenario

```text
                    GET /hotels/search
                            │
                            ▼
                  Search Orchestrator
                            │
                         Scatter
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
         Provider A    Provider B    Provider C
           300 ms        700 ms        1500 ms
              └─────────────┼─────────────┘
                          Gather
                            │
                            ▼
              Offers + status of every provider
```

The three providers are deliberately incompatible, so that the Adapter pattern has real work to do:

| | Provider A | Provider B | Provider C |
|---|---|---|---|
| City in request | name (`Amman`) | IATA code (`AMM`) | numeric id (`1001`) |
| Price | decimal string, whole stay | integer cents, several rates | float, **per night** |
| Errors | throws with an HTTP status | throws its own codes (`B-503`) | returns `status: "ERROR"` **inside a successful response** |

---

## Progress

| # | Stage | Problem it answers | Status |
|---|---|---|---|
| 1 | Mock providers | Three APIs with incompatible shapes | ✅ |
| 2 | Adapters + common interface | How can one loop talk to all of them? | ✅ |
| 3 | Sequential search | Why is it slow? (latency = **sum**) | ✅ |
| 4 | Scatter-Gather | Latency = **slowest** provider, but one failure kills everything | ✅ |
| 5 | Partial results | One failure no longer fails the search, but a hanging provider still blocks it | ✅ |
| 6 | Timeout + AbortController | | ⏳ next |
| 7 | Retry with backoff | | |
| 8 | Decorator composition | | |
| 9 | Circuit Breaker | | |
| 10 | Bulkhead | | |
| 11 | Search deadline | | |
| 12 | Failure experiments | | |

Measured on the real app: sequential search **2507 ms**, scatter-gather **1503 ms**.

---

## Quick start

Requires Node.js and pnpm.

```bash
pnpm install
pnpm start:dev
```

Then:

```bash
curl -s "localhost:3000/hotels/search?city=Amman&checkIn=2026-10-01&checkOut=2026-10-03&guests=2"
```

Example response with Provider B down (trimmed):

```json
{
  "offers": [
    { "provider": "C", "hotelId": "C-9002", "name": "The House Boutique", "price": 140, "currency": "EUR" },
    { "provider": "A", "hotelId": "A-101", "name": "Amman Rotana", "price": 190, "currency": "EUR" }
  ],
  "providers": [
    { "name": "A", "status": "success", "latencyMs": 301 },
    { "name": "B", "status": "failed", "latencyMs": 701, "error": "[B] Provider B failed with B-503" },
    { "name": "C", "status": "success", "latencyMs": 1502 }
  ],
  "durationMs": 1502
}
```

HTTP semantics (a policy of this project):

| Situation | Status |
|---|---|
| At least one provider succeeded | `200`, even with no offers |
| Every provider failed | `503`, same body, so the client can see why |
| Invalid query | `400` |

---

## Running experiments

Each provider's behavior is set in [`src/providers/provider-config.ts`](src/providers/provider-config.ts):

```ts
b: { simulation: { latencyMs: 700, scenario: { kind: 'fail', error: 'unavailable' } } },
```

| Scenario | Effect |
|---|---|
| `{ kind: 'ok' }` | Answers after `latencyMs` |
| `{ kind: 'fail', error: 'unavailable' \| 'rate-limited' \| 'bad-request' \| 'malformed' }` | Fails in that provider's own raw format |
| `{ kind: 'hang' }` | Never answers unless aborted |

Scenarios are deterministic (no randomness), so every run gives the same result.

Stand-alone scripts that show a stage's problem live in [`experiments/`](experiments/):

```bash
npx ts-node experiments/stage-1-raw-responses.ts   # three incompatible raw responses
npx ts-node experiments/stage-2-unified-offers.ts  # the same data behind one interface
```

---

## Tests

```bash
pnpm test        # unit tests: adapters, error translation, orchestrator behavior
pnpm test:e2e    # the real app over HTTP, including the 503 policy
```

Some orchestrator tests document the **current weakness** on purpose and get flipped by the next stage. For example, "waits forever for a provider that never answers" becomes a timeout test in Stage 6.

---

## Project structure

```text
src/
├── hotel-search/            # the use case
│   ├── domain/              # HotelOffer, HotelProvider port, errors; depends on nothing
│   ├── search-orchestrator.ts
│   ├── hotel-search.controller.ts
│   └── search-request.parser.ts
└── providers/               # integration with the (simulated) outside world
    ├── provider-a/          # raw types, mock client, mapper, adapter
    ├── provider-b/
    ├── provider-c/
    ├── simulation/          # latency, fault scenarios, call statistics
    ├── provider-config.ts
    └── providers.module.ts  # wires all adapters into HOTEL_PROVIDERS
```

The orchestrator never imports an adapter. It receives `HotelProvider[]` through the `HOTEL_PROVIDERS` DI token, so a provider can be added or replaced without touching it.

---

## Documentation

| Document | Content |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full design: components, interfaces, dependencies, testing strategy, the 12-stage plan |
| [ADR 0001](docs/adr/0001-resilience-pipeline-order.md) | Why the resilience layers are ordered the way they are, and the alternatives rejected |
| [Design patterns](docs/design-patterns-for-the-scatter-gather.md) | Each pattern: purpose, usage here, tradeoffs, and whether it is required or only for learning |
| [Decorator pattern](docs/decorator-pattern.md) | Background on the Decorator pattern |
| [Bulkhead pattern](docs/bulkhead-pattern.md) | Background on the Bulkhead pattern |

---

## Out of scope

- Real provider APIs
- Caching
- Deduplicating the same hotel across providers (a `hotelId` is only unique within its provider)
- Currency conversion (all mock providers price in EUR)
- Provider Registry and provider-selection Factory: every provider joins every search, so nothing needs selecting yet
