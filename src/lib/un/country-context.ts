import regions from "../../../data/region-currencies.json" with { type: "json" };

export type CountryQuery = { country?: string | string[]; entity?: string | string[] };

export function countryHref(href: string, country: string, entity?: string): string {
  const url = new URL(href, "http://localhost");
  url.searchParams.set("country", country);
  if (entity) url.searchParams.set("entity", entity);
  return url.pathname + url.search + url.hash;
}

export function regionalCurrency(id: string): string | undefined {
  const normalized = id.trim().toUpperCase();
  const region = normalized === "UAE" ? "AE" : normalized;
  return Object.hasOwn(regions.currencies, region) ? (regions.currencies as Record<string, string>)[region] : undefined;
}

const regionCodes = Object.keys(regions.currencies).filter((code) => /^[A-Z]{2}$/.test(code));

export function knownCountries(locale = "en"): { id: string; name: string }[] {
  const labels = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
  return regionCodes.flatMap((code) => {
    const name = labels.of(code);
    return name ? [{ id: code === "AE" ? "UAE" : code, name }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name, locale));
}

export function currencyCode(value: unknown): string | undefined {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return Intl.supportedValuesOf("currency").includes(code) ? code : undefined;
}
