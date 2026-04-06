import { BadRequestException } from '@nestjs/common';

/** Parses catalog `Services.price` string into whole currency units (e.g. FCFA). */
export function parseServicePriceToAmount(price: string): number {
  const normalized = price.replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(normalized);
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestException('Invalid service price');
  }
  return Math.round(n);
}
