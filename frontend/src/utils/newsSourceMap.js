import datatilsynetLogo from '../assets/logos/datatilsynet.svg';
import klLogo from '../assets/logos/kl.svg';
import kammeradvokatenLogo from '../assets/logos/kammeradvokaten.svg';
import euLogo from '../assets/logos/eu.svg';
import edpbLogo from '../assets/logos/edpb.svg';
import defaultLogo from '../assets/logos/default.svg';
import jurainfoLogo from '../assets/logos/jurainfo.svg';
import knewsLogo from '../assets/logos/knews.svg';
import propriaLogo from '../assets/logos/propriaai.svg';
import danskErhvervLogo from '../assets/logos/dansk_erhverv.svg';
import danskIndustriLogo from '../assets/logos/dansk_industri.svg';

export const SOURCE_MAPPINGS = [
  {
    matchers: ['datatilsynet'],
    id: 'datatilsynet',
    name: 'Datatilsynet',
    region: 'Danmark',
    logo: datatilsynetLogo,
    accent: '#B80021',
  },
  {
    matchers: ['kl', 'kommunernes landsforening'],
    id: 'kl',
    name: 'KL - Kommunernes Landsforening',
    region: 'Danmark',
    logo: klLogo,
    accent: '#0058A3',
  },
  {
    matchers: ['kammeradvokaten', 'advokatfirmaet'],
    id: 'kammeradvokaten',
    name: 'Kammeradvokaten',
    region: 'Danmark',
    logo: kammeradvokatenLogo,
    accent: '#1F2937',
  },
  {
    matchers: ['edpb', 'european data protection board'],
    id: 'edpb',
    name: 'EDPB',
    region: 'EU',
    logo: edpbLogo,
    accent: '#0C2340',
  },
  {
    matchers: ['eu commission', 'eu-kommissionen', 'commission europa', 'europa.eu', 'eur-lex', 'council of eu', 'consilium', 'european union'],
    id: 'eu',
    name: 'EU Institutioner',
    region: 'EU',
    logo: euLogo,
    accent: '#0B3D91',
  },
  {
    matchers: ['jurainfo'],
    id: 'jurainfo',
    name: 'JuraInfo',
    region: 'Danmark',
    logo: jurainfoLogo,
    accent: '#0B3D91',
  },
  {
    matchers: ['k-news', 'knews', 'karnov'],
    id: 'knews',
    name: 'K-News',
    region: 'Danmark',
    logo: knewsLogo,
    accent: '#1F2937',
  },
  {
    matchers: ['propria'],
    id: 'propria_ai',
    name: 'PropriaAI',
    region: 'International',
    logo: propriaLogo,
    accent: '#0E7C7B',
  },
  {
    matchers: ['dansk erhverv', 'danish chamber of commerce'],
    id: 'dansk_erhverv',
    name: 'Dansk Erhverv',
    region: 'Danmark',
    logo: danskErhvervLogo,
    accent: '#003D7C',
  },
  {
    matchers: ['dansk industri', 'di business'],
    id: 'dansk_industri',
    name: 'Dansk Industri',
    region: 'Danmark',
    logo: danskIndustriLogo,
    accent: '#005B96',
  },
  {
    matchers: ['retsinformation', 'ministeriet', 'folketinget', 'lovtidende'],
    id: 'danish_authorities',
    name: 'Danske myndigheder',
    region: 'Danmark',
    logo: defaultLogo,
    accent: '#4B5563',
  },
];

export function resolveSourceMeta(sourceName = '') {
  const normalized = sourceName.toLowerCase();
  const mapping = SOURCE_MAPPINGS.find(({ matchers }) =>
    matchers.some((matcher) => normalized.includes(matcher))
  );

  if (!mapping) {
    return {
      id: 'other',
      name: sourceName,
      region: 'International',
      logo: defaultLogo,
      accent: '#4B5563',
    };
  }

  return {
    ...mapping,
    name: sourceName || mapping.name,
  };
}

export function availableCategories() {
  return [
    { key: 'all', label: 'Alle kilder' },
    { key: 'datatilsynet', label: 'Datatilsynet' },
    { key: 'kl', label: 'KL' },
    { key: 'kammeradvokaten', label: 'Kammeradvokaten' },
    { key: 'edpb', label: 'EDPB' },
    { key: 'eu', label: 'EU institutioner' },
    { key: 'jurainfo', label: 'JuraInfo' },
    { key: 'knews', label: 'K-News' },
    { key: 'propria_ai', label: 'PropriaAI' },
    { key: 'dansk_erhverv', label: 'Dansk Erhverv' },
    { key: 'dansk_industri', label: 'Dansk Industri' },
    { key: 'danish_authorities', label: 'Danske myndigheder' },
  ];
}
