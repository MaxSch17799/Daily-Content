export function localDate(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = part(parts, "year");
  const month = part(parts, "month");
  const day = part(parts, "day");
  return `${year}-${month}-${day}`;
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const match = parts.find((item) => item.type === type)?.value;
  if (!match) {
    throw new Error(`Could not format local date part: ${type}`);
  }
  return match;
}

