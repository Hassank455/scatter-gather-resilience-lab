import { Injectable } from '@nestjs/common';
import { HotelOffer } from '../../hotel-search/domain/hotel-offer';
import {
  HotelProvider,
  ProviderCallContext,
} from '../../hotel-search/domain/hotel-provider';
import { HotelSearchRequest } from '../../hotel-search/domain/hotel-search-request';
import {
  InvalidProviderRequestError,
  ProviderError,
  ProviderRateLimitedError,
  ProviderUnavailableError,
} from '../../hotel-search/domain/provider-errors';
import {
  PROVIDER_C,
  toHotelOffers,
  toProviderCRequest,
} from './provider-c.mapper';
import { ProviderCMockClient } from './provider-c.mock-client';
import { ProviderCSearchResponse } from './provider-c.types';

@Injectable()
export class ProviderCAdapter implements HotelProvider {
  readonly name = PROVIDER_C;

  constructor(private readonly client: ProviderCMockClient) {}

  async search(
    request: HotelSearchRequest,
    ctx: ProviderCallContext,
  ): Promise<HotelOffer[]> {
    const providerRequest = toProviderCRequest(request);
    if (!providerRequest) return [];

    // No try/catch needed here: C never throws its own errors.
    const response = await this.client.search(providerRequest, ctx.signal);

    // C reports failures INSIDE a successful response.
    // We turn them into real thrown errors, so C behaves like A and B from now on.
    if (response.status === 'ERROR') throw translateError(response);

    return toHotelOffers(response.payload, request);
  }
}

// `Extract` picks the ERROR branch of the union, so `response.code` is fully typed.
function translateError(
  response: Extract<ProviderCSearchResponse, { status: 'ERROR' }>,
): ProviderError {
  switch (response.code) {
    case 'RATE_LIMIT':
      return new ProviderRateLimitedError(PROVIDER_C, undefined);
    case 'SERVICE_DOWN':
      return new ProviderUnavailableError(PROVIDER_C, response.code);
    case 'INVALID_QUERY':
      return new InvalidProviderRequestError(PROVIDER_C, response.code);
  }
}
