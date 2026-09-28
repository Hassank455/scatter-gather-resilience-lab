import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  HOTEL_PROVIDERS,
  HotelProvider,
} from '../src/hotel-search/domain/hotel-provider';

const query = {
  city: 'Amman',
  checkIn: '2026-10-01',
  checkOut: '2026-10-03',
  guests: 2,
};

// Boots the real app (real mock providers with real latency) and calls it over HTTP.
describe('GET /hotels/search (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns offers from all providers', async () => {
    const response = await request(app.getHttpServer())
      .get('/hotels/search')
      .query(query)
      .expect(200);

    expect(response.body).toMatchObject({
      providers: [
        { name: 'A', status: 'success' },
        { name: 'B', status: 'success' },
        { name: 'C', status: 'success' },
      ],
    });
  }, 10_000); // ~1.5 s (the slowest provider): extra headroom over Jest's 5 s default

  it('rejects an invalid query with 400', async () => {
    await request(app.getHttpServer())
      .get('/hotels/search')
      .query({ city: 'Amman', checkIn: '2026-10-05', checkOut: '2026-10-03' })
      .expect(400);
  });
});

// A separate app where EVERY provider is broken, to check the 503 policy.
describe('GET /hotels/search when every provider fails (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const broken: HotelProvider = {
      name: 'X',
      search: () => Promise.reject(new Error('X is down')),
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Swap the real providers for a broken one. This works because the
      // orchestrator only depends on the HOTEL_PROVIDERS token.
      .overrideProvider(HOTEL_PROVIDERS)
      .useValue([broken])
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 503 but still explains which provider failed and why', async () => {
    const response = await request(app.getHttpServer())
      .get('/hotels/search')
      .query(query)
      .expect(503);

    expect(response.body).toMatchObject({
      offers: [],
      providers: [{ name: 'X', status: 'failed', error: 'X is down' }],
    });
  });
});
