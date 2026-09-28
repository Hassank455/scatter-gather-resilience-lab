import { HotelOffer } from '../../hotel-search/domain/hotel-offer';
import { HotelSearchRequest } from '../../hotel-search/domain/hotel-search-request';
import { ProviderResponseError } from '../../hotel-search/domain/provider-errors';
import {
  ProviderASearchRequest,
  ProviderASearchResponse,
} from './provider-a.types';

export const PROVIDER_A = 'A';

// Pure functions: no I/O, no state. Same input → same output. Trivial to test.

// Our request → Provider A's request. A happens to use almost the same fields.
export function toProviderARequest(
  request: HotelSearchRequest,
): ProviderASearchRequest {
  return {
    city: request.city,
    checkIn: request.checkIn,
    checkOut: request.checkOut,
    guests: request.guests,
  };
}

// Provider A's response → our HotelOffer[].
export function toHotelOffers(response: ProviderASearchResponse): HotelOffer[] {
  if (!Array.isArray(response?.results)) {
    throw new ProviderResponseError(PROVIDER_A, 'missing "results" array');
  }

  return response.results.map((hotel) => {
    const price = Number(hotel.price?.amount); // "240.00" → 240
    if (!hotel.hotel_name || Number.isNaN(price)) {
      throw new ProviderResponseError(PROVIDER_A, `invalid hotel ${hotel.id}`);
    }

    return {
      provider: PROVIDER_A,
      hotelId: hotel.id,
      name: hotel.hotel_name,
      price,
      currency: hotel.price.currency,
    };
  });
}
