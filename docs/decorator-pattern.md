# Decorator Pattern

## What is the Decorator Pattern?

The **Decorator Pattern** is a **Structural Design Pattern**.

It allows us to add new behavior or functionality to an object **without modifying the original class**.

> **Decorator Pattern dynamically adds responsibilities to an object by wrapping it, without modifying the original class.**

---

## The Problem

Imagine we have a flight search service:

```ts
interface FlightSearchService {
  search(params: SearchParams): Promise<Flight[]>;
}
```

And a basic implementation:

```ts
class BasicFlightSearchService implements FlightSearchService {
  async search(params: SearchParams): Promise<Flight[]> {
    console.log('Searching flights...');

    return [];
  }
}
```

Later, we want to add:

- Logging
- Metrics
- Retry
- Caching
- Tracing

We could put all of these inside `BasicFlightSearchService`, but then the class would have too many responsibilities.

Instead, we can use **Decorators**.

---

## Logging Decorator

```ts
class LoggingFlightSearchDecorator implements FlightSearchService {
  constructor(
    private readonly inner: FlightSearchService
  ) {}

  async search(params: SearchParams): Promise<Flight[]> {
    console.log('Search started');

    const result = await this.inner.search(params);

    console.log('Search finished');

    return result;
  }
}
```

The important part is:

```ts
this.inner.search(params);
```

The decorator does not perform the actual search.

It adds its own behavior and then delegates the real work to the wrapped object.

---

## Metrics Decorator

```ts
class MetricsFlightSearchDecorator implements FlightSearchService {
  constructor(
    private readonly inner: FlightSearchService
  ) {}

  async search(params: SearchParams): Promise<Flight[]> {
    const start = Date.now();

    const result = await this.inner.search(params);

    const duration = Date.now() - start;

    console.log(`Search took ${duration}ms`);

    return result;
  }
}
```

---

## Combining Decorators

Decorators can wrap other decorators:

```ts
const basic = new BasicFlightSearchService();

const withMetrics =
  new MetricsFlightSearchDecorator(basic);

const withLogging =
  new LoggingFlightSearchDecorator(withMetrics);

await withLogging.search(params);
```

The execution flow becomes:

```text
LoggingDecorator
      ↓
MetricsDecorator
      ↓
BasicFlightSearchService
```

Or with more decorators:

```text
Logging
   ↓
Metrics
   ↓
Retry
   ↓
Basic Service
```

Each decorator has one responsibility.

---

## Example in a Multi-Provider Flight Search System

For a provider such as Duffel:

```text
LoggingDecorator
       ↓
MetricsDecorator
       ↓
RetryDecorator
       ↓
DuffelAdapter
```

`DuffelAdapter` remains responsible only for communicating with Duffel and converting its data.

Other concerns such as:

- Logging
- Retry
- Metrics
- Tracing

can be handled by decorators.

---

## Why Use Decorator?

Use Decorator when you want to:

- Add behavior without modifying the original class.
- Keep classes focused on one responsibility.
- Combine optional behaviors dynamically.
- Avoid creating many subclasses.
- Follow the **Open/Closed Principle**.
- Improve separation of concerns.

---

## Simple Mental Model

Think about coffee:

```text
CaramelDecorator
       ↓
MilkDecorator
       ↓
Coffee
```

Each decorator adds something while keeping the original coffee object unchanged.

The same idea applies in software:

```text
Logging
   ↓
Retry
   ↓
Metrics
   ↓
Service
```

---

## Key Idea to Remember

> **Decorator = Wrap an object to add behavior without changing the original object.**

A decorator usually implements the **same interface** as the object it wraps.

```ts
class SomeDecorator implements FlightSearchService {
  constructor(
    private readonly inner: FlightSearchService
  ) {}
}
```

Because both use the same interface, decorators can be stacked together easily.
