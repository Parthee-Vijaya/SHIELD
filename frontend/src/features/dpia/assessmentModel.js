import { isCalendarDate, normalizePlanningDates } from './planningFields';

export const DRAFT_STORAGE_KEY = 'shield.dpia.draft.v1';
const LEGACY_DRAFT_STORAGE_KEYS = [
  'hammeren.dpia.draft.v1',
  'virkning.dpia.draft.v1',
];

export const INITIAL_ASSESSMENT = Object.freeze({
  project_name: '',
  organisation: 'Kalundborg Kommune',
  owner: '',
  department: '',
  purpose: '',
  processing_description: '',
  processing_version: '',
  planned_start_date: '',
  planned_start_note: '',
  planned_end_date: '',
  planned_end_condition: '',
  secondary_uses: '',
  data_subjects: [],
  personal_data_categories: [],
  special_categories: null,
  article_9_basis: 'not_applicable',
  criminal_data: null,
  criminal_data_basis: 'not_applicable',
  criminal_data_legal_reference: '',
  cpr_data: null,
  cpr_basis: 'not_applicable',
  cpr_legal_reference: '',
  vulnerable_subjects: null,
  large_scale: null,
  systematic_monitoring: null,
  profiling_scoring: null,
  data_matching: null,
  service_access_impact: null,
  automated_decisions: null,
  human_oversight: null,
  solution_type: '',
  supplier_name: '',
  hosting_region: '',
  transfer_outside_eea: null,
  transfer_mechanism: '',
  model_training: null,
  retention_period: '',
  legal_basis: '',
  legal_basis_reference: '',
  legal_basis_source_url: '',
  dpo_involved: null,
  controls: [],
  verified_controls: [],
  control_evidence: {},
  rights_procedures: [],
  rights_procedure_description: '',
  alternatives_considered: '',
  benefits_and_proportionality: '',
  dpo_advice: '',
  data_subject_consultation: '',
  publication_plan: '',
});

export const DATA_SUBJECT_OPTIONS = [
  ['employees', 'Medarbejdere'],
  ['citizens', 'Borgere'],
  ['children', 'Børn og unge'],
  ['customers', 'Kunder eller brugere'],
  ['suppliers', 'Leverandører og samarbejdspartnere'],
  ['applicants', 'Ansøgere'],
  ['other', 'Andre registrerede'],
];

export const DATA_CATEGORY_OPTIONS = [
  ['identity', 'Identitets- og kontaktoplysninger'],
  ['employment', 'Ansættelsesoplysninger'],
  ['financial', 'Økonomiske oplysninger'],
  ['case_data', 'Sags- og ydelsesoplysninger'],
  ['usage_data', 'Brugs-, log- og telemetridata'],
  ['location', 'Lokationsoplysninger'],
  ['communications', 'Kommunikation og dokumentindhold'],
  ['images_audio', 'Billeder, lyd eller video'],
  ['other', 'Andre personoplysninger'],
];

export const CONTROL_OPTIONS = [
  ['access_control', 'Rollebaseret adgang og mindst mulige rettigheder'],
  ['encryption', 'Kryptering under transport og lagring'],
  ['logging', 'Logning, overvågning og sporbarhed'],
  ['data_minimisation', 'Dataminimering og formålsbegrænsning'],
  ['retention_deletion', 'Automatisk sletning og dokumenterede frister'],
  ['vendor_management', 'Databehandleraftale og leverandørkontrol'],
  ['human_review', 'Reel menneskelig kontrol og klagevej'],
  ['testing', 'Løbende test af kvalitet, bias og sikkerhed'],
  ['incident_response', 'Beredskab for brud og hændelser'],
  ['training', 'Instruktion og uddannelse af brugere'],
];

export const RIGHTS_PROCEDURE_OPTIONS = [
  ['information', 'Oplysningspligt og privatlivsinformation'],
  ['access', 'Indsigt'],
  ['rectification', 'Berigtigelse'],
  ['erasure', 'Sletning'],
  ['restriction', 'Begrænsning'],
  ['portability', 'Dataportabilitet'],
  ['objection', 'Indsigelse'],
  ['automated_decision_review', 'Menneskelig prøvelse af automatiske afgørelser'],
];

export const OPTION_LABELS = Object.freeze({
  solution_type: {
    ai_system: 'AI-system eller model',
    saas: 'Cloud/SaaS-løsning',
    internal_system: 'Internt udviklet system',
    integration: 'Integration eller tilføjelse',
    other: 'Anden løsning',
  },
  hosting_region: {
    denmark: 'Danmark',
    eu_eea: 'EU/EØS',
    third_country: 'Tredjeland',
    unknown: 'Ikke afklaret',
  },
  legal_basis: {
    public_task: 'Opgave i samfundets interesse / offentlig myndighed',
    legal_obligation: 'Retlig forpligtelse',
    contract: 'Kontrakt',
    consent: 'Samtykke',
    legitimate_interests: 'Legitim interesse',
    not_assessed: 'Ikke afklaret endnu',
  },
  transfer_mechanism: {
    not_applicable: 'Ikke relevant',
    adequacy_decision: 'Tilstrækkelighedsafgørelse',
    scc: 'EU-standardkontraktbestemmelser (SCC)',
    bcr: 'Bindende virksomhedsregler (BCR)',
    derogation: 'Undtagelse efter GDPR artikel 49',
    not_assessed: 'Ikke afklaret endnu',
  },
  article_9_basis: {
    explicit_consent: 'Udtrykkeligt samtykke – artikel 9, stk. 2, litra a',
    employment_social_security: 'Arbejds-, sundheds- og socialret – litra b',
    vital_interests: 'Vitale interesser – litra c',
    nonprofit_members: 'Nonprofit-organisations medlemmer – litra d',
    manifestly_public: 'Oplysninger tydeligvis offentliggjort – litra e',
    legal_claims: 'Retskrav eller domstole – litra f',
    substantial_public_interest: 'Væsentlige samfundsinteresser – litra g',
    health_social_care: 'Sundheds- eller socialomsorg – litra h',
    public_health: 'Folkesundhed – litra i',
    research_statistics: 'Arkiv, forskning eller statistik – litra j',
    not_assessed: 'Ikke afklaret endnu',
  },
  criminal_data_basis: {
    public_authority_necessary: 'Nødvendig behandling for offentlig myndighed',
    explicit_consent: 'Udtrykkeligt samtykke',
    legitimate_interest_clearly_outweighs: 'Legitim interesse, der klart overstiger hensynet til den registrerede',
    legal_claims: 'Retskrav',
    not_assessed: 'Ikke afklaret endnu',
  },
  cpr_basis: {
    statutory_authority: 'Udtrykkelig lovhjemmel',
    explicit_consent: 'Udtrykkeligt samtykke',
    article_9_basis: 'Behandling omfattet af GDPR artikel 9-grundlag',
    public_authority_disclosure: 'Videregivelse fra offentlig myndighed efter loven',
    not_assessed: 'Ikke afklaret endnu',
  },
});

const requiredText = (value, minimum = 1) => typeof value === 'string' && value.trim().length >= minimum;

const ARTICLE_9_REQUIRING_SPECIFIC_LAW = new Set([
  'employment_social_security',
  'substantial_public_interest',
  'health_social_care',
  'public_health',
  'research_statistics',
]);

export const requiresOfficialLegalSource = values => (
  ['public_task', 'legal_obligation'].includes(values.legal_basis)
  || (values.special_categories === true && ARTICLE_9_REQUIRING_SPECIFIC_LAW.has(values.article_9_basis))
);

const isOfficialRetsinformationUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['retsinformation.dk', 'www.retsinformation.dk'].includes(url.hostname.toLowerCase())
      && /^\/eli\/lta\/\d{4}\/\d+(?:\/(?:dan|xml|rawhtml|pdf))*\/?$/i.test(url.pathname);
  } catch (_) {
    return false;
  }
};

export const validateStep = (step, values) => {
  const errors = {};

  if (step === 0) {
    if (!requiredText(values.project_name, 2)) errors.project_name = 'Angiv et navn på løsningen eller projektet.';
    if (!requiredText(values.organisation, 2)) errors.organisation = 'Angiv den dataansvarlige organisation.';
    if (!requiredText(values.owner, 2)) errors.owner = 'Angiv en faglig eller organisatorisk ejer.';
    if (isCalendarDate(values.planned_start_date) && isCalendarDate(values.planned_end_date) && values.planned_end_date < values.planned_start_date) errors.planned_end_date = 'Slutdatoen skal ligge på eller efter startdatoen.';
    if (!requiredText(values.purpose, 20)) errors.purpose = 'Beskriv formålet med mindst 20 tegn.';
    if (!requiredText(values.processing_description, 40)) {
      errors.processing_description = 'Beskriv behandlingen med mindst 40 tegn, herunder datakilder og modtagere.';
    }
  }

  if (step === 1) {
    if (!values.data_subjects?.length) errors.data_subjects = 'Vælg mindst én gruppe af registrerede.';
    if (!values.personal_data_categories?.length) {
      errors.personal_data_categories = 'Vælg mindst én kategori af personoplysninger.';
    }
    ['special_categories', 'criminal_data', 'cpr_data', 'vulnerable_subjects', 'large_scale', 'systematic_monitoring']
      .forEach((field) => {
        if (typeof values[field] !== 'boolean') errors[field] = 'Vælg ja eller nej.';
      });
    if (values.special_categories === true && ['not_applicable', ''].includes(values.article_9_basis)) {
      errors.article_9_basis = 'Vælg artikel 9-grundlag eller markér, at det ikke er afklaret.';
    }
    if (values.criminal_data === true && ['not_applicable', ''].includes(values.criminal_data_basis)) {
      errors.criminal_data_basis = 'Vælg hjemmel eller markér, at den ikke er afklaret.';
    }
    if (values.criminal_data === true && values.criminal_data_basis !== 'not_assessed' && !requiredText(values.criminal_data_legal_reference, 5)) {
      errors.criminal_data_legal_reference = 'Angiv den konkrete lovbestemmelse eller anden dokumenteret reference.';
    }
    if (values.cpr_data === true && ['not_applicable', ''].includes(values.cpr_basis)) {
      errors.cpr_basis = 'Vælg CPR-grundlag eller markér, at det ikke er afklaret.';
    }
    if (values.cpr_data === true && values.cpr_basis !== 'not_assessed' && !requiredText(values.cpr_legal_reference, 5)) {
      errors.cpr_legal_reference = 'Angiv den konkrete lovbestemmelse eller anden dokumenteret reference.';
    }
    if (values.data_subjects?.includes('children') && values.vulnerable_subjects !== true) {
      errors.vulnerable_subjects = 'Børn og unge skal markeres som sårbare registrerede.';
    }
  }

  if (step === 2) {
    if (!requiredText(values.solution_type)) errors.solution_type = 'Vælg løsningstype.';
    if (['ai_system', 'saas', 'integration'].includes(values.solution_type) && !requiredText(values.supplier_name, 2)) {
      errors.supplier_name = 'Angiv leverandør eller udviklingsansvarlig.';
    }
    if (!requiredText(values.hosting_region)) errors.hosting_region = 'Vælg hvor løsningen hostes.';
    [
      'transfer_outside_eea',
      'profiling_scoring',
      'data_matching',
      'service_access_impact',
      'automated_decisions',
    ].forEach((field) => {
      if (typeof values[field] !== 'boolean') errors[field] = 'Vælg ja eller nej.';
    });
    if (values.model_training !== null && typeof values.model_training !== 'boolean') {
      errors.model_training = 'Vælg ja, nej eller ikke afklaret.';
    }
    if (values.transfer_outside_eea === true && !requiredText(values.transfer_mechanism)) {
      errors.transfer_mechanism = 'Vælg overførselsgrundlag eller markér, at det ikke er afklaret.';
    }
    if (values.hosting_region === 'third_country' && values.transfer_outside_eea !== true) {
      errors.transfer_outside_eea = 'Tredjelands-hosting skal registreres som overførsel uden for EU/EØS.';
    }
    if (values.automated_decisions === true && typeof values.human_oversight !== 'boolean') {
      errors.human_oversight = 'Tag stilling til menneskelig kontrol.';
    }
  }

  if (step === 3) {
    if (!requiredText(values.retention_period, 2)) errors.retention_period = 'Angiv en slette- eller opbevaringsfrist.';
    if (!requiredText(values.legal_basis)) errors.legal_basis = 'Vælg behandlingsgrundlag.';
    if (requiresOfficialLegalSource(values) && !requiredText(values.legal_basis_reference, 5)) {
      errors.legal_basis_reference = 'Angiv den konkrete sektorlov og bestemmelse, som opgaven eller forpligtelsen bygger på.';
    }
    if (requiresOfficialLegalSource(values) && !isOfficialRetsinformationUrl(values.legal_basis_source_url)) {
      errors.legal_basis_source_url = 'Indsæt det officielle HTTPS-link til loven på Retsinformation.';
    }
    if (typeof values.dpo_involved !== 'boolean') errors.dpo_involved = 'Vælg ja eller nej.';
    (values.verified_controls || []).forEach((control) => {
      if (!values.controls?.includes(control)) {
        errors.verified_controls = 'En verificeret kontrol skal også være valgt som planlagt eller oplyst.';
      }
      if (!requiredText(values.control_evidence?.[control], 10)) {
        errors[`control_evidence.${control}`] = 'Beskriv evidensen med mindst 10 tegn.';
      }
    });
    if (values.rights_procedures?.length && !requiredText(values.rights_procedure_description, 20)) {
      errors.rights_procedure_description = 'Beskriv ansvar, kanal og arbejdsgang med mindst 20 tegn.';
    }
  }

  return errors;
};

export const validateAssessment = (values) => [0, 1, 2, 3].reduce(
  (allErrors, step) => ({ ...allErrors, ...validateStep(step, values) }),
  {},
);

export const toAssessmentRequest = (input) => {
  const values = normalizePlanningDates(input);
  return ({
  ...values,
  project_name: values.project_name.trim(),
  organisation: values.organisation.trim(),
  owner: values.owner.trim(),
  department: (values.department || '').trim(),
  purpose: values.purpose.trim(),
  processing_description: values.processing_description.trim(),
  processing_version: values.processing_version.trim(),
  planned_start_date: values.planned_start_date.trim(),
  planned_start_note: values.planned_start_note.trim(),
  planned_end_date: values.planned_end_date.trim(),
  planned_end_condition: values.planned_end_condition.trim(),
  secondary_uses: values.secondary_uses.trim(),
  supplier_name: values.supplier_name.trim(),
  retention_period: values.retention_period.trim(),
  legal_basis_reference: values.legal_basis_reference.trim(),
  legal_basis_source_url: (values.legal_basis_source_url || '').trim(),
  article_9_basis: values.special_categories ? values.article_9_basis : 'not_applicable',
  criminal_data_basis: values.criminal_data ? values.criminal_data_basis : 'not_applicable',
  criminal_data_legal_reference: values.criminal_data ? values.criminal_data_legal_reference.trim() : '',
  cpr_basis: values.cpr_data ? values.cpr_basis : 'not_applicable',
  cpr_legal_reference: values.cpr_data ? values.cpr_legal_reference.trim() : '',
  transfer_mechanism: values.transfer_outside_eea
    ? values.transfer_mechanism
    : 'not_applicable',
  human_oversight: values.automated_decisions ? Boolean(values.human_oversight) : false,
  verified_controls: (values.verified_controls || []).filter(control => values.controls?.includes(control)),
  control_evidence: Object.fromEntries(
    (values.verified_controls || [])
      .filter(control => values.controls?.includes(control))
      .map(control => [control, String(values.control_evidence?.[control] || '').trim()]),
  ),
  rights_procedure_description: values.rights_procedure_description.trim(),
  alternatives_considered: values.alternatives_considered.trim(),
  benefits_and_proportionality: values.benefits_and_proportionality.trim(),
  dpo_advice: values.dpo_advice.trim(),
  data_subject_consultation: values.data_subject_consultation.trim(),
  publication_plan: values.publication_plan.trim(),
  });
};

export const loadDraft = (storageKey = DRAFT_STORAGE_KEY) => {
  if (typeof window === 'undefined') return null;
  try {
    const currentDraft = window.localStorage.getItem(storageKey);
    const legacyKey = storageKey === DRAFT_STORAGE_KEY && LEGACY_DRAFT_STORAGE_KEYS.find(
      key => window.localStorage.getItem(key),
    );
    const legacyDraft = legacyKey ? window.localStorage.getItem(legacyKey) : null;
    const rawDraft = currentDraft || legacyDraft;
    if (legacyDraft && legacyKey) {
      if (!currentDraft) window.localStorage.setItem(DRAFT_STORAGE_KEY, legacyDraft);
      LEGACY_DRAFT_STORAGE_KEYS.forEach(key => window.localStorage.removeItem(key));
    }
    const saved = JSON.parse(rawDraft);
    if (!saved?.values || typeof saved.values !== 'object') return null;
    return {
      values: normalizePlanningDates({ ...INITIAL_ASSESSMENT, ...saved.values }),
      step: Number.isInteger(saved.step) ? Math.max(0, Math.min(3, saved.step)) : 0,
      savedAt: saved.savedAt || null,
    };
  } catch (_) {
    return null;
  }
};
