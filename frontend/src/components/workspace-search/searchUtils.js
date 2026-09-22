import { ALL_NAVIGATION } from '../../config/navigation';
import resourceLibrary from '../../data/resourceLibrary';

export const SEARCH_CATEGORIES = [
  { id: 'cases', label: 'Sager' },
  { id: 'assessments', label: 'Vurderinger' },
  { id: 'documents', label: 'Dokumenter' },
  { id: 'guidance', label: 'Sider og vejledning' },
];

export const normalizeSearch = value => String(value || '').toLocaleLowerCase('da')
  .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'aa')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function editDistance(left, right) {
  const rows = [Array.from({ length: right.length + 1 }, (_, index) => index)];
  for (let i = 1; i <= left.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= right.length; j += 1) {
      let cost = Math.min(row[j - 1] + 1, rows[i - 1][j] + 1, rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) cost = Math.min(cost, rows[i - 2][j - 2] + 1);
      row.push(cost);
    }
    rows.push(row);
  }
  return rows[left.length][right.length];
}

export function fuzzyScore(query, value) {
  const needle = normalizeSearch(query);
  const haystack = normalizeSearch(value);
  if (!needle || !haystack) return 0;
  if (needle === haystack) return 120;
  if (haystack.includes(needle)) return haystack.startsWith(needle) ? 100 : 90;
  const words = haystack.split(' ');
  const scores = needle.split(' ').map(token => {
    const allowance = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;
    return Math.max(0, ...words.map(word => {
      if (token === word) return 85;
      if (word.startsWith(token)) return 78;
      if (word.includes(token)) return 70;
      if (allowance && Math.abs(token.length - word.length) <= allowance) {
        const distance = editDistance(token, word);
        if (distance <= allowance) return 60 - distance * 10;
      }
      return 0;
    }));
  });
  return scores.every(Boolean) ? scores.reduce((total, score) => total + score, 0) / scores.length : 0;
}

// Public page vocabulary supplements the single canonical navigation registry.
const PAGE_TERMS = {
  procurement: 'opret AI system leverandør anskaffelse upload materiale præsentation databehandleraftale',
  assessment: 'DPIA konsekvensanalyse risikovurdering personoplysninger behandlingsgrundlag',
  'ai-act-assessment': 'klassifikation højrisiko AI forordning EU',
  'fundamental-rights': 'FRIA grundrettigheder rettigheder diskrimination',
  'document-bank': 'DBA DPA SOC ISAE sikkerhed dokumentation upload skabeloner',
  research: 'lovgivning paragraffer kildehenvisninger juridisk research lovassistent',
  knowledge: 'ordbog begreber vejledning hjælp GDPR databeskyttelse',
  about: 'GPT JEV human in the loop menneskelig kontrol modeller kvalitet ansvar',
  settings: 'guide tutorial tema mørk lys profil præferencer',
};

export function navigationResults(query) {
  const needle = normalizeSearch(query);
  const items = ALL_NAVIGATION.map(item => ({
    id: `navigation-${item.id}`, title: item.label, summary: item.description || 'Åbn siden',
    type: 'guidance', action: { route: item.path },
    score: needle ? fuzzyScore(needle, `${item.label} ${item.description || ''} ${PAGE_TERMS[item.id] || ''} ${item.hint || ''}`) : 1,
  }));
  return items.filter(item => item.score > 0).sort((left, right) => right.score - left.score).slice(0, needle ? 5 : 4);
}

export function safeSearchRoute(item) {
  const route = item?.action?.route;
  return typeof route === 'string' && /^\/(?!\/)/.test(route) && !/[\\\r\n]/.test(route) ? route : null;
}


/** Only public catalogue metadata is bundled; search never follows a URL. */
export function safeResourceUrl(value) {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url || url.includes('\\') || [...url].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  if (/^\/(?!\/)/.test(url)) return url;
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? url : null;
  } catch { return null; }
}

export function resourceResults(query) {
  if (normalizeSearch(query).length < 2) return [];
  return resourceLibrary.filter(item => safeResourceUrl(item.url)).map(item => {
    const title = item.titles.join(' / ');
    const titleScore = fuzzyScore(query, title);
    const metadata = [...item.titles, ...item.descriptions, ...item.tags, ...item.categories,
      ...item.types, ...item.publishers, ...item.years, ...item.areas].join(' ');
    return {
      id: `resource-${item.id}`, title,
      summary: [...item.types, ...item.publishers, ...item.years].join(' · ') || 'Offentlig vejledning',
      type: 'guidance', action: { route: `/ressourcer?resource_id=${encodeURIComponent(item.id)}` },
      score: Math.max(titleScore ? titleScore + 10 : 0, fuzzyScore(query, metadata)),
    };
  }).filter(item => item.score > 0).sort((left, right) => right.score - left.score).slice(0, 5);
}

export function localSearchResults(query) {
  return [...navigationResults(query), ...resourceResults(query)]
    .sort((left, right) => right.score - left.score).slice(0, 8);
}
