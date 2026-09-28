import { Module } from '@nestjs/common';
import { HOTEL_PROVIDERS } from '../hotel-search/domain/hotel-provider';
import { ProviderAAdapter } from './provider-a/provider-a.adapter';
import { ProviderAMockClient } from './provider-a/provider-a.mock-client';
import { ProviderBAdapter } from './provider-b/provider-b.adapter';
import { ProviderBMockClient } from './provider-b/provider-b.mock-client';
import { ProviderCAdapter } from './provider-c/provider-c.adapter';
import { ProviderCMockClient } from './provider-c/provider-c.mock-client';
import { providerConfig } from './provider-config';

@Module({
  providers: [
    // Mock clients need a config object in their constructor, which Nest
    // cannot guess, so we build them ourselves with useFactory.
    {
      provide: ProviderAMockClient,
      useFactory: () => new ProviderAMockClient(providerConfig.a.simulation),
    },
    {
      provide: ProviderBMockClient,
      useFactory: () => new ProviderBMockClient(providerConfig.b.simulation),
    },
    {
      provide: ProviderCMockClient,
      useFactory: () => new ProviderCMockClient(providerConfig.c.simulation),
    },

    // Adapters only need their client, which Nest injects automatically.
    ProviderAAdapter,
    ProviderBAdapter,
    ProviderCAdapter,

    // All adapters collected into one array under one token.
    // The orchestrator (Stage 3) will inject HOTEL_PROVIDERS and never import an adapter.
    // Adding Provider D later = one more line here, no change in the orchestrator.
    {
      provide: HOTEL_PROVIDERS,
      useFactory: (
        a: ProviderAAdapter,
        b: ProviderBAdapter,
        c: ProviderCAdapter,
      ) => [a, b, c],
      inject: [ProviderAAdapter, ProviderBAdapter, ProviderCAdapter],
    },
  ],
  exports: [HOTEL_PROVIDERS],
})
export class ProvidersModule {}
