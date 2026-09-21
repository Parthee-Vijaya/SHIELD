export const PRIMARY_NAVIGATION = Object.freeze([
  { id: 'home', label: 'Startside', path: '/', hint: 'g h' },
  { id: 'procurement', label: 'Ny AI-løsning', path: '/anskaffelse', hint: 'g v' },
  { id: 'cases', label: 'Sager & godkendelse', path: '/sager', hint: 'g s' },
  { id: 'history', label: 'Historik', path: '/historik', hint: 'g i' },
]);

export const TOOL_NAVIGATION = Object.freeze([
  { id: 'assessment', label: 'Manuel konsekvensanalyse', path: '/vurdering' },
  { id: 'ai-act-assessment', label: 'AI Act-vurdering', path: '/ai-act-vurdering' },
  { id: 'fundamental-rights', label: 'Grundrettigheder', path: '/grundrettigheder' },
  { id: 'document-bank', label: 'Dokumentbank', path: '/dokumentbank' },
  { id: 'legal-screening', label: 'Juridisk screening', path: '/juridisk-screening' },
  { id: 'knowledge', label: 'Videnbase', path: '/videnbase' },
  { id: 'projects', label: 'AI-løsninger', path: '/ai-losninger' },
  { id: 'research', label: 'Juridisk research', path: '/research' },
  { id: 'law-assistant', label: 'Lovassistent', path: '/lov-assistent' },
  { id: 'eu-checker', label: 'EU AI Act-tjek', path: '/eu-checker' },
  { id: 'resources', label: 'Vejledning & links', path: '/ressourcer' },
  { id: 'about', label: 'Om løsningen', path: '/om-loesningen' },
  { id: 'law-monitoring', label: 'Lovovervågning', path: '/lov-overvaagning' },
  { id: 'operations', label: 'Drift', path: '/drift' },
  { id: 'settings', label: 'Indstillinger', path: '/indstillinger' },
]);

export const ALL_NAVIGATION = Object.freeze([
  ...PRIMARY_NAVIGATION,
  ...TOOL_NAVIGATION,
]);
