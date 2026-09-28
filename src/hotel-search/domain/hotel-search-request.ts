// What OUR application means by "a hotel search".
// Every provider receives this same object; each adapter translates it.
export interface HotelSearchRequest {
  city: string; // city name, e.g. "Amman"
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guests: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Length of the stay in nights. Some providers need it (B asks for it, C prices per night).
export function stayNights(request: HotelSearchRequest): number {
  return (Date.parse(request.checkOut) - Date.parse(request.checkIn)) / DAY_MS;
}
