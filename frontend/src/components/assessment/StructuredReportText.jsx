import React from 'react';
import styled from 'styled-components';

const Text = styled.div`
  min-width: 0;
  max-width: 78ch;
  overflow-wrap: anywhere;
  line-height: 1.7;
  && p { margin: 0 0 14px; white-space: pre-line; }
  && p:last-child { margin-bottom: 0; }
  && ul, && ol { margin: 10px 0 18px; padding-left: 24px; }
  && li { margin: 7px 0; padding-left: 3px; white-space: pre-line; }
  && li > ul, && li > ol { margin-top: 7px; margin-bottom: 10px; }
  && .report-heading {
    margin: 26px 0 11px;
    font-size: 1.2rem;
    font-weight: 700;
    line-height: 1.35;
    letter-spacing: -0.01em;
    color: ${p => p.theme.colors.ink};
    text-wrap: balance;
  }
  && .report-heading[data-depth='2'] { font-size: 1.1rem; margin-top: 22px; }
  && .report-heading[data-depth='3'], && .report-heading[data-depth='4'],
  && .report-heading[data-depth='5'], && .report-heading[data-depth='6'] { font-size: 1.02rem; margin-top: 20px; }
  && .report-heading[data-status-heading='true'] {
    padding: 11px 14px;
    margin-top: 28px;
    margin-bottom: 14px;
    border-left: 3px solid ${p => p.theme.colors.line};
    background: ${p => p.theme.colors.paperSoft};
  }
  && .report-heading:first-child { margin-top: 0; }
  && strong { font-weight: 700; }
  && code { font-size: 0.9em; white-space: pre-wrap; }
`;

// These labels are recognized only when the source actually contains them.
// Formatting must never infer whether anything is documented or approved.
const LABELS = [
  'Konklusion', 'Hovedfund', 'Vigtigste forhold', 'Dokumenteret', 'Dokumenterede forhold',
  'Skal afklares', 'Afklaringer', 'Mangler', 'Før godkendelse', 'Mangler før godkendelse',
  'Næste skridt', 'Afgrænsning', 'Anbefalinger', 'Grundlag', 'Vurdering', 'Vurderingsgrundlag',
  'Risici', 'Databehandleraftale', 'Databehandleraftale (DBA)', 'DBA', 'Personoplysninger',
  'Persondata', 'Hosting', 'Hosting og dataplacering', 'Dataplacering', 'Sikkerhed',
  'Informationssikkerhed', 'Sletning', 'Sletning og opbevaring', 'Opbevaring',
  'Opbevaring og sletning', 'Underdatabehandlere', 'Tredjelandsoverførsler',
  'Behandlingsgrundlag', 'Nødvendighed og proportionalitet', 'Rettigheder',
  'Konsekvenser', 'Foranstaltninger', 'Risikobegrænsende foranstaltninger',
];
const knownLabel = value => LABELS.some(label => label.toLocaleLowerCase('da') === value.toLocaleLowerCase('da'));
const isStatusHeading = value => ['dokumenteret', 'skal afklares', 'før godkendelse'].includes(
  value.replace(/^(?:\*\*|__)(.+?)(?:\*\*|__)$/, '$1').replace(/:$/, '').toLocaleLowerCase('da')
);

// Render a small, safe formatting subset. Unknown syntax stays visible text;
// source HTML is never interpreted and no text becomes an executable link.
function inlineText(value, keyPrefix = '') {
  const parts = [];
  const tokens = /`[^`\n]+`|\*\*(?=\S)(?:[^\n]*?\S)\*\*|__(?=\S)(?:[^\n]*?\S)__/g;
  let offset = 0;
  for (const match of value.matchAll(tokens)) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;
    const escaped = /(?:^|[^\\])(?:\\\\)*\\$/.test(value.slice(0, start));
    const wordUnderscore = token.startsWith('__') && (
      /[\p{L}\p{N}_]/u.test(value[start - 1] || '') || /[\p{L}\p{N}_]/u.test(value[end] || '')
    );
    if (escaped || wordUnderscore) continue;
    if (start > offset) parts.push(value.slice(offset, start));
    const key = `${keyPrefix}${start}`;
    parts.push(token.startsWith('`')
      ? <code key={key}>{token.slice(1, -1)}</code>
      : <strong key={key}>{token.slice(2, -2)}</strong>);
    offset = end;
  }
  if (offset < value.length) parts.push(value.slice(offset));
  return parts;
}

function paragraphBlocks(line) {
  const colon = line.indexOf(':');
  if (colon > 0 && knownLabel(line.slice(0, colon).trim())) {
    return [{ type: 'paragraph', text: line, label: line.slice(0, colon + 1) }];
  }
  // Avoid splitting a formatting token between paragraphs. All sentences and
  // their order are retained; long plain prose gets shorter reading paragraphs.
  if (line.length > 450 && !/\*\*|__|`/.test(line) && typeof Intl.Segmenter === 'function') {
    const sentences = [...new Intl.Segmenter('da', { granularity: 'sentence' }).segment(line)].map(part => part.segment);
    const blocks = [];
    for (let i = 0; i < sentences.length; i += 2) {
      blocks.push({ type: 'paragraph', text: sentences.slice(i, i + 2).join('').trim() });
    }
    return blocks;
  }
  return [{ type: 'paragraph', text: line }];
}

// Formatting only: retain every statement and its order, including caveats.
export function reportBlocks(value) {
  const source = typeof value === 'string' ? value : '';
  const blocks = [];
  let listStack = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const markdownHeading = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    const bareLabel = line.replace(/:$/, '');
    const boldHeading = line.match(/^(?:\*\*(.+?)\*\*|__(.+?)__)\s*:?$/);
    const boldLabel = boldHeading?.[1] || boldHeading?.[2];
    if (markdownHeading || knownLabel(bareLabel) || (boldLabel && boldLabel.length <= 120 && !/[.!?]$/.test(boldLabel))) {
      blocks.push({ type: 'heading', text: markdownHeading?.[2] || boldLabel?.replace(/:$/, '') || bareLabel, markdownLevel: markdownHeading?.[1].length });
      listStack = [];
      continue;
    }
    const bullet = raw.match(/^(\s*)([-+•*]|(\d+)[.)])\s+(.+)$/);
    if (bullet) {
      const indent = bullet[1].replace(/\t/g, '    ').length;
      const ordered = Boolean(bullet[3]);
      while (listStack.length && listStack.at(-1).indent > indent) listStack.pop();
      let current = listStack.at(-1);
      if (!current || current.indent !== indent || current.list.ordered !== ordered) {
        if (current?.indent === indent) { listStack.pop(); current = listStack.at(-1); }
        const list = { type: 'list', ordered, items: [] };
        if (current) current.list.items.at(-1).children.push(list);
        else blocks.push(list);
        current = { indent, list };
        listStack.push(current);
      }
      current.list.items.push({ text: bullet[4], value: ordered ? Number(bullet[3]) : undefined, children: [] });
      continue;
    }
    const indent = raw.match(/^\s*/)[0].replace(/\t/g, '    ').length;
    if (listStack.length && indent > listStack.at(-1).indent) {
      listStack.at(-1).list.items.at(-1).children.push(...paragraphBlocks(line));
    } else {
      listStack = [];
      blocks.push(...paragraphBlocks(line));
    }
  }
  const markdownLevels = blocks.filter(block => block.markdownLevel).map(block => block.markdownLevel);
  // A report fragment beginning at ## should not skip the host's heading level.
  const base = markdownLevels.length ? Math.min(...markdownLevels) : 1;
  return blocks.map(block => block.type === 'heading' ? { ...block, level: block.markdownLevel ? block.markdownLevel - base + 1 : 1 } : block);
}

function ReportBlocks({ blocks, headingLevel }) {
  return blocks.map((block, index) => {
    if (block.type === 'list') {
      const List = block.ordered ? 'ol' : 'ul';
      return <List key={index} start={block.ordered ? block.items[0]?.value : undefined}>{block.items.map((item, i) =>
        <li key={i} value={item.value}>{inlineText(item.text, `item${i}-`)}{item.children.length > 0 && <ReportBlocks blocks={item.children} headingLevel={headingLevel} />}</li>
      )}</List>;
    }
    if (block.type === 'heading') {
      const Heading = `h${Math.min(6, headingLevel + block.level - 1)}`;
      return <Heading key={index} className="report-heading" data-depth={block.level} data-status-heading={isStatusHeading(block.text) || undefined}>{inlineText(block.text)}</Heading>;
    }
    return <p key={index}>{block.label
      ? <><strong>{block.label}</strong>{inlineText(block.text.slice(block.label.length), 'body-')}</>
      : inlineText(block.text)}</p>;
  });
}

export default function StructuredReportText({ text, className, headingLevel = 4 }) {
  const baseLevel = Number.isInteger(headingLevel) ? Math.min(6, Math.max(2, headingLevel)) : 4;
  return <Text className={className}><ReportBlocks blocks={reportBlocks(text)} headingLevel={baseLevel} /></Text>;
}
