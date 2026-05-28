export async function fetchEcbEuroRates(): Promise<Record<string, number>> {
  const response = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml");
  if (!response.ok) {
    return {};
  }
  const text = await response.text();
  const rates: Record<string, number> = { EUR: 1 };
  for (const match of text.matchAll(/currency='([A-Z]{3})'\s+rate='([0-9.]+)'/g)) {
    rates[match[1]] = Number(match[2]);
  }
  return rates;
}
