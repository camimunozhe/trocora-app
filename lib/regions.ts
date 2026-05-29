// Regiones por país. Lanzamiento inicial: solo Chile.
// Para sumar un país: agregarlo a COUNTRIES y sus regiones a REGIONS_BY_COUNTRY.
export type Region = { code: string; label: string };
export type Country = { code: string; label: string; flag: string };

export const CHILE_REGIONS = [
  { code: 'AP',   label: 'Arica y Parinacota' },
  { code: 'TA',   label: 'Tarapacá' },
  { code: 'AN',   label: 'Antofagasta' },
  { code: 'AT',   label: 'Atacama' },
  { code: 'CO',   label: 'Coquimbo' },
  { code: 'VS',   label: 'Valparaíso' },
  { code: 'RM',   label: 'Metropolitana' },
  { code: 'LI',   label: "O'Higgins" },
  { code: 'ML',   label: 'Maule' },
  { code: 'NB',   label: 'Ñuble' },
  { code: 'BI',   label: 'Biobío' },
  { code: 'AR',   label: 'La Araucanía' },
  { code: 'LR',   label: 'Los Ríos' },
  { code: 'LL',   label: 'Los Lagos' },
  { code: 'AI',   label: 'Aysén' },
  { code: 'MA',   label: 'Magallanes' },
] as const;

export type RegionCode = (typeof CHILE_REGIONS)[number]['code'];

export const DEFAULT_COUNTRY = 'CL';

export const COUNTRIES: Country[] = [
  { code: 'CL', label: 'Chile', flag: '🇨🇱' },
];

export const REGIONS_BY_COUNTRY: Record<string, readonly Region[]> = {
  CL: CHILE_REGIONS,
};

export function regionsForCountry(country: string | null | undefined): readonly Region[] {
  return REGIONS_BY_COUNTRY[country ?? DEFAULT_COUNTRY] ?? REGIONS_BY_COUNTRY[DEFAULT_COUNTRY];
}

export function countryLabel(code: string | null | undefined): string {
  return COUNTRIES.find(c => c.code === (code ?? DEFAULT_COUNTRY))?.label ?? 'Chile';
}

export const REGION_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(REGIONS_BY_COUNTRY).flat().map(r => [r.code, r.label]),
);
