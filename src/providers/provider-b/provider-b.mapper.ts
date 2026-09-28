import { HotelOffer } from '../../hotel-search/domain/hotel-offer';
import {
  HotelSearchRequest,
  stayNights,
} from '../../hotel-search/domain/hotel-search-request';
import { ProviderResponseError } from '../../hotel-search/domain/provider-errors';
import {
  ProviderBSearchRequest,
  ProviderBSearchResponse,
} from './provider-b.types';

export const PROVIDER_B = 'B';

// Provider B only understands its own city codes.
const CITY_CODES: Record<string, string> = {
  amman: 'AMM',
  dubai: 'DXB',
};

// Returns undefined when B does not cover this city.
// That is not an error: B simply has no hotels there, so we skip the call.
export function toProviderBRequest(
  request: HotelSearchRequest,
): ProviderBSearchRequest | undefined {
  const cityCode = CITY_CODES[request.city.toLowerCase()];
  if (!cityCode) return undefined;

  return {
    destination: { cityCode },
    stay: { from: request.checkIn, nights: stayNights(request) }, // B wants nights, not checkOut
    occupancy: { adults: request.guests },
  };
}

export function toHotelOffers(response: ProviderBSearchResponse): HotelOffer[] {
  if (!Array.isArray(response?.data?.hotels)) {
    throw new ProviderResponseError(PROVIDER_B, 'missing "data.hotels" array');
  }

  return (
    response.data.hotels
      // A hotel without any rate has nothing to sell: skip it.
      .filter((hotel) => hotel.rates.length > 0)
      .map((hotel) => {
        // B returns several rates (room only, breakfast...). We show the cheapest.
        const cheapest = hotel.rates.reduce((min, rate) =>
          rate.totalCents < min.totalCents ? rate : min,
        );

        return {
          provider: PROVIDER_B,
          hotelId: hotel.code,
          name: hotel.title,
          price: cheapest.totalCents / 100, // cents → major units
          currency: cheapest.cur.toUpperCase(), // "eur" → "EUR"
        };
      })
  );
}
