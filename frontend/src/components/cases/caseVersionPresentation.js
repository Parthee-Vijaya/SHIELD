import { modelLabel } from '../../utils/modelPresentation';

export const NOT_RECORDED = 'Ikke registreret';
export const records = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];
export const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
// SQLite records UTC timestamps without an offset in older workspace payloads.
// Calendar-only values retain their date semantics; explicit offsets win.
export const normalizeTimestamp = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text(value)) ? `${text(value)}Z` : text(value);
export const timestamp = value => Date.parse(normalizeTimestamp(value)) || 0;
export const recordedDate = value => {
  const normalized = normalizeTimestamp(value);
  if (!normalized || !Number.isFinite(Date.parse(normalized))) return NOT_RECORDED;
  const calendarOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
  const date = new Date(calendarOnly ? `${normalized}T00:00:00` : normalized);
  return new Intl.DateTimeFormat('da-DK', { dateStyle: 'medium', ...(calendarOnly ? {} : { timeStyle: 'short' }) }).format(date);
};
const CATEGORY_LABELS = { dpia: 'Konsekvensanalyse og risikovurdering', ai_act: 'AI Act-vurdering', fria: 'Grundrettighedsvurdering', legal_screening: 'Juridisk screening', procurement_review: 'Juridisk dialoggrundlag', case_bundle: 'Samlet sagspakke' };
export function categoryKey(item) {
  const key = text(item.category || item.assessment_type || item.type || item.reference_type);
  return ({ dpia_assessment: 'dpia', dpia_docx: 'dpia', dpia_xlsx: 'dpia', dpia_json: 'dpia', ai_act_assessment: 'ai_act', fria_assessment: 'fria' })[key] || key || 'unknown';
}
export const categoryLabel = item => text(item.category_label) || CATEGORY_LABELS[categoryKey(item)] || 'Anden vurdering';
export const itemTitle = item => text(item.project_name || item.system_name || item.title || item.name || item.label) || categoryLabel(item);
export function versionLabel(item) {
  if (text(item.version_label)) return text(item.version_label);
  if (text(item.revision_id)) return `Revision ${text(item.revision_id)}`;
  const value = text(item.version ?? item.source_version);
  return value ? `Version ${value}` : 'Version ikke registreret';
}
export const actorLabel = (value, model) => text(value) === 'Codex'
  ? `AI-assisteret import · ${text(model) ? modelLabel(model) : 'model ikke registreret'}`
  : text(value) || NOT_RECORDED;
export const generationLabel = item => ({ ai_assisted: 'AI-udarbejdet udkast', human_edited: 'Fagligt redigeret af et menneske', rule_based: 'Regelbaseret vurdering', unknown: 'Udarbejdelse ikke registreret' })[text(item.generation_kind)] || 'Udarbejdelse ikke registreret';
export const generationModel = item => text(item.model || item.source_ai_model) ? modelLabel(item.model || item.source_ai_model) : (item.generation_kind === 'ai_assisted' ? 'Model ikke registreret' : '');
export const creatorLabel = item => actorLabel(item.created_by || item.initiated_by, item.model);
export function statusLabel(value) {
  const key = text(value);
  return ({ approved: 'Godkendt', approved_with_conditions: 'Godkendt med vilkår', rejected: 'Afvist', changes_requested: 'Sendt tilbage til rettelse', pending: 'Afventer beslutning', draft: 'Kladde', blocked: 'Blokeret', ready_for_review: 'Klar til faglig gennemgang', ready_for_legal_review: 'Klar til juridisk gennemgang', requires_action: 'Kræver handling', completed: 'Afsluttet', GO: 'Klar til beslutning', 'BETINGET-GO': 'Kræver opfølgning', 'NO-GO': 'Blokeret', kladde: 'Kladde', vurderet: 'Vurderet', remediation: 'Kræver handling', godkendt: 'Godkendt', idriftsat: 'Idriftsat', arkiveret: 'Arkiveret' })[key] || key.replace(/_/g, ' ') || NOT_RECORDED;
}
export const statusTone = value => ['approved', 'approved_with_conditions', 'godkendt'].includes(value) ? 'success' : ['blocked', 'NO-GO', 'rejected'].includes(value) ? 'danger' : value && !['completed', 'draft'].includes(value) ? 'warning' : 'neutral';
export const safeInternalHref = value => typeof value === 'string' && /^\/(?![\\/])/.test(value) && ![...value].some(char => char.charCodeAt(0) <= 32 || char === '\\') ? value : null;
export const safeDownloadHref = value => safeInternalHref(value)?.startsWith('/api/') ? value : null;
export function assessmentHref(item, caseRecord = {}) {
  const category = categoryKey(item);
  if (category === 'dpia' && text(item.id || item.assessment_id)) {
    const params = new URLSearchParams({ assessment_id: text(item.id || item.assessment_id) });
    const caseId = text(item.case_db_id || caseRecord.id);
    if (caseId) params.set('case', caseId);
    return `/vurdering?${params}`;
  }
  return safeInternalHref(item.href || item.url) || (category === 'legal_screening' && text(item.audit_log_id || item.id) ? `/historik/${encodeURIComponent(item.audit_log_id || item.id)}` : null);
}
export function compareVersions(a, b) {
  if (a.is_latest !== b.is_latest && (a.is_latest === true || b.is_latest === true)) return a.is_latest === true ? -1 : 1;
  const av = Number(a.version), bv = Number(b.version);
  if (text(a.version) && text(b.version) && Number.isFinite(av) && Number.isFinite(bv) && av !== bv) return bv - av;
  return timestamp(b.created_at) - timestamp(a.created_at);
}
export function assessmentGroups(items) {
  const groups = new Map();
  records(items).forEach(item => {
    const key = categoryKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.entries()].map(([key, entries]) => ({ key, label: categoryLabel(entries[0]), entries: [...entries].sort(compareVersions) }))
    .sort((a, b) => timestamp(b.entries[0].created_at) - timestamp(a.entries[0].created_at));
}
export function exportGroups(items) {
  const groups = new Map();
  records(items).forEach((item, index) => {
    const href = safeDownloadHref(item.href || item.url);
    const historicalId = href?.match(/\/(?:assessments|reviews)\/([^/]+)\//)?.[1];
    const snapshot = text(item.group_id || item.assessment_id || item.review_id || historicalId || item.revision_id) || `ungrouped-${index}`;
    const key = `${categoryKey(item)}:${snapshot}`;
    if (!groups.has(key)) groups.set(key, { ...item, key, formats: [] });
    const group = groups.get(key);
    if (!group.formats.some(existing => existing.format === item.format && (existing.href || existing.url) === (item.href || item.url))) group.formats.push(item);
  });
  return [...groups.values()].sort(compareVersions);
}
export const formatLabel = item => ({ docx: 'Word (.docx)', xlsx: 'Excel (.xlsx)', json: 'JSON (.json)', pdf: 'PDF (.pdf)' })[text(item.format).toLowerCase()] || text(item.format).toUpperCase() || 'Filformat ikke registreret';
