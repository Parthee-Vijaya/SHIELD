// Verified against the municipality's live organisation overview.
// Preserve its categories; they are not interchangeable administrative levels.
export const KALUNDBORG_DEPARTMENT_SOURCE_URL = 'https://www.kalundborg.dk/kommunen/organisation';
export const KALUNDBORG_DEPARTMENT_CHECKED_AT = '2026-09-20';

export const KALUNDBORG_DEPARTMENT_GROUPS = [
  {
    label: 'Faglige enheder',
    options: [
      'Fagcenter Børn og Familie',
      'Fagcenter Børn, Læring og Uddannelse',
      'Voksenspecialenheden',
      'Jobcenter Kalundborg',
      'Sundhed og Myndighed',
      'Vej, Ejendom og Affald',
      'Plan, Byg og Miljø',
      // The short name is also used on the official /organisation/chefer-og-ledere page.
      'Kultur og Fritid',
    ],
  },
  {
    label: 'Institutioner',
    options: [
      'Skoler',
      'Dagtilbud',
      'Det Sociale Voksenområde Center 1',
      'Det Sociale Voksenområde Center 2',
      'Forebyggelse og Genoptræning',
      'Tandplejen',
      'Aktivitet og Plejehjem',
      'Hjemmepleje, Sygepleje og Døgnrehabilitering',
      'Madservice',
      'Musisk Skole',
      'Ung og Sprog',
    ],
  },
  {
    label: 'Stabsfunktioner',
    options: ['Organisationsstaben', 'Økonomistaben'],
  },
];
