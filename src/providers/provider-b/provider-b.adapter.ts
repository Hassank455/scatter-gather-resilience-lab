import { Injectable } from '@nestjs/common';
import { HotelOffer } from '../../hotel-search/domain/hotel-offer';
import {
  HotelProvider,
  ProviderCallContext,
} from '../../hotel-search/domain/hotel-provider';
import { HotelSearchRequest } from '../../hotel-search/domain/hotel-search-request';
import {
  InvalidProviderRequestError,
  ProviderRateLimitedError,
  ProviderUnavailableError,
} from '../../hotel-search/domain/provider-errors';
import {
  PROVIDER_B,
  toHotelOffers,
  toProviderBRequest,
} from './provider-b.mapper';
import { ProviderBMockClient } from './provider-b.mock-client';
import { ProviderBApiError } from './provider-b.types';

@Injectable()
export class ProviderBAdapter implements HotelProvider {
  readonly name = PROVIDER_B;

  constructor(private readonly client: ProviderBMockClient) {}

  async search(
    request: HotelSearchRequest,
    ctx: ProviderCallContext,
  ): Promise<HotelOffer[]> {
    const providerRequest = toProviderBRequest(request);
    if (!providerRequest) return []; // city not covered → no remote call at all

    try {
      const response = await this.client.search(providerRequest, ctx.signal);
      return toHotelOffers(response);
    } catch (error) {
      throw translateError(error);
    }
  }
}

// Provider B's error codes → our domain errors.
function translateError(error: unknown): unknown {
  if (!(error instanceof ProviderBApiError)) return error;

  const cause = { cause: error };
  switch (error.errorCode) {
    case 'B-429':
      return new ProviderRateLimitedError(PROVIDER_B, undefined, cause); // B sends no retry-after
    case 'B-503':
      return new ProviderUnavailableError(PROVIDER_B, error.message, cause);
    case 'B-400':
      return new InvalidProviderRequestError(PROVIDER_B, error.message, cause);
  }
}
