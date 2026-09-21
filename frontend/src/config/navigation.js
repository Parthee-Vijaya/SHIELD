export const PRIMARY_NAVIGATION = Object.freeze([
  { id: 'home', label: 'Startside', path: '/', hint: 'g h' },
  { id: 'procurement', label: 'Ny AI-løsning', path: '/anskaffelse', hint: 'g v' },
  { id: 'cases', label: 'Sager & godkendelse', path: '/sager', hint: 'g s' },
  { id: 'history', label: 'Historik', path: '/historik', hint: 'g i' },
]);

export const TOOL_NAVIGATION_GROUPS = Object.freeze([
  { id: 'assessments', label: 'Vurderinger', items: [
    { id: 'assessment', label: 'Konsekvensanalyse og risici', path: '/vurdering', description: 'Beskriv persondata og behandling i spørgerammen.' },
    { id: 'ai-act-assessment', label: 'AI Act-vurdering', path: '/ai-act-vurdering', description: 'Vurder sagen med adgang til den supplerende EU-vejviser.' },
    { id: 'fundamental-rights', label: 'Grundrettighedsvurdering (FRIA)', path: '/grundrettigheder', description: 'Vurdér påvirkningen af berørte personers rettigheder.' },
    { id: 'legal-screening', label: 'Indledende juridisk screening', path: '/juridisk-screening', description: 'Find regelkrav i en beskrivelse eller et dokument.' },
  ] },
  { id: 'knowledge', label: 'Kilder og viden', items: [
    { id: 'document-bank', label: 'Dokumenter og skabeloner', path: '/dokumentbank', description: 'Find gemte dokumenter, versioner og skabeloner.' },
    { id: 'research', label: 'Juridisk arbejdsrum', path: '/research', description: 'Find kilder og stil spørgsmål til lovgivningen samme sted.' },
    { id: 'knowledge', label: 'Viden og vejledning', path: '/videnbase', description: 'Find begreber, vejledninger, rapporter og eksterne links.' },
    { id: 'projects', label: 'Inspiration til AI-løsninger', path: '/ai-losninger', description: 'Se eksempler fra den offentlige sektor.' },
  ] },
  { id: 'administration', label: 'Hjælp og administration', items: [
    { id: 'about', label: 'Om løsningen', path: '/om-loesningen', description: 'Se hvordan AI, JEV og faglig gennemgang bruges.' },
    { id: 'law-monitoring', label: 'Kontrol af lovkilder', path: '/lov-overvaagning', description: 'Følg ændringer i regelgrundlaget og berørte sager.' },
    { id: 'operations', label: 'Driftsstatus', path: '/drift', description: 'Kontrollér forbindelser, AI og baggrundsopgaver.' },
    { id: 'settings', label: 'Indstillinger', path: '/indstillinger', description: 'Tilpas udseende og lokale præferencer.' },
  ] },
]);

export const TOOL_NAVIGATION = Object.freeze(TOOL_NAVIGATION_GROUPS.flatMap(group => group.items));
export const ALL_NAVIGATION = Object.freeze([...PRIMARY_NAVIGATION, ...TOOL_NAVIGATION]);
