import resourceLibrary, { mergeResourceCatalogs, normalizeResourceUrl, reportAsResource } from './resourceLibrary';
import reports from './rapporterFallback.json';
import resources from './resourcesCatalog.json';

test('normaliserer marketingvarianter men holder forskellige dokumenter og sprog adskilt', () => {
  expect(normalizeResourceUrl('https://www.example.dk/report/?utm_source=mail&lang=da#page=2')).toBe(normalizeResourceUrl('http://example.dk/report?lang=da'));
  expect(normalizeResourceUrl('https://example.dk/report?id=1&lang=da')).not.toBe(normalizeResourceUrl('https://example.dk/report?id=2&lang=da'));
  expect(normalizeResourceUrl('https://example.dk/report?lang=da')).not.toBe(normalizeResourceUrl('https://example.dk/report?lang=en'));
});

test('samme kilde vises én gang med begge katalogers metadata og filtermuligheder', () => {
  const original = { id: 'guide', title: 'Vejledning', url: 'https://www.example.dk/report/', description: 'Vejledningens forklaring', category: 'Dansk myndighed', type: 'Vejledning', language: 'da', tags: ['AI'], lastUpdated: '2024-01-01' };
  const report = reportAsResource({ id: 1, titel: 'Rapportens navn', link: 'https://example.dk/report?utm_campaign=test', resume: 'Rapportens fulde resumé', udgiver: 'Myndigheden', aar: 2023, omraade: 'Databeskyttelse' });
  const merged = mergeResourceCatalogs([original], [report]);
  expect(merged).toHaveLength(1);
  expect(merged[0]).toMatchObject({ id: 'guide', title: 'Vejledning', titles: ['Vejledning', 'Rapportens navn'], descriptions: ['Vejledningens forklaring', 'Rapportens fulde resumé'], types: ['Vejledning', 'Rapport'], publishers: ['Myndigheden'], years: [2023], areas: ['Databeskyttelse'], updatedDates: ['2024-01-01'] });
  expect(merged[0].categories).toEqual(['Dansk myndighed', 'Rapporter og publikationer']);
  expect(merged[0].entries).toEqual([original, report]);
  expect(original.tags).toEqual(['AI']);
});

test('alle tidligere rapporter og kataloglinks er bevaret i det fælles katalog', () => {
  const oldUrls = [...resources.map(item => item.url), ...reports.map(item => item.link)].map(normalizeResourceUrl);
  expect(resourceLibrary).toHaveLength(new Set(oldUrls).size);
  reports.forEach(report => {
    const merged = resourceLibrary.find(item => normalizeResourceUrl(item.url) === normalizeResourceUrl(report.link));
    expect(merged.titles).toContain(report.titel);
    expect(merged.descriptions).toContain(report.resume);
    expect(merged.publishers).toContain(report.udgiver);
    expect(merged.years).toContain(report.aar);
    expect(merged.areas).toContain(report.omraade);
  });
});
