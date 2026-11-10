import type { Admin } from './wind';

/**
 * Place search (OpenStreetMap Nominatim) and height above sea level (Open-Meteo) for the site of a
 * scaffold. Both need an internet connection; without it the site can be entered by coordinates.
 */

export interface Place {
  name: string;
  lat: number;
  lon: number;
  /** ISO 3166-1 alpha-2, lower case */
  country: string;
  /** administrative units (state, district, county, municipality) for the wind zone */
  admin?: Admin;
}

interface NominatimAddress {
  country_code?: string;
  state?: string;
  state_district?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
}

const adminOf = (a: NominatimAddress | undefined): Admin => ({ state: a?.state ?? a?.city, district: a?.state_district, county: a?.county, town: a?.city ?? a?.town ?? a?.village ?? a?.municipality });

export const REVERSE = 'https://nominatim.openstreetmap.org/reverse';

/** place at a position (administrative units; German names for the German wind zone table) */
export async function reversePlace(lat: number, lon: number, signal?: AbortSignal): Promise<Place | null> {
  try {
    const r = await fetch(`${REVERSE}?format=json&addressdetails=1&zoom=12&accept-language=de&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`, { signal, headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const d = (await r.json()) as { display_name?: string; address?: NominatimAddress };
    if (!d.address) return null;
    return { name: d.display_name ?? '', lat, lon, country: (d.address.country_code ?? '').toLowerCase(), admin: adminOf(d.address) };
  } catch {
    return null;
  }
}

export const GEOCODER = 'https://nominatim.openstreetmap.org/search';
export const ELEVATION = 'https://api.open-meteo.com/v1/elevation';

/** up to five places for a name (city, address); in the language of the user interface */
export async function searchPlace(query: string, lang: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `${GEOCODER}?format=json&addressdetails=1&limit=5&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`geocoder ${r.status}`);
  const data = (await r.json()) as { display_name: string; lat: string; lon: string; address?: NominatimAddress }[];
  return data
    .map((d) => ({ name: d.display_name, lat: Number(d.lat), lon: Number(d.lon), country: (d.address?.country_code ?? '').toLowerCase(), admin: adminOf(d.address) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

/** height above sea level, m (null if not available) */
export async function fetchElevation(lat: number, lon: number, signal?: AbortSignal): Promise<number | null> {
  try {
    const r = await fetch(`${ELEVATION}?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}`, { signal });
    if (!r.ok) return null;
    const d = (await r.json()) as { elevation?: number[] };
    const e = d.elevation?.[0];
    return typeof e === 'number' && Number.isFinite(e) ? e : null;
  } catch {
    return null;
  }
}

/** countries of the EU / EEA and Switzerland (wind and snow maps of the Eurocodes) */
export const EU_COUNTRIES = new Set([
  'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'ie', 'it', 'lv', 'lt', 'lu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se',
  'is', 'li', 'no', 'ch',
]);
