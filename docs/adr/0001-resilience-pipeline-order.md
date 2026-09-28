# ADR 0001: Resilience Pipeline Order

Status: **Proposed**

## Context

Each provider call is wrapped by five concerns: budget timeout, retry, circuit breaker,
bulkhead, and attempt timeout. The order changes behavior, not just structure. There is no
universally correct order. It is a policy decision about what each layer *observes*.

The initial draft was:

```text
Bulkhead → Circuit Breaker → Retry → Timeout → Adapter
```

## Decision

```text
Budget Timeout → Retry → Circuit Breaker → Bulkhead → Attempt Timeout → AttemptCounter → Adapter
```

## Consequences, boundary by boundary

| Boundary | Consequence |
|---|---|
| Budget Timeout outside Retry | Worst case is bounded: `budget`, not `attempts × timeout + Σ backoff`. |
| Retry outside Circuit Breaker | The circuit breaker sees **each attempt**. If it opens mid-retry, the next attempt gets `CircuitOpenError` (non-retryable) and retry stops. |
| Retry outside Bulkhead | Each attempt acquires and releases its own slot. **No slot is held during backoff sleep.** |
| Circuit Breaker outside Bulkhead | When OPEN, calls fail fast without waiting in the bulkhead queue. `BulkheadRejectedError` passes through the circuit breaker and is **not** counted as a provider failure. |
| Attempt Timeout inside Bulkhead | The timeout measures provider time, not queue time. Queue time is bounded by the budget. |
| AttemptCounter innermost | `attempts` counts real adapter invocations. Circuit-open and bulkhead-rejected calls report 0. |

## Alternatives considered

**Circuit Breaker outside Retry** (`CB → Retry → …`). The circuit breaker counts a *logical
operation* as one failure only after retries are exhausted. It is less noisy and a valid
choice when single-attempt blips are expected. Rejected here because retries keep hitting a
dead provider before the circuit breaker notices, and this project wants that interaction
to be visible.

**Bulkhead outside Retry** (`Bulkhead → … → Retry`). This caps concurrent *logical
operations* rather than attempts, and a retrying call never gets rejected halfway. Rejected
because the slot sits idle during backoff sleep, which wastes capacity when it is scarcest.

**Bulkhead outside Circuit Breaker.** The circuit breaker would never see bulkhead rejections
(no classification needed). Rejected because calls during OPEN would still queue for a slot
just to be rejected.

## Known limitation

The bulkhead releases its slot when the Attempt Timeout rejects. If the client ignores
`AbortSignal`, the underlying work continues and the bulkhead under-counts real concurrency.
Accepted: it is demonstrated deliberately in Stage 10 with `honorsAbort: false`.
