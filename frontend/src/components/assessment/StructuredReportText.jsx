import React from 'react';
import styled from 'styled-components';

const Text = styled.div`
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.65;
  p { margin: 0 0 12px; max-width: 85ch; white-space: pre-line; }
  p:last-child { margin-bottom: 0; }
  ul, ol { margin: 8px 0 14px; padding-left: 22px; }
  li { margin: 5px 0; }
  h4 { margin: 20px 0 7px; font-size: 0.9rem; }
  h4:first-child { margin-top: 0; }
`;

// Formatting only: retain every sentence; never infer findings or approvals.
export function reportBlocks(value) {
  const source = typeof value === 'string' ? value : '';
  const blocks = [];
  for (const raw of source.split(/\n+/).filter(line => line.trim())) {
    const line = raw.trim();
    const bullet = line.match(/^(?:[-•*]|\d+[.)])\s+(.+)/);
    if (bullet) {
      if (blocks.at(-1)?.type === 'list') blocks.at(-1).items.push(bullet[1]);
      else blocks.push({ type: 'list', items: [bullet[1]] });
      continue;
    }
    const heading = line.match(/^(?:#{1,4}\s+(.+)|((?:Konklusion|Hovedfund|Vigtigste forhold|Afklaringer|Mangler før godkendelse|Næste skridt|Afgrænsning|Anbefalinger|Grundlag)):\s*)$/i);
    if (heading) { blocks.push({ type: 'heading', text: heading[1] || heading[2] }); continue; }
    if (line.length > 450 && typeof Intl.Segmenter === 'function') {
      const sentences = [...new Intl.Segmenter('da', { granularity: 'sentence' }).segment(line)].map(part => part.segment);
      for (let i = 0; i < sentences.length; i += 2) blocks.push({ type: 'paragraph', text: sentences.slice(i, i + 2).join('').trim() });
    } else blocks.push({ type: 'paragraph', text: line });
  }
  return blocks;
}

export default function StructuredReportText({ text, className }) {
  return <Text className={className}>{reportBlocks(text).map((block, index) => block.type === 'list'
    ? <ul key={index}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
    : block.type === 'heading' ? <h4 key={index}>{block.text}</h4> : <p key={index}>{block.text}</p>)}</Text>;
}
