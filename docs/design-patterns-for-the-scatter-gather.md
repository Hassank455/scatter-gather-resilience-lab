# Design Patterns for the Scatter-Gather Hotel Search Project

## 1. Adapter Pattern

**Purpose:**
Provide a common interface for multiple external providers that have different APIs, request formats, and response structures.

**Usage in Our Project:**
Each hotel provider will have its own adapter that implements a common `HotelProvider` interface.

Example:

```text
Provider A API → ProviderAAdapter ─┐
Provider B API → ProviderBAdapter ─┼→ HotelProvider
Provider C API → ProviderCAdapter ─┘
```

The adapters convert provider-specific responses into our unified internal model:

```text
HotelOffer
```

**Benefit:**
The rest of the application does not need to understand provider-specific APIs or data structures.

---

## 2. Strategy Pattern

**Purpose:**
Allow multiple interchangeable algorithms for the same behavior, selected by the client.

**What is NOT Strategy in our project:**
The provider adapters are interchangeable through `HotelProvider`:

```text
HotelProvider
    |
    ├── ProviderAAdapter
    ├── ProviderBAdapter
    └── ProviderCAdapter
```

But their **primary intent is Adapter**: each one exists to translate a different external API into our contract. We do not claim "Strategy" just because an interface has several implementations. The same structure can serve different patterns. What names the pattern is the intent.

**Usage in Our Project:**
The explicit Strategy is the retry backoff algorithm:

```ts
interface BackoffStrategy {
  delayMs(attempt: number): number;
}
```

```text
          BackoffStrategy
               │
       ┌───────┼──────────────┐
       ↓       ↓              ↓
     Fixed  Exponential  ExponentialJitter
```

The Retry policy asks the strategy for the next delay without knowing which algorithm it uses.

**Benefit:**
Backoff algorithms can be swapped and compared in experiments without changing the Retry policy.

**Classification:**
Learning. It is small and cheap, but not strictly required.

---

## 3. Scatter-Gather Pattern

**Purpose:**
Execute multiple independent operations concurrently and aggregate their results.

**Usage in Our Project:**

```text
                  Search Request
                        |
                     Scatter
              /          |          \
             v           v           v
        Provider A   Provider B   Provider C
              \          |          /
                     Gather
                        |
                 Unified Results
```

All providers are queried concurrently.

In Node.js, this can be implemented using mechanisms such as:

```text
Promise.allSettled()
```

**Benefit:**
The total search latency is much lower than executing providers sequentially.

It also allows us to return partial results when some providers fail.

---

## 4. Orchestrator / Facade

**Purpose:**
Coordinate the complete search workflow while hiding its internal complexity from the Controller.

**Usage in Our Project:**

The `SearchOrchestrator` will coordinate:

```text
Receive Search Request
        ↓
Call Providers
        ↓
Scatter
        ↓
Gather
        ↓
Handle Partial Results
        ↓
Merge Results
        ↓
Return Response
```

The Controller should only need to call something similar to:

```text
searchOrchestrator.search()
```

**Benefit:**
Keeps orchestration logic out of the HTTP layer and provides a clear separation of responsibilities.

**Risk:**
The orchestrator can grow into a god class if resilience logic leaks into it. Stage 7 shows this on purpose, and Stage 8 moves that logic into decorators.

---

## 5. Factory Pattern

**Purpose:**
Centralize the construction of objects, or the selection of an implementation, in one place.

A Factory can do two different jobs, and only one of them is justified in our project.

### Selection Factory (not built)

```text
getProvider(PROVIDER_A)
```

This picks which provider to use at runtime. We do not need it: every search calls every provider, and NestJS DI already gives the orchestrator all of them as `HotelProvider[]`.

It becomes justified when provider selection becomes dynamic:

```text
Market A → Provider A + B
Market B → Provider A + C
```

### Composition Factory (built in Stage 8)

```ts
resilientProviderFactory.create(providerAAdapter, {
  attemptTimeoutMs: 800,
  maxAttempts: 3,
  bulkhead: { maxConcurrent: 5, maxQueued: 10 },
});
```

This does not choose a provider. It **assembles** one: it wraps an adapter in its resilience decorators in the agreed order.

**Benefit:**
The pipeline order is defined in exactly one place, so no provider can be wired in a different order by accident.

**Tradeoff:**
One more indirection between the DI module and the adapter.

**Classification:**
Structural. It becomes necessary once decorators exist (Stage 8).

---

## 6. Provider Registry

**Purpose:**
Maintain and provide access to the available provider implementations.

**Usage in Our Project:**

The Registry can maintain something conceptually similar to:

```text
Provider Registry

Provider A → registered
Provider B → registered
Provider C → registered
```

It can expose operations such as:

```text
getAll()
getByName()
getEnabled()
```

The Orchestrator could request all currently enabled providers from the Registry before performing Scatter-Gather.

**Current Project Usage:**
**Not built.** All providers participate in every search, so the orchestrator receives them directly through NestJS DI (`HOTEL_PROVIDERS` → `HotelProvider[]`).

We add a Registry only when one of these requirements appears:

- Providers enabled/disabled at runtime
- Providers selected per market or user
- Lookup by name (`getByName()`)
- Excluding unhealthy providers, or a `/providers/health` endpoint

**Benefit:**
Useful when the number of providers grows or providers can be dynamically enabled/disabled.

**Tradeoff:**
For only a few static providers, it introduces additional complexity.

---

## 7. Decorator Pattern

**Purpose:**
Add behavior around a provider without modifying the provider's core implementation.

**Usage in Our Project:**

Instead of putting every resilience concern inside an adapter:

```text
ProviderAdapter
    ├── timeout
    ├── retry
    ├── logging
    ├── metrics
    └── provider logic
```

we can compose behaviors:

```text
Budget Timeout
       ↓
Retry
       ↓
Circuit Breaker
       ↓
Bulkhead
       ↓
Attempt Timeout
       ↓
AttemptCounter
       ↓
ProviderAdapter
```

Each layer remains responsible for one concern.

**The order is a policy decision, not a universal truth.** For example, placing Retry outside the Circuit Breaker means the breaker sees every attempt, not just the final outcome. The reasoning and the rejected alternatives are in [ADR 0001](adr/0001-resilience-pipeline-order.md).

**Implementation:**
A single generic `PolicyDecoratedProvider` wraps a `HotelProvider` with one resilience policy. Stacking several of them builds the chain above. The policies themselves (in `resilience/`) know nothing about hotels.

**Benefit:**
Improves separation of concerns and allows resilience behaviors to be reused across providers.

**Tradeoff:**
Deeper stack traces, and the order becomes an invisible but important behavior.

---

# Resilience Patterns

## 8. Timeout Pattern

**Purpose:**
Prevent a slow provider from delaying the entire search indefinitely.

**Example:**

```text
Provider A → 300 ms  ✓
Provider B → 700 ms  ✓
Provider C → 5000 ms

Timeout → 2000 ms
```

Provider C should be treated as timed out instead of forcing the complete request to wait five seconds.

Result:

```text
Provider A ✓
Provider B ✓
Provider C TIMEOUT

→ Return partial results from A + B
```

**Timeout exists at three levels, each for a different purpose:**

| Level | Purpose |
|---|---|
| Attempt timeout | Bound one call and make it retryable |
| Provider budget | Bound one provider, including all retries and backoff |
| Search deadline | User-facing limit for the whole search |

**Cancellation:**
`Promise.race()` with a timer only stops *waiting*. The underlying operation keeps running. Every timeout therefore aborts an `AbortController`, and every provider call receives the `AbortSignal` so it can actually stop.

**Benefit:**
Protects overall system latency from slow dependencies.

---

## 9. Retry Pattern

**Purpose:**
Recover from temporary/transient failures.

**Usage in Our Project:**

```text
Provider Request
      ↓
    Failure
      ↓
Wait 100 ms
      ↓
Retry
      ↓
Success
```

We use exponential backoff with **jitter** (random delay up to the exponential limit):

```text
Attempt 1 fails → wait random(0, 100 ms)
Attempt 2 fails → wait random(0, 200 ms)
Attempt 3 fails → give up
```

Without jitter, many clients that failed at the same moment retry at the same moment too, and hit the provider together again.

**Benefit:**
Temporary network or provider failures do not immediately cause the provider request to fail.

**Important:**
Retries must be bounded and should only be used for errors that are actually retryable.

| Retryable | Not retryable |
|---|---|
| 5xx, connection reset | 4xx (our request is wrong) |
| Attempt timeout | Malformed provider response |
| 429, after `Retry-After` | Circuit open, bulkhead rejected |
| | Search deadline reached |

Retry also stops when the remaining provider budget cannot cover the next delay.

Retrying every error is dangerous: a dead provider receives `maxAttempts` times more load exactly when it is weakest (a retry storm).

---

## 10. Circuit Breaker Pattern

**Purpose:**
Stop repeatedly calling a provider that is continuously failing.

**States:**

```text
CLOSED
   ↓
Too many failures
   ↓
OPEN
   ↓
Requests fail fast
   ↓
Cooldown period
   ↓
HALF_OPEN
   ↓
One trial request
   ↓
Success → CLOSED
Failure → OPEN
```

**Usage in Our Project:**

If Provider C repeatedly fails, the system temporarily stops calling it.

- Opens after 3 consecutive failures; cooldown 10 s.
- Counts provider-health failures only (5xx, timeout, malformed response). A 4xx, a 429, a bulkhead rejection, or a search-deadline abort is **not** the provider's fault and is not counted.
- One breaker instance per provider, kept in memory.

**Benefit:**
Prevents wasting resources on an unhealthy dependency and reduces cascading failures.

---

## 11. Bulkhead Pattern

**Purpose:**
Isolate resources so that problems with one provider cannot consume all resources available to the system.

The name comes from ship compartments:

```text
┌────────────┬────────────┬────────────┐
│ Provider A │ Provider B │ Provider C │
└────────────┴────────────┴────────────┘
```

For example:

```text
Provider A → max 5 concurrent, 10 queued
Provider B → max 10 concurrent, 20 queued
Provider C → max 3 concurrent, 5 queued
```

If Provider A becomes extremely slow, it cannot consume unlimited concurrency and negatively affect all other providers.

The effect is invisible with one request at a time. It only shows under concurrent load, which is why Stage 10 uses a load-testing script.

**Limitation:**
The bulkhead can only count work that actually stops when aborted. If a client ignores the `AbortSignal`, the real concurrency is higher than the bulkhead thinks. See [ADR 0001](adr/0001-resilience-pipeline-order.md#known-limitation).

**Benefit:**
Provides fault isolation and protects the overall system from resource exhaustion caused by one dependency.

---

# Supporting Concept: Partial Results

Partial Results is an important behavior of our Scatter-Gather implementation.

The failure of one provider should not necessarily cause the entire search to fail.

Example:

```text
Provider A → SUCCESS
Provider B → FAILURE
Provider C → SUCCESS
```

Instead of:

```text
Entire Search → FAILURE
```

we want:

```text
Search → SUCCESS

Results:
Provider A ✓
Provider C ✓

Provider B ✗
```

This is one reason `Promise.allSettled()` is interesting for this project.

The response also says **why** each provider is missing, so the client can tell "no hotels found" from "providers are down":

```json
{
  "offers": [],
  "providers": [
    { "name": "A", "status": "success", "latencyMs": 320, "attempts": 1 },
    { "name": "B", "status": "failed", "latencyMs": 840, "attempts": 3 },
    { "name": "C", "status": "circuit_open", "latencyMs": 1, "attempts": 0 }
  ],
  "durationMs": 845
}
```

If every provider fails, the API returns `503` with the same body. This is a policy of this project, not a universal rule.

---

# Complete Conceptual Architecture

```text
                         Client
                            |
                            v
                     Search Controller
                            |
                            v
                    Search Orchestrator  ── search deadline
                            |
                     Scatter (allSettled)
              +-------------+-------------+
              |             |             |
              v             v             v
        Budget Timeout Budget Timeout Budget Timeout
              |             |             |
            Retry         Retry         Retry
              |             |             |
        Circuit Breaker Circuit Breaker Circuit Breaker
              |             |             |
           Bulkhead      Bulkhead      Bulkhead
              |             |             |
       Attempt Timeout Attempt Timeout Attempt Timeout
              |             |             |
          Provider A    Provider B    Provider C
           Adapter       Adapter       Adapter
              |             |             |
          Mock Client   Mock Client   Mock Client
              |             |             |
              +-------------+-------------+
                            |
                         Gather
                            |
                            v
                Offers + per-provider status
```

There is no Provider Registry in this diagram: the orchestrator receives `HotelProvider[]` from NestJS DI. Each column is one pipeline built by `ResilientProviderFactory`.

Full details: [ARCHITECTURE.md](ARCHITECTURE.md).

# Patterns We Will Practice

| Pattern               | Main Responsibility                                            | Status                              |
| --------------------- | -------------------------------------------------------------- | ----------------------------------- |
| Adapter               | Normalize different provider APIs                              | Required                            |
| Scatter-Gather        | Execute providers concurrently and aggregate results           | Required                            |
| Orchestrator / Facade | Coordinate the search workflow                                 | Required                            |
| Partial Results       | Return successful results despite individual provider failures | Required                            |
| Timeout               | Bound provider execution time                                  | Required                            |
| Retry                 | Recover from transient failures                                | Required by simulated failures      |
| Circuit Breaker       | Stop calling unhealthy providers                               | Required by simulated failures      |
| Bulkhead              | Isolate resources and concurrency                              | Required by simulated failures, under load |
| Decorator             | Add reusable behavior around providers                         | Structural (Stage 8)                |
| Factory (composition) | Assemble each resilience pipeline in one fixed order           | Structural (Stage 8)                |
| Strategy (backoff)    | Interchangeable backoff algorithms for Retry                   | Learning                            |
| Factory (selection)   | Select providers at runtime                                    | Not built                           |
| Registry              | Manage available/enabled providers                             | Not built                           |

## Learning Principle

The goal is not simply to add as many patterns as possible.

For every pattern we implement, we should be able to answer:

1. What problem existed before introducing this pattern?
2. Why does this pattern solve that problem?
3. What complexity does the pattern introduce?
4. What would happen if we removed it?
5. When would this pattern be unnecessary in a real production system?

The project should demonstrate both the **benefits and tradeoffs** of each pattern.
