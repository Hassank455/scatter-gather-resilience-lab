import { BadRequestException } from '@nestjs/common';
import { HotelSearchRequest } from './domain/hotel-search-request';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Query string → HotelSearchRequest, or a 400 error.
// Hand-written on purpose: four fields do not justify class-validator.
export function parseSearchRequest(
  query: Record<string, unknown>,
): HotelSearchRequest {
  const city = requireText(query.city, 'city');
  const checkIn = requireDate(query.checkIn, 'checkIn');
  const checkOut = requireDate(query.checkOut, 'checkOut');
  const guests = Number(query.guests ?? 1); // default: 1 guest

  if (checkOut <= checkIn) {
    // Comparing strings works because YYYY-MM-DD sorts like a date.
    throw new BadRequestException('checkOut must be after checkIn');
  }
  if (!Number.isInteger(guests) || guests < 1) {
    throw new BadRequestException('guests must be a positive integer');
  }

  return { city, checkIn, checkOut, guests };
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

function requireDate(value: unknown, field: string): string {
  // The regex checks the format, Date.parse rejects impossible dates like 2026-13-45.
  if (
    typeof value !== 'string' ||
    !ISO_DATE.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new BadRequestException(`${field} must be a date like 2026-10-01`);
  }
  return value;
}
