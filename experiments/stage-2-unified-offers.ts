// Stage 2 experiment: the same three providers, now behind one interface.
// Run it: npx ts-node experiments/stage-2-unified-offers.ts
import { NestFactory } from '@nestjs/core';
import {
  HOTEL_PROVIDERS,
  HotelProvider,
} from '../src/hotel-search/domain/hotel-provider';
import { ProvidersModule } from '../src/providers/providers.module';

async function main() {
  // Boots Nest DI without an HTTP server, to prove the wiring works.
  const app = await NestFactory.createApplicationContext(ProvidersModule, {
    logger: false,
  });
  const providers = app.get<HotelProvider[]>(HOTEL_PROVIDERS);

  const request = {
    city: 'Amman',
    checkIn: '2026-10-01',
    checkOut: '2026-10-03',
    guests: 2,
  };

  // Notice: ONE loop, no "if provider A ... else if B ...".
  for (const provider of providers) {
    const offers = await provider.search(request, {
      signal: new AbortController().signal,
    });
    console.log(`\nProvider ${provider.name}:`);
    console.table(offers);
  }

  await app.close();
}

void main();
