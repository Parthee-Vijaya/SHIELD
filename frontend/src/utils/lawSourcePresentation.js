// Hide only the scraper's known image-generation placeholder line. Do not
// rewrite legal prose, inline quotations, answers, or the stored source data.
export function lawSourceText(value) {
  if (typeof value !== 'string') return '';
  return value.split(/\r?\n/)
    .filter(line => !/^\s*Billedgenerering afventer:/.test(line))
    .join('\n').trim();
}
