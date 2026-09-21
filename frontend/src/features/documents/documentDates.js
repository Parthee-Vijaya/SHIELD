// Document validity and review fields are calendar dates, stored in the API's
// existing UTC format. An inclusive valid-to date ends at 23:59:59 UTC.
// Format these fields in the same calendar; browser-local time would move an
// existing end-of-day value to tomorrow in Denmark. Do not use this for events.
export function toDocumentDateTime(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Angiv en gyldig kalenderdato.');
  }
  return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}Z`;
}

export function formatDocumentDate(value) {
  if (!value) return 'Ikke angivet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  // SQLite-backed historical responses can omit the UTC suffix. Retain the
  // serialized calendar day rather than interpreting it in the browser zone.
  const day = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1];
  const date = day ? new Date(`${day}T00:00:00Z`) : parsed;
  if (day && date.toISOString().slice(0, 10) !== day) return value;
  return new Intl.DateTimeFormat('da-DK', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}
