import {
  DRAFT_STORAGE_KEY,
  INITIAL_ASSESSMENT,
  loadDraft,
  toAssessmentRequest,
  validateAssessment,
} from './assessmentModel';
import { normalizePlanningDates } from './planningFields';

beforeEach(() => window.localStorage.clear());

const validAssessment = {
  ...INITIAL_ASSESSMENT,
  project_name: 'Velatir',
  organisation: 'Kalundborg Kommune',
  owner: 'Digitalisering og IT',
  purpose: 'At skabe overblik over kommunens anvendelse af AI-løsninger.',
  processing_description: 'Systemoplysninger indsamles fra medarbejdere, analyseres og slettes efter den fastsatte frist.',
  data_subjects: ['employees'],
  personal_data_categories: ['identity'],
  special_categories: false,
  criminal_data: false,
  cpr_data: false,
  vulnerable_subjects: false,
  large_scale: false,
  systematic_monitoring: false,
  profiling_scoring: false,
  data_matching: false,
  service_access_impact: false,
  automated_decisions: false,
  solution_type: 'saas',
  supplier_name: 'Velatir',
  hosting_region: 'eu_eea',
  transfer_outside_eea: false,
  model_training: false,
  retention_period: '90 dage',
  legal_basis: 'public_task',
  legal_basis_reference: 'Servicelovens § 1, stk. 1',
  legal_basis_source_url: 'https://www.retsinformation.dk/eli/lta/2026/641',
  dpo_involved: true,
  controls: ['encryption'],
  verified_controls: ['encryption'],
  control_evidence: { encryption: 'Testrapport SEC-2026-14 er godkendt.' },
  rights_procedures: ['access'],
  rights_procedure_description: 'DPO modtager anmodningen i Serviceportalen og dokumenterer svarfristen.',
};

test('en tom vurdering kan ikke sendes som et gyldigt grundlag', () => {
  const errors = validateAssessment(INITIAL_ASSESSMENT);
  expect(errors.project_name).toBeTruthy();
  expect(errors.data_subjects).toBeTruthy();
  expect(errors.solution_type).toBeTruthy();
  expect(errors.legal_basis).toBeTruthy();
});

test('et fuldt grundlag normaliseres til backend-kontrakten', () => {
  expect(validateAssessment(validAssessment)).toEqual({});
  expect(toAssessmentRequest(validAssessment)).toMatchObject({
    project_name: 'Velatir',
    transfer_mechanism: 'not_applicable',
    human_oversight: false,
    verified_controls: ['encryption'],
    control_evidence: { encryption: 'Testrapport SEC-2026-14 er godkendt.' },
  });
});

test.each([true, false, null])('modeltræning bevarer det eksplicitte svar %s uden at gøre ukendt til nej', modelTraining => {
  const values = { ...validAssessment, model_training: modelTraining };
  expect(validateAssessment(values)).toEqual({});
  expect(toAssessmentRequest(values).model_training).toBe(modelTraining);
});

test('modeltræning accepterer ikke et manglende felt eller fri tekst som et svar', () => {
  expect(validateAssessment({ ...validAssessment, model_training: undefined }).model_training).toBeTruthy();
  expect(validateAssessment({ ...validAssessment, model_training: 'unknown' }).model_training).toBeTruthy();
});

test('en planlagt kontrol reducerer ikke risiko uden verificeret evidens', () => {
  const withoutEvidence = {
    ...validAssessment,
    verified_controls: ['encryption'],
    control_evidence: {},
  };
  expect(validateAssessment(withoutEvidence)['control_evidence.encryption']).toBeTruthy();
});

test('en kladde fra det tidligere produktnavn migreres uden datatab', () => {
  const legacyKey = 'hammeren.dpia.draft.v1';
  window.localStorage.setItem(legacyKey, JSON.stringify({
    values: { project_name: 'Velatir' },
    step: 2,
    savedAt: '2026-08-30T20:00:00Z',
  }));

  expect(loadDraft()).toMatchObject({
    values: { project_name: 'Velatir' },
    step: 2,
  });
  expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeTruthy();
  expect(window.localStorage.getItem(legacyKey)).toBeNull();
});

test('fritekstdatoer flyttes tabsfrit til særskilte noter uden gæt på datoen', () => {
  const previous = { ...validAssessment, department: 'Tværgående team', processing_version: 'Pilot august 2026', planned_start_date: '1. oktober 2026 efter godkendelse', planned_start_note: 'Afhænger af leverandøren', planned_end_date: 'Fire måneder efter opstart', planned_end_condition: 'Senest ved kontraktophør' };
  const result = toAssessmentRequest(previous);
  expect(result).toMatchObject({ department: 'Tværgående team', processing_version: 'Pilot august 2026', planned_start_date: '', planned_start_note: 'Afhænger af leverandøren\n1. oktober 2026 efter godkendelse', planned_end_date: '', planned_end_condition: 'Senest ved kontraktophør\nFire måneder efter opstart' });
  expect(previous.planned_start_date).toBe('1. oktober 2026 efter godkendelse');
  expect(normalizePlanningDates(result)).toEqual(result);
});

test('kalenderdatoer bevares uden tidszonekonvertering, og umulige gamle datoer bevares som tekst', () => {
  expect(toAssessmentRequest({ ...validAssessment, planned_start_date: '2028-02-29', planned_end_date: '2028-03-01' })).toMatchObject({ planned_start_date: '2028-02-29', planned_end_date: '2028-03-01', planned_start_note: '', planned_end_condition: '' });
  expect(normalizePlanningDates({ planned_start_date: '2026-02-29', planned_end_date: '2026-13-01' })).toMatchObject({ planned_start_date: '', planned_start_note: '2026-02-29', planned_end_date: '', planned_end_condition: '2026-13-01' });
});

test('slutdato før startdato blokeres, mens ukendte datoer kan stå åbne', () => {
  expect(validateAssessment({ ...validAssessment, planned_start_date: '2026-10-02', planned_end_date: '2026-10-01' }).planned_end_date).toBeTruthy();
  expect(validateAssessment({ ...validAssessment, planned_start_note: 'Efter godkendelse', planned_end_condition: 'Efter piloten' })).toEqual({});
});
