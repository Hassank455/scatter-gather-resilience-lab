// Provider A: a "classic REST JSON" API.
// These types describe Provider A's world, NOT ours.
// Nothing outside the provider-a/ folder may import this file.

export interface ProviderASearchRequest {
  city: string; // city NAME, e.g. "Amman"
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guests: number;
}

export interface ProviderAHotel {
  id: string;
  hotel_name: string; // snake_case
  price: {
    amount: string; // decimal as a STRING, e.g. "240.00" (total for the stay)
    currency: string; // "EUR"
  };
}

export interface ProviderASearchResponse {
  results: ProviderAHotel[];
}

// Provider A reports errors like an HTTP API: a status code plus a body.
export class ProviderAHttpError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly body: { message: string; retryAfterSeconds?: number },
  ) {
    super(`Provider A responded with HTTP ${httpStatus}`);
  }
}
