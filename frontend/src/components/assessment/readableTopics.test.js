import { buildReadableTopics } from './readableTopics';

const section = (id, overrides = {}) => ({ id, title: `Original overskrift ${id}`, text: `Syntetisk gemt afsnit ${id}.`, source_ids: [`source-${id}`], review_status: 'requires_review', ...overrides });
const findTopic = (topics, id) => topics.find(topic => topic.id === id);

test('alle 39 standardsnit får præcis én fast placering uden tab af tekst, kilder eller status', () => {
  const original = [...Array.from({ length: 9 }, (_, index) => section(`1.${index + 1}`)), ...Array.from({ length: 30 }, (_, index) => section(`2.${index + 1}`))];
  original.forEach(item => { Object.freeze(item.source_ids); Object.freeze(item); });
  const input = Object.freeze({ sections: Object.freeze(original) });
  const topics = buildReadableTopics(input);
  expect(topics.map(topic => topic.id)).toEqual(['purpose', 'personal-data', 'data-sharing', 'suppliers', 'security', 'retention', 'legal-basis-rights', 'ai-lifecycle']);
  const grouped = topics.flatMap(topic => topic.sections);
  expect(grouped).toHaveLength(39);
  expect(new Set(grouped.map(item => item.id)).size).toBe(39);
  original.forEach(saved => {
    const copy = grouped.find(item => item.id === saved.id);
    expect(copy).toMatchObject(saved);
    expect(copy.label).toBeTruthy();
    expect(copy.reviewLabel).toBe('Skal gennemgås fagligt');
  });
});

test('sletning, databehandlere og overførsel holdes i de aftalte temaer uden dubletter', () => {
  const topics = buildReadableTopics({ sections: ['1.2', '1.4', '1.6', '1.7', '1.9', '2.10', '2.11', '2.20', '2.21', '2.22', '2.25', '2.28', '2.29', '2.30'].map(id => section(id)) });
  expect(findTopic(topics, 'purpose').sections.map(item => item.id)).toEqual(['1.2', '1.4']);
  expect(findTopic(topics, 'personal-data').sections.map(item => item.id)).toEqual(['1.6']);
  expect(findTopic(topics, 'retention').sections.map(item => item.id)).toEqual(['2.10', '2.25']);
  expect(findTopic(topics, 'suppliers').sections.map(item => item.id)).toEqual(['2.29']);
  expect(findTopic(topics, 'data-sharing').sections.map(item => item.id)).toEqual(['1.7', '2.30']);
  expect(findTopic(topics, 'security').sections.map(item => item.id)).toEqual(['1.9', '2.20', '2.21']);
  expect(findTopic(topics, 'legal-basis-rights').sections.map(item => item.id)).toEqual(['2.22', '2.28']);
});

test('ukendte eller manglende IDer falder tilbage uden tekstheuristik, og historiske dubletter bevares som gemt', () => {
  const duplicate = section('1.1', { text: 'Et andet gemt afsnit med samme ID.' });
  const unknown = section('future-17', { title: 'Lovgrundlag og databehandlere', text: 'Ord i teksten må ikke bestemme placeringen.', extra_metadata: { historical: true } });
  const unnumbered = section(undefined, { title: '' });
  const input = [section('1.1'), unknown, duplicate, unnumbered];
  const topics = buildReadableTopics({ sections: input });
  expect(findTopic(topics, 'purpose').sections.map(item => item.text)).toEqual([input[0].text, duplicate.text]);
  expect(findTopic(topics, 'other').sections).toEqual([
    { ...unknown, label: unknown.title, reviewLabel: 'Skal gennemgås fagligt' },
    { ...unnumbered, label: 'Afsnit uden overskrift', reviewLabel: 'Skal gennemgås fagligt' },
  ]);
  expect(topics.flatMap(topic => topic.sections)).toHaveLength(input.length);
});

test('fuldstændighed, kildehenvisninger, ingen blockers og godkendelsesord skaber aldrig en grøn status', () => {
  const topics = buildReadableTopics({ status: 'approved', completeness: 100, blockers: [], sections: [
    section('1.1', { text: 'Godkendt. Alt er dokumenteret.', review_status: 'approved' }),
    section('1.6', { review_status: 'not_applicable' }),
    section('2.29', { source: 'provided_input', review_status: 'requires_review' }),
  ] });
  expect(topics.every(topic => topic.reviewLabel === 'Skal gennemgås fagligt')).toBe(true);
  expect(topics.flatMap(topic => topic.sections).every(item => item.reviewLabel === 'Skal gennemgås fagligt')).toBe(true);
});

test('manglende information følger eksplicit status eller manglende tekst og løftes til temaet', () => {
  const topics = buildReadableTopics({ sections: [
    section('1.1'), section('1.2', { review_status: 'missing_information' }),
    section('2.10', { source: 'missing_information' }),
    section('2.29', { text: '   ' }),
    section('2.30', { text: 'Oplysninger mangler ifølge en citeret kilde; det er ikke statusmetadata.' }),
  ] });
  expect(findTopic(topics, 'purpose').reviewLabel).toBe('Oplysninger mangler');
  expect(findTopic(topics, 'purpose').sections[0].reviewLabel).toBe('Skal gennemgås fagligt');
  expect(findTopic(topics, 'retention').reviewLabel).toBe('Oplysninger mangler');
  expect(findTopic(topics, 'suppliers').reviewLabel).toBe('Oplysninger mangler');
  expect(findTopic(topics, 'data-sharing').reviewLabel).toBe('Skal gennemgås fagligt');
});

test('en ufuldstændig historisk rapport får ingen opdigtede afsnit eller tomme temaer', () => {
  expect(buildReadableTopics()).toEqual([]);
  expect(buildReadableTopics({ sections: [] })).toEqual([]);
  const topics = buildReadableTopics({ sections: [section('2.29')] });
  expect(topics).toHaveLength(1);
  expect(topics[0].id).toBe('suppliers');
  expect(topics[0].sections).toHaveLength(1);
});

test('historiske tekstafsnit bevares mens null og værdier uden indhold ikke vælter visningen', () => {
  const legacyText = '  En gemt historisk forklaring uden afsnitsnummer.  ';
  const missing = section('1.6', { text: null, review_status: 'missing_information' });
  const topics = buildReadableTopics({ sections: [null, undefined, false, 42, [], {}, { unrelated: true }, '', '  ', legacyText, section('1.7'), missing] });
  expect(topics.flatMap(topic => topic.sections)).toHaveLength(3);
  expect(findTopic(topics, 'other').sections).toEqual([{ text: legacyText, title: 'Afsnit uden overskrift', label: 'Afsnit uden overskrift', reviewLabel: 'Skal gennemgås fagligt' }]);
  expect(findTopic(topics, 'personal-data').sections[0]).toMatchObject({ ...missing, label: 'Hvem er berørt, og hvilke oplysninger indgår?', reviewLabel: 'Oplysninger mangler' });
  expect(findTopic(topics, 'data-sharing').title).toBe('Hosting, adgang og dataoverførsler');
  expect(findTopic(topics, 'data-sharing').sections[0].label).toBe('Hvor ligger data, og hvem kan få adgang?');
});
