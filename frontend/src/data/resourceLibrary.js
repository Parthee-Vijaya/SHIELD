import resources from './resourcesCatalog.json';
import reports from './rapporterFallback.json';

const unique = values => [...new Set(values.filter(value => value !== undefined && value !== null && value !== ''))];

// Ignore navigation fragments and marketing parameters, but preserve document,
// language and other query parameters that can identify different resources.
export function normalizeResourceUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim(), 'https://shield.local');
    const query = new URLSearchParams(url.search);
    [...query.keys()].forEach(key => { if (/^utm_|^(gclid|fbclid|msclkid)$/i.test(key)) query.delete(key); });
    query.sort();
    const path = url.pathname.replace(/\/$/, '').replace(/%[a-f\d]{2}/gi, match => match.toUpperCase());
    return `${url.host.toLowerCase().replace(/^www\./, '')}${path}${query.toString() ? `?${query}` : ''}`;
  } catch { return String(value || '').trim(); }
}

export function reportAsResource(report) {
  return {
    ...report,
    id: `report-${report.id}`,
    title: report.titel,
    url: report.link,
    description: report.resume,
    category: 'Rapporter og publikationer',
    type: 'Rapport',
    publisher: report.udgiver,
    year: report.aar,
    area: report.omraade,
    tags: unique([report.omraade, report.udgiver]),
  };
}

export function mergeResourceCatalogs(...catalogues) {
  const byUrl = new Map();
  catalogues.flat().forEach(item => {
    const key = normalizeResourceUrl(item.url) || `id:${item.id}`;
    const current = byUrl.get(key);
    const entries = [...(current?.entries || []), item];
    // Keep the first catalogue's primary display labels and every source record.
    // The arrays preserve alternate labels for search/filter and report metadata.
    byUrl.set(key, {
      ...(current || item),
      entries,
      titles: unique(entries.map(entry => entry.title)),
      descriptions: unique(entries.map(entry => entry.description)),
      categories: unique(entries.map(entry => entry.category)),
      types: unique(entries.map(entry => entry.type)),
      languages: unique(entries.map(entry => entry.language || 'unknown')),
      publishers: unique(entries.map(entry => entry.publisher)),
      years: unique(entries.map(entry => entry.year)),
      areas: unique(entries.map(entry => entry.area)),
      updatedDates: unique(entries.map(entry => entry.lastUpdated)),
      tags: unique(entries.flatMap(entry => entry.tags || [])),
    });
  });
  return [...byUrl.values()];
}

const resourceLibrary = mergeResourceCatalogs(resources, reports.map(reportAsResource));
export default resourceLibrary;
