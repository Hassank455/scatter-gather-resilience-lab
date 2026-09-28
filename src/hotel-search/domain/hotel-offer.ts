// The ONE shape the rest of the application understands.
// No provider-specific field is allowed to leak past this model.
export interface HotelOffer {
  provider: string; // which provider returned it, e.g. "A"
  hotelId: string; // unique only within its provider (no cross-provider dedup)
  name: string;
  price: number; // total for the whole stay, in major units (240 = 240.00)
  currency: string; // ISO 4217, upper case, e.g. "EUR"
}
