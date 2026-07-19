/**
 * Thin server-side wrappers over the countriesnow.space public API
 * (https://countriesnow.space/api/v0.1). Responses are cached for a day since
 * this reference data is effectively static. Consumed only by the /api/geo/*
 * routes, which the client location/phone pickers call.
 */
const BASE = 'https://countriesnow.space/api/v0.1';
const DAY = 60 * 60 * 24;

export interface CountryOption {
  /** Canonical country name, matching what the states/cities endpoints expect. */
  name: string;
  /** ISO 3166-1 alpha-2 code, e.g. "GB" — used to render a flag emoji. */
  iso2: string;
  /** International dialling code, e.g. "+44". Empty when the API has none. */
  dialCode: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: DAY } });
  if (!res.ok) throw new Error(`countriesnow ${res.status} for ${url}`);
  const json = (await res.json()) as { error?: boolean; msg?: string; data?: T };
  if (json.error) throw new Error(json.msg || 'countriesnow returned an error');
  return json.data as T;
}

// Names differ slightly in spacing/case between feeds ("AmericanSamoa" vs
// "American Samoa"), so match on a stripped-down key.
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * All countries with ISO2 (for flags) + dialling code. We take the canonical
 * name and ISO2 from /iso and look up the dial code from /codes by name — the
 * /codes `code` field is unreliable (e.g. Greece is "EL", not "GR"), so we can't
 * join on it.
 */
export async function fetchCountries(): Promise<CountryOption[]> {
  const [iso, codes] = await Promise.all([
    getJson<{ name: string; Iso2: string; Iso3: string }[]>(`${BASE}/countries/iso`),
    getJson<{ name: string; code: string; dial_code: string }[]>(`${BASE}/countries/codes`),
  ]);

  const dialByName = new Map(codes.map((c) => [nameKey(c.name), c.dial_code]));

  return iso
    .filter((c) => c.name && c.Iso2)
    .map((c) => ({ name: c.name, iso2: c.Iso2, dialCode: dialByName.get(nameKey(c.name)) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** State/province names for a country (empty array when the country has none). */
export async function fetchStates(country: string): Promise<string[]> {
  const data = await getJson<{ states?: { name: string }[] }>(
    `${BASE}/countries/states/q?country=${encodeURIComponent(country)}`
  );
  return (data.states ?? []).map((s) => s.name).sort((a, b) => a.localeCompare(b));
}

/**
 * City names for a country, narrowed to a state when given. Falls back to all
 * cities in the country so places without a chosen state still get a dropdown.
 */
export async function fetchCities(country: string, state?: string): Promise<string[]> {
  const url = state
    ? `${BASE}/countries/state/cities/q?country=${encodeURIComponent(country)}&state=${encodeURIComponent(state)}`
    : `${BASE}/countries/cities/q?country=${encodeURIComponent(country)}`;
  const data = await getJson<string[]>(url);
  return (data ?? []).sort((a, b) => a.localeCompare(b));
}
