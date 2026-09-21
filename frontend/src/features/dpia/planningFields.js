export const PROCESSING_VERSION_OPTIONS = [
  { value: 'Idé og afklaring', label: 'Idé og afklaring' },
  { value: 'Anskaffelse', label: 'Anskaffelse af AI-løsning' },
  { value: 'Kontraktfornyelse', label: 'Kontraktfornyelse' },
  { value: 'Ændret anvendelse', label: 'Ændret anvendelse' },
  { value: 'Pilot og afprøvning', label: 'Pilot og afprøvning' },
  { value: '1.0', label: 'Version 1.0 – første ibrugtagning' },
  { value: '2.0', label: 'Version 2.0 – væsentlig ændring' },
  { value: 'Løbende drift', label: 'Løbende drift – periodisk gennemgang' },
  { value: 'Afvikling og ophør', label: 'Afvikling og ophør' },
];

export const isCalendarDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(`${value}T00:00:00Z`);
  return year > 0 && !Number.isNaN(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
};

// Old draft date fields also contained prose. Keep that prose verbatim as notes;
// never infer a calendar date or modify historical saved assessments.
export function normalizePlanningDates(values) {
  const next = { ...values };
  [['planned_start_date', 'planned_start_note'], ['planned_end_date', 'planned_end_condition']].forEach(([dateKey, noteKey]) => {
    const date = typeof next[dateKey] === 'string' ? next[dateKey] : '';
    const note = typeof next[noteKey] === 'string' ? next[noteKey] : '';
    if (date && !isCalendarDate(date)) {
      next[dateKey] = '';
      next[noteKey] = note && note !== date ? `${note}\n${date}` : date;
    } else {
      next[dateKey] = date;
      next[noteKey] = note;
    }
  });
  return next;
}
