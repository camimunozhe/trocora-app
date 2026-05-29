import type { Currency } from '@/types/database';

// CLP: sin decimales, separador de miles con punto (1.990).
function thousands(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// USD: separador de miles con coma + 2 decimales solo si los hay (1,234 / 1,234.50).
function usd(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const fixed = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart ? `${withSep}.${decPart}` : withSep;
}

// Da formato a un monto ya en su moneda (con separador de miles).
function formatMoney(value: number, currency: Currency): string {
  return currency === 'clp' ? `$${thousands(value)}` : `$${usd(value)}`;
}

// For market prices stored in USD — converts to display currency
export function formatPrice(valueUsd: number, currency: Currency = 'usd', usdToClp = 950): string {
  return formatMoney(currency === 'clp' ? valueUsd * usdToClp : valueUsd, currency);
}

// For user-entered prices stored directly in their currency — no rate conversion
export function formatCurrencyValue(value: number, currency: Currency): string {
  return formatMoney(value, currency);
}

export function currencyLabel(currency: Currency): string {
  return currency === 'clp' ? 'CLP' : 'USD';
}

// Converts an amount stored in `from` currency to the `to` currency.
export function convertCurrency(value: number, from: Currency, to: Currency, usdToClp: number): number {
  if (from === to) return value;
  if (from === 'usd' && to === 'clp') return value * usdToClp;
  if (from === 'clp' && to === 'usd') return value / usdToClp;
  return value;
}
