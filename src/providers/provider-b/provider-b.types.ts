// Provider B: nested JSON, prices in integer CENTS, several rates per hotel.

export interface ProviderBSearchRequest {
  destination: { cityCode: string }; // IATA code, e.g. "AMM"
  stay: { from: string; nights: number }; // start date + number of nights (no end date!)
  occupancy: { adults: number };
}

export interface ProviderBRate {
  rateId: string;
  totalCents: number; // 24000 = 240.00 (total for the stay)
  cur: string; // LOWER-case currency, e.g. "eur"
}

export interface ProviderBHotel {
  code: string;
  title: string;
  rates: ProviderBRate[]; // e.g. room only, with breakfast
}

export interface ProviderBSearchResponse {
  data: { hotels: ProviderBHotel[] };
}

// Provider B reports errors as its own string codes, not HTTP statuses.
export class ProviderBApiError extends Error {
  constructor(readonly errorCode: 'B-400' | 'B-429' | 'B-503') {
    super(`Provider B failed with ${errorCode}`);
  }
}
