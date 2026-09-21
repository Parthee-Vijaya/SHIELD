import { calendarDate, dayKey, todayDayKeyCopenhagen, formatAssessmentDate } from './reviewDates';

test.each([
  ['2026-07-10T21:59:59Z', '2026-07-10T10:00:00Z', '2026-07-10', false],
  ['2026-07-10T22:00:00Z', '2026-07-10T10:00:00Z', '2026-07-11', true],
  ['2026-01-10T22:59:59Z', '2026-01-10T11:00:00Z', '2026-01-10', false],
  ['2026-01-10T23:00:00Z', '2026-01-10T11:00:00Z', '2026-01-11', true],
  ['2026-01-11T12:00:00Z', '2026-01-10T23:30:00Z', '2026-01-11', false],
  ['2026-03-29T21:59:59Z', '2026-03-29T10:00:00Z', '2026-03-29', false],
  ['2026-03-29T22:00:00Z', '2026-03-29T10:00:00Z', '2026-03-30', true],
  ['2026-10-25T22:59:59Z', '2026-10-25T11:00:00Z', '2026-10-25', false],
  ['2026-10-25T23:00:00Z', '2026-10-25T11:00:00Z', '2026-10-26', true],
])('review calendar agrees with the API across Copenhagen midnight: %s', (now, review, today, overdue) => {
  const reviewDate = calendarDate(review);
  expect(todayDayKeyCopenhagen(new Date(now))).toBe(today);
  expect(dayKey(reviewDate) < todayDayKeyCopenhagen(new Date(now))).toBe(overdue);
});

test.each([
  ['2026-09-20T22:30:00Z', '2026-09-21'],
  ['2026-09-20T22:30:00+00:00', '2026-09-21'],
  ['2026-09-20T22:30:00.123456', '2026-09-21'],
  ['2026-09-21T00:30:00+02:00', '2026-09-21'],
  ['2026-09-21', '2026-09-21'],
])('display date uses Danish day without browser-zone shifts: %s', (value, expected) => {
  const date = calendarDate(value);
  expect(dayKey(date)).toBe(expected);
  expect(date.getDate()).toBe(21);
  expect(date.getMonth()).toBe(8);
  expect(date.getFullYear()).toBe(2026);
  expect(date.getHours()).toBe(12);
  expect(date.toLocaleDateString('da-DK', { month: 'short' })).toBe('sep.');
});

test('calendar sorting follows the converted Danish days', () => {
  const later = calendarDate('2026-09-20T22:30:00Z');
  const earlier = calendarDate('2026-09-20T20:30:00Z');
  expect(dayKey(earlier)).toBe('2026-09-20');
  expect(dayKey(later)).toBe('2026-09-21');
  expect(earlier < later).toBe(true);
});

test.each([null, undefined, '', 'ukendt', '2026-02-30', '2026-02-30T12:00:00Z', '2026-13-01', '2026-09-20garbage', '2026-09-20T25:00:00Z'])('invalid date %s stays absent from the calendar', value => {
  expect(calendarDate(value)).toBeNull();
});

test('today defaults to the current instant, interpreted in Denmark', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-20T22:30:00Z'));
  try {
    expect(todayDayKeyCopenhagen()).toBe('2026-09-21');
  } finally {
    jest.useRealTimers();
  }
});


test('assessment events show Danish date and time, including naive historic UTC', () => {
  const midnight = formatAssessmentDate('2026-09-20T22:30:00Z');
  expect(midnight).toContain('21. sep. 2026');
  expect(midnight).toContain('00.30');
  expect(formatAssessmentDate('2026-09-20T22:30:00')).toBe(midnight);
  expect(formatAssessmentDate('2026-09-21T00:30:00+02:00')).toBe(midnight);
  expect(formatAssessmentDate('2026-09-20T22:45:00Z')).toContain('00.45');
  expect(formatAssessmentDate('2026-09-20T22:45:00Z')).not.toBe(midnight);
  expect(formatAssessmentDate('2026-01-20T11:30:00Z')).toContain('12.30');
});

test.each([null, '', 'ukendt', '2026-02-30T12:00:00Z', '2026-09-20'])('invalid event date %s has no invented time', value => {
  expect(formatAssessmentDate(value)).toBe('Ikke angivet');
});
