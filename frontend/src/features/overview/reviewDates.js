// Case review timestamps represent Danish calendar days. Document validity
// dates have a separate contract and keep their own documentDates helper.
const danishDayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Copenhagen', calendar: 'gregory', numberingSystem: 'latn',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

const validDay = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

function copenhagenDayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(danishDayFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Only use on the display-only local-noon Date returned by calendarDate.
export function dayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function todayDayKeyCopenhagen(now = new Date()) {
  return copenhagenDayKey(now);
}

export function calendarDate(value) {
  if (typeof value !== 'string') return null;
  const originalDay = value.slice(0, 10);
  if (!validDay(originalDay)) return null;
  let key = originalDay;
  if (value !== originalDay) {
    // Historic SQLite timestamps omit the zone, but are UTC like the backend.
    if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) return null;
    const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
    key = copenhagenDayKey(new Date(hasZone ? value : `${value}Z`));
    if (!key) return null;
  }
  // Display carrier only: the getters and Danish month formatting keep the
  // chosen day in any browser zone. Never save this local-noon value to the API.
  const displayDate = new Date(`${key}T12:00:00`);
  return dayKey(displayDate) === key ? displayDate : null;
}


// Saved assessments are events, so preserve their time and show it in Denmark.
export function formatAssessmentDate(value) {
  if (typeof value !== 'string' || !validDay(value.slice(0, 10)) || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) return 'Ikke angivet';
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  const date = new Date(hasZone ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return 'Ikke angivet';
  return new Intl.DateTimeFormat('da-DK', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Copenhagen',
  }).format(date);
}
