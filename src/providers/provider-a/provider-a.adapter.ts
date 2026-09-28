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
  PROVIDER_A,
  toHotelOffers,
  toProviderARequest,
} from './provider-a.mapper';
import { ProviderAMockClient } from './provider-a.mock-client';
import { ProviderAHttpError } from './provider-a.types';

// Adapter: makes Provider A look like a HotelProvider.
// Its three jobs: translate the request, call the client, translate the result OR the error.
// It does NOT retry, time out or count concurrency. Those are later stages.
@Injectable()
export class ProviderAAdapter implements HotelProvider {
  readonly name = PROVIDER_A;

  constructor(private readonly client: ProviderAMockClient) {}

  async search(
    request: HotelSearchRequest,
    ctx: ProviderCallContext,
  ): Promise<HotelOffer[]> {
    try {
      const response = await this.client.search(
        toProviderARequest(request),
        ctx.signal,
      );
      return toHotelOffers(response);
    } catch (error) {
      throw translateError(error);
    }
  }
}

// Provider A's HTTP-style errors → our domain errors.
function translateError(error: unknown): unknown {
  // Anything that is not A's own error (e.g. an abort reason, or a
  // ProviderResponseError from the mapper) passes through untouched.
  if (!(error instanceof ProviderAHttpError)) return error;

  const cause = { cause: error };
  if (error.httpStatus === 429) {
    const seconds = error.body.retryAfterSeconds;
    return new ProviderRateLimitedError(
      PROVIDER_A,
      seconds === undefined ? undefined : seconds * 1000,
      cause,
    );
  }
  if (error.httpStatus >= 500) {
    return new ProviderUnavailableError(PROVIDER_A, error.body.message, cause);
  }
  return new InvalidProviderRequestError(PROVIDER_A, error.body.message, cause);
}
