import { HotelOffer } from '../../hotel-search/domain/hotel-offer';
import {
  HotelSearchRequest,
  stayNights,
} from '../../hotel-search/domain/hotel-search-request';
import { ProviderResponseError } from '../../hotel-search/domain/provider-errors';
import { ProviderCRow, ProviderCSearchRequest } from './provider-c.types';

export const PROVIDER_C = 'C';

// Provider C identifies cities by its own numeric ids.
const LOCATION_IDS: Record<string, number> = {
  amman: 1001,
  dubai: 2002,
};

export function toProviderCRequest(
  request: HotelSearchRequest,
): ProviderCSearchRequest | undefined {
  const loc = LOCATION_IDS[request.city.toLowerCase()];
  if (loc === undefined) return undefined;

  return {
    loc,
    d1: request.checkIn,
    d2: request.checkOut,
    pax: request.guests,
  };
}

// Receives only the rows: the adapter has already handled status "ERROR".
// Needs the request because C prices per NIGHT and we want the whole stay.
export function toHotelOffers(
  rows: ProviderCRow[],
  request: HotelSearchRequest,
): HotelOffer[] {
  const nights = stayNights(request);

  return rows.map((row) => {
    const [hotelId, name, nightlyPrice, currency] = row; // tuple → named values
    if (typeof nightlyPrice !== 'number' || !currency) {
      throw new ProviderResponseError(PROVIDER_C, `invalid row ${hotelId}`);
    }

    return {
      provider: PROVIDER_C,
      hotelId,
      name,
      // Round to cents: floating-point math can produce 237.00000000000003.
      price: Math.round(nightlyPrice * nights * 100) / 100,
      currency,
    };
  });
}
