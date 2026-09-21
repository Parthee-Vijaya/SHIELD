import { formatDocumentDate, toDocumentDateTime } from './documentDates';

test.each([
  ['2026-09-20', '20. sep. 2026'],
  ['2026-12-31', '31. dec. 2026'],
])('historiske og nye slutdatoer bevarer kalenderdagen %s', (day, expected) => {
  const historicValue = `${day}T23:59:59+00:00`;
  expect(formatDocumentDate(historicValue)).toBe(expected);
  const saved = toDocumentDateTime(day, true);
  expect(saved).toBe(`${day}T23:59:59Z`);
  expect(formatDocumentDate(saved)).toBe(expected);
  expect(new Intl.DateTimeFormat('da-DK', { dateStyle: 'medium', timeZone: 'Europe/Copenhagen' }).format(new Date(saved))).not.toBe(expected);
});

test('start og review beholder UTC-midnat, og en gyldig skuddag accepteres', () => {
  expect(toDocumentDateTime('2028-02-29')).toBe('2028-02-29T00:00:00Z');
  expect(formatDocumentDate('2028-02-29')).toBe('29. feb. 2028');
  expect(formatDocumentDate('2028-02-29T00:00:00')).toBe('29. feb. 2028');
  expect(formatDocumentDate('2028-02-29T00:00:00+02:00')).toBe('29. feb. 2028');
});

test('tomme felter bliver ikke datoer, og ulæselige historiske værdier bevares', () => {
  expect(toDocumentDateTime('')).toBeNull();
  expect(formatDocumentDate(null)).toBe('Ikke angivet');
  expect(formatDocumentDate('Dato skal afklares')).toBe('Dato skal afklares');
});

test('ugyldige nye kalenderdatoer ruller ikke stiltiende til næste måned', () => {
  expect(() => toDocumentDateTime('2026-02-29', true)).toThrow('Angiv en gyldig kalenderdato.');
  expect(() => toDocumentDateTime('20.09.2026')).toThrow('Angiv en gyldig kalenderdato.');
});
