# Bulkhead Pattern

## What is Bulkhead?

The **Bulkhead Pattern** is a resilience pattern used to isolate resources between different dependencies or workloads.

The main idea is:

> Limit how much concurrency one dependency can consume, so a slow or overloaded dependency cannot affect the entire system.

The name comes from ships, where the ship is divided into separate compartments. If one compartment floods, the others can continue working.

---

## Concurrency

**Concurrency** means how many operations are in progress at the same time.

Example:

```text
Provider A → 100 requests in-flight
Provider B → 100 requests in-flight
Provider C → 100 requests in-flight
```

Even though Node.js uses a single JavaScript thread, it can have many asynchronous I/O operations in-flight at the same time.

These operations still consume resources such as:

- Memory
- Network sockets
- HTTP connections
- Buffers
- Timers
- API quota
- Connection pool capacity

---

## The Problem

Imagine our hotel search uses three providers:

```text
Search
 ├── Provider A
 ├── Provider B
 └── Provider C
```

Normally:

```text
A → 300ms
B → 500ms
C → 400ms
```

But Provider C becomes very slow:

```text
C → 10 seconds
```

If many users search at the same time, requests to C can accumulate:

```text
1000 searches
     ↓
1000 slow requests to Provider C
     ↓
More sockets + memory + pending operations
     ↓
System degradation
```

---

## Solution: Bulkhead

Give each provider its own concurrency limit:

```text
Provider A → max concurrency = 100
Provider B → max concurrency = 100
Provider C → max concurrency = 30
```

Now Provider C can have only 30 operations in-flight:

```text
Provider C Bulkhead

Request 1  → Running
Request 2  → Running
...
Request 30 → Running

Request 31 → Queue or Reject
```

A problem with Provider C is now isolated and cannot consume unlimited resources.

---

## Concurrency Limit vs Queue Limit

### Concurrency Limit

```text
max concurrency = 3
```

Only three operations can execute at the same time:

```text
1 → Running
2 → Running
3 → Running
```

### Queue Limit

When all concurrency slots are occupied, some requests may wait:

```text
Concurrency = 3
Queue Size  = 5

Running:
1 2 3

Waiting:
4 5 6 7 8

Request 9 → Reject
```

The queue should also be bounded.

An unlimited queue only moves the problem from:

```text
Unlimited running operations
```

to:

```text
Unlimited waiting operations
```

---

## Bulkhead vs Other Patterns

### Bulkhead

Controls:

> How many operations can use this dependency at the same time?

```text
Provider C → max 30 concurrent operations
```

### Timeout

Controls:

> How long can one operation run?

```text
Provider C → max 2 seconds
```

### Circuit Breaker

Controls:

> Should we continue calling this unhealthy provider?

```text
Too many failures
      ↓
Circuit OPEN
      ↓
Stop calling provider temporarily
```

### Rate Limiting

Controls:

> How many requests are allowed during a period of time?

```text
100 requests / second
```

Rate limiting and concurrency limiting solve different problems.

---

## In Our Hotel Search Project

Without Bulkhead:

```text
Many Searches
     ↓
Scatter-Gather
  /    |     \
 A     B      C (slow)
              ↓
       Thousands pending
              ↓
      Resource exhaustion
```

With Bulkhead:

```text
Many Searches
     ↓
Scatter-Gather
  /    |     \
 A     B      C (slow)
              ↓
        Bulkhead
        max = 30
              ↓
      30 operations allowed
              ↓
     Extra requests
        Queue / Reject
```

---

## Key Takeaway

> **Bulkhead isolates failures and resource usage by limiting how much concurrency one dependency or workload can consume.**

For our project:

> **Each hotel provider gets its own concurrency boundary, so a slow provider cannot consume unlimited application resources and negatively affect the other providers.**
