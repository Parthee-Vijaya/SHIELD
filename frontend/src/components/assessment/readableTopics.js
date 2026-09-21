// This is a presentation map of the saved Datatilsynet template sections.
// It does not assess the content or turn an assessment status into approval.
const TOPICS = [
  {
    id: 'purpose',
    title: 'Hvad skal AI-løsningen bruges til?',
    description: 'Formålet, arbejdsgangene og AI-løsningens rolle i opgaven.',
    labels: {
      '1.1': 'Hvilken opgave skal løsningen løse?',
      '1.2': 'Hvorfor er denne konsekvensanalyse nødvendig?',
      '1.3': 'Hvorfor bruge AI?',
      '1.4': 'Hvordan bevæger oplysningerne sig mellem systemer?',
      '1.5': 'Hvad må oplysningerne bruges til?',
      '1.8': 'Hvem bruger løsningen, og i hvilken sammenhæng?',
    },
  },
  {
    id: 'personal-data',
    title: 'Personer og personoplysninger',
    description: 'Hvem der er berørt, og hvad vurderingen beskriver om deres oplysninger.',
    labels: { '1.6': 'Hvem er berørt, og hvilke oplysninger indgår?' },
  },
  {
    id: 'data-sharing',
    title: 'Hosting, adgang og dataoverførsler',
    description: 'Deling af oplysninger og eventuelle overførsler til lande uden for EU/EØS.',
    labels: {
      '1.7': 'Hvor ligger data, og hvem kan få adgang?',
      '2.30': 'Kan oplysningerne komme uden for EU/EØS?',
    },
  },
  {
    id: 'suppliers',
    title: 'Databehandleraftale og leverandører',
    description: 'Databehandlerens opgaver, aftaler og eventuelle underleverandører.',
    labels: { '2.29': 'Hvad skal databehandleraftalen og leverandørkæden dække?' },
  },
  {
    id: 'security',
    title: 'Hvordan skal oplysningerne beskyttes?',
    description: 'Teknisk understøttelse, sikkerhedsforanstaltninger og håndtering af brud på persondatasikkerheden.',
    labels: {
      '1.9': 'Hvilken teknik understøtter behandlingen?',
      '2.20': 'Hvordan forebygges forkert brug og uvedkommendes adgang?',
      '2.21': 'Hvad gør man, hvis personoplysninger går tabt eller lækkes?',
    },
  },
  {
    id: 'retention',
    title: 'Hvornår skal oplysninger slettes?',
    description: 'Opbevaringsperioder og retten til at få oplysninger slettet.',
    labels: {
      '2.10': 'Hvor længe må oplysningerne gemmes?',
      '2.25': 'Kan en person få sine oplysninger slettet?',
    },
  },
  {
    id: 'legal-basis-rights',
    title: 'Må kommunen bruge oplysningerne?',
    description: 'Grundlaget for behandlingen og de rettigheder, som kommunen skal tage stilling til.',
    labels: {
      '2.1': 'Hvad giver ret til at bruge oplysningerne?',
      '2.2': 'Er der grundlag for at bruge følsomme oplysninger?',
      '2.3': 'Indgår oplysninger om strafbare forhold?',
      '2.4': 'Er der grundlag for at bruge CPR-numre?',
      '2.5': 'Bliver personer behandlet rimeligt?',
      '2.6': 'Er det tydeligt, hvordan oplysningerne bruges?',
      '2.7': 'Holder brugen sig til det oplyste formål?',
      '2.8': 'Står brugen af oplysninger mål med opgaven?',
      '2.9': 'Hvordan sikres korrekte oplysninger?',
      '2.22': 'Hvad skal de berørte personer have at vide?',
      '2.23': 'Kan personer se deres egne oplysninger?',
      '2.24': 'Kan forkerte oplysninger blive rettet?',
      '2.26': 'Kan personer få deres oplysninger udleveret og flyttet?',
      '2.27': 'Hvordan kan personer gøre indsigelse mod brugen?',
      '2.28': 'Træffer AI beslutninger om personer uden et menneske?',
    },
  },
  {
    id: 'ai-lifecycle',
    title: 'Hvordan skal AI testes og bruges i drift?',
    description: 'Vurderingen af udvikling, test og den daglige brug af AI-løsningen.',
    labels: {
      '2.11': 'Hvad giver ret til at bruge data under udvikling og test?',
      '2.12': 'Er udvikling og test rimelig for de berørte?',
      '2.13': 'Er det tydeligt, hvad der sker under udvikling og test?',
      '2.14': 'Står udvikling og test mål med formålet?',
      '2.15': 'Hvordan kontrolleres kvaliteten under udvikling og test?',
      '2.16': 'Behandles personer rimeligt i den daglige brug?',
      '2.17': 'Er den daglige brug af AI tydelig for de berørte?',
      '2.18': 'Står den daglige brug af AI mål med formålet?',
      '2.19': 'Hvordan kontrolleres kvaliteten under drift?',
    },
  },
  {
    id: 'other',
    title: 'Andre afsnit i vurderingen',
    description: 'Øvrige gemte afsnit, som ikke har en fast placering i denne temavisning.',
    labels: {},
  },
];

const SECTION_TOPICS = new Map(TOPICS.flatMap(topic => Object.entries(topic.labels).map(([id, label]) => [id, { topicId: topic.id, label }])));
const MISSING_LABEL = 'Oplysninger mangler';
const REVIEW_LABEL = 'Skal gennemgås fagligt';

function sectionReviewLabel(section) {
  // Only explicit metadata or absent saved text can mark missing information.
  // Words such as "approved" in the prose are never interpreted as a decision.
  return section.review_status === 'missing_information'
    || section.source === 'missing_information'
    || typeof section.text !== 'string'
    || !section.text.trim()
    ? MISSING_LABEL : REVIEW_LABEL;
}

function savedSection(entry) {
  if (typeof entry === 'string') return entry.trim() ? { text: entry, title: 'Afsnit uden overskrift' } : null;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  // Retain identified sections with empty text so missing-information entries
  // remain visible; unrelated or empty historical values contain no section.
  return [entry.id, entry.title, entry.text].some(value => typeof value === 'string' && value.trim()) ? entry : null;
}

/** Group saved section occurrences exactly once, retaining all original fields.
 * Input order is retained within each topic, including duplicate IDs in a saved
 * record; this helper must not silently repair or discard historical content. */
export function buildReadableTopics(result) {
  const savedSections = Array.isArray(result?.sections) ? result.sections.map(savedSection).filter(Boolean) : [];
  const groups = new Map(TOPICS.map(topic => [topic.id, []]));
  savedSections.forEach(section => {
    const mapping = SECTION_TOPICS.get(section.id);
    const fallbackLabel = typeof section.title === 'string' && section.title.trim()
      ? section.title : section.id ? `Afsnit ${section.id}` : 'Afsnit uden overskrift';
    groups.get(mapping?.topicId || 'other').push({
      ...section,
      label: mapping?.label || fallbackLabel,
      reviewLabel: sectionReviewLabel(section),
    });
  });
  return TOPICS.flatMap(({ id, title, description }) => {
    const sections = groups.get(id);
    return sections.length ? [{
      id, title, description, sections,
      reviewLabel: sections.some(section => section.reviewLabel === MISSING_LABEL) ? MISSING_LABEL : REVIEW_LABEL,
    }] : [];
  });
}
