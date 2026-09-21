import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { DRAFT_STORAGE_KEY, INITIAL_ASSESSMENT } from '../features/dpia/assessmentModel';
import DpiaAssessmentPage from './DpiaAssessmentPage';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));

const saved = {
  id: 'assessment-1', version: 1, case_db_id: 'case-1',
  project_name: 'Historisk journalsystem', organisation: 'Kalundborg Kommune',
  created_at: '2026-09-20T10:00:00Z', status_label: 'Kræver faglig gennemgang',
  executive_summary: 'Gemte oplysninger fra den konkrete sag.', risk_level: 'high',
  completeness: 80, dpia_required: true, template_version: 'dt-ai-2024',
  sections: [{ id: 'scope', title: 'Formål og afgrænsning', text: 'Dokumenteret formål i den gemte sag.', source: 'provided_input' }],
  risks: [{ id: '3.1', area: 'Adgang', scenario: 'Uvedkommende får adgang.', likelihood: 3, impact: 3, inherent_risk: 'high', residual_likelihood: 2, residual_impact: 3, residual_risk: 'high', measures: 'Adgangskontrol.', owner: 'Sagsejer' }],
};
const generated = {
  ...saved, id: 'assessment-2', version: 2, parent_assessment_id: saved.id,
  executive_summary: 'Ny rapport baseret på sagens dokumenter.',
  ai_generation: {
    model: 'openai/gpt-5.5',
    sources: [
      { id: 'case-source', title: 'Sagens dokumentation', source_url: 'https://example.org/dpa', retrieved_at: '2026-09-20T09:00:00Z' },
      { id: 'invalid-source', title: 'Ugyldig kilde', source_url: 'javascript:alert(1)' },
      { id: 'credential-source', title: 'Kilde med login', source_url: 'https://user:example@example.org/dpa' },
    ],
    review: { model: 'typesafe-ai/jev', checks: [{ id: 'evidence', label: 'Dokumentation af hjemmel', section_ids: ['section:scope'], probability: 0.74, requires_review: true }] },
  },
  open_questions: ['Hvem foretager den faglige gennemgang?'],
};

const response = (payload, ok = true, status = 200) => Promise.resolve({ ok, status, json: async () => payload });

function CurrentLocation() {
  const location = useLocation();
  return <output aria-label="Aktuel adresse">{location.search}</output>;
}

function mount(url = '/vurdering?assessment_id=assessment-1') {
  return render(<ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={[url]}><DpiaAssessmentPage /><CurrentLocation /></MemoryRouter></ThemeProvider>);
}

let authFetch;
beforeEach(() => {
  window.localStorage.clear();
  authFetch = jest.fn(url => {
    if (url === '/api/dpia/ai/status') return response({ configured: true, model: 'openai/gpt-5.5', evaluator_model: 'typesafe-ai/jev' });
    if (url === '/api/dpia/assessments/assessment-1') return response(saved);
    throw new Error(`Unexpected request: ${url}`);
  });
  useAuth.mockReturnValue({ authFetch });
});

test('en gemt rapport viser sin egen dataansvarlige organisation frem for portalens kommune', async () => {
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation(url => url === '/api/dpia/assessments/assessment-1'
    ? response({ ...saved, organisation: 'Eksempel Kommune' })
    : baseFetch(url));
  mount();
  const label = await screen.findByText('Dataansvarlig organisation:');
  expect(label.closest('p')).toHaveTextContent('Dataansvarlig organisation: Eksempel Kommune');
  expect(label.closest('p')).not.toHaveTextContent('Kalundborg');
});

test('bruger kun gennemgåede oplysninger fra den valgte sag og lader andre kladder være', async () => {
  const original = JSON.stringify({values:{project_name:'En anden sag',special_categories:false},step:2});
  window.localStorage.setItem(DRAFT_STORAGE_KEY, original);
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation(url => url.includes('/procurement/reviews/') ? response({id:'review-1',case_id:'case-1',dpia_prefill:{project_name:'Acadre',purpose:'Journalisering af administrative sager',owner:'Digitalisering',department:'Organisationsstaben'}}) : baseFetch(url));
  mount('/vurdering?case=case-1&procurement_review=review-1');
  expect(await screen.findByDisplayValue('Acadre')).toBeInTheDocument();
  expect(screen.getByText('Grundlag fra gennemgået leverandørmateriale')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('En anden sag')).not.toBeInTheDocument();
  await act(async () => new Promise(resolve => setTimeout(resolve, 400)));
  expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(original);
  const scoped = JSON.parse(window.localStorage.getItem(`${DRAFT_STORAGE_KEY}:case-1:review-1`));
  expect(scoped.values.project_name).toBe('Acadre');
  expect(scoped.values.special_categories).toBeNull();
  expect(scoped.values.verified_controls).toEqual([]);
  expect(authFetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
});

test('stopper forældet leverandørgrundlag før formularen kan bruges', async () => {
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation(url => url.includes('/procurement/reviews/') ? response({detail:'Kilder eller oplysninger er ændret.'},false,409) : baseFetch(url));
  mount('/vurdering?case=case-1&procurement_review=review-1');
  expect(await screen.findByRole('alert')).toHaveTextContent('Kilder eller oplysninger er ændret.');
  expect(screen.queryByRole('button',{name:'Udarbejd vurdering'})).not.toBeInTheDocument();
});

test('modeltræning kan ændres fra nej til ikke afklaret og bevares som null i kladden', async () => {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ values: { model_training: false }, step: 2 }));
  mount('/vurdering');
  const question = screen.getByRole('group', { name: 'Bruges organisationens input eller output til træning af modeller?' });
  expect(within(question).getByRole('radio', { name: 'Nej' })).toBeChecked();
  fireEvent.click(within(question).getByRole('radio', { name: 'Ikke afklaret' }));
  expect(within(question).getByRole('radio', { name: 'Ikke afklaret' })).toBeChecked();
  expect(within(question).getByRole('radio', { name: 'Nej' })).not.toBeChecked();
  await waitFor(() => expect(JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY)).values.model_training).toBeNull());
  expect(authFetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
});

test.each([
  ['large_scale', 1, 'Sker behandlingen i stort omfang?'],
  ['transfer_outside_eea', 2, 'Overføres eller tilgås data uden for EU/EØS?'],
  ['human_oversight', 2, 'Er reel menneskelig kontrol af løsningens output etableret?'],
  ['dpo_involved', 3, 'Er DPO/databeskyttelsesrådgiver inddraget?'],
])('%s kan markeres uafklaret uden at ændre andre svar', async (field, step, label) => {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ values: { [field]: false, automated_decisions: false }, step }));
  mount('/vurdering');
  const question = screen.getByRole('group', { name: label });
  expect(within(question).getByRole('radio', { name: 'Nej' })).toBeChecked();
  fireEvent.click(within(question).getByRole('radio', { name: 'Ikke afklaret' }));
  expect(within(question).getByRole('radio', { name: 'Ikke afklaret' })).toBeChecked();
  await waitFor(() => expect(JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY)).values[field]).toBeNull());
  expect(JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY)).values.automated_decisions).toBe(false);
  if (field === 'transfer_outside_eea') {
    expect(screen.getByRole('combobox', { name: 'Overførselsgrundlag' })).toHaveValue('not_assessed');
    expect(screen.getByRole('combobox', { name: 'Overførselsgrundlag' })).toBeDisabled();
  }
  expect(authFetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
});

test('sender en vurdering med fire uafklarede svar uden at opfinde negative oplysninger', async () => {
  const values = {
    ...INITIAL_ASSESSMENT, project_name: 'Dokumentassistent', organisation: 'Eksempel Kommune', owner: 'Kontaktperson',
    purpose: 'Dokumentgennemgang i forbindelse med aktindsigt i kommunen.',
    processing_description: 'Dokumenter indlæses, forslag til anonymisering gennemgås og output eksporteres til sagsbehandlingen.',
    data_subjects: ['citizens'], personal_data_categories: ['case_data'], special_categories: false, criminal_data: false,
    cpr_data: false, vulnerable_subjects: false, systematic_monitoring: false, profiling_scoring: false,
    data_matching: false, service_access_impact: false, automated_decisions: false,
    solution_type: 'ai_system', supplier_name: 'Eksempel ApS', hosting_region: 'unknown',
    transfer_mechanism: 'scc', model_training: null, retention_period: 'Afventer dokumenteret slettefrist.', legal_basis: 'not_assessed',
    large_scale: null, transfer_outside_eea: null, dpo_involved: null, human_oversight: null,
  };
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ values, step: 3 }));
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation((url, options) => url === '/api/dpia/assessments' ? response({ ...saved, status_label: 'Blokeret – mangler kritiske oplysninger' }) : baseFetch(url, options));
  mount('/vurdering');
  fireEvent.click(screen.getByRole('button', { name: 'Udarbejd vurdering' }));
  await screen.findByText('Blokeret – mangler kritiske oplysninger');
  const request = authFetch.mock.calls.find(([url]) => url === '/api/dpia/assessments');
  expect(JSON.parse(request[1].body)).toMatchObject({ large_scale: null, transfer_outside_eea: null, transfer_mechanism: 'not_assessed', dpo_involved: null, human_oversight: null, automated_decisions: false, verified_controls: [] });
});

test('et ukendt screeningkriterium vises som ikke afklaret og aldrig som matcher ikke', async () => {
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation((url, options) => url === '/api/dpia/assessments/assessment-1' ? response({ ...saved, screening_criteria: [{ id: 'large_scale', label: 'Behandling i stort omfang', matched: null, explanation: 'Behandlingens omfang er ikke afklaret.' }] }) : baseFetch(url, options));
  mount();
  await screen.findByText('Behandling i stort omfang');
  expect(screen.getByText('Ikke afklaret')).toBeInTheDocument();
  expect(screen.queryByText('Matcher ikke')).not.toBeInTheDocument();
});

test('genåbner en gemt vurdering med sagslink, risikofelter og uden at erstatte den lokale kladde', async () => {
  const draft = JSON.stringify({ values: { project_name: 'Min igangværende kladde' }, step: 0 });
  window.localStorage.setItem(DRAFT_STORAGE_KEY, draft);
  mount();
  expect(await screen.findByText(saved.executive_summary)).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: saved.project_name })).toBeInTheDocument();
  expect(screen.getByText('Dokumenteret formål i den gemte sag.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /Risikovurdering/ }));
  fireEvent.click(screen.getByRole('button', { name: /3\.1 · Adgang/ }));
  expect(screen.getByText('Sandsynlighed efter')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Tilbage til samlet sag' })).toHaveAttribute('href', '/sager/case-1');
  expect(screen.getByRole('link', { name: 'Teknisk kørsel' })).toHaveAttribute('href', '/sager/case-1?tab=technical-runs&assessment_id=assessment-1');
  expect(screen.queryByRole('button', { name: 'Redigér oplysninger' })).not.toBeInTheDocument();
  expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(draft);
  expect(authFetch.mock.calls.filter(([url]) => url.endsWith('/generate'))).toHaveLength(0);
});

test('AI udarbejdes kun ved klik og skifter til en ny gemt version med JEV-opfølgning', async () => {
  let finishGeneration;
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation((url, options) => url.endsWith('/generate')
    ? new Promise(resolve => { finishGeneration = () => resolve({ ok: true, json: async () => generated }); })
    : baseFetch(url, options));
  mount();
  const button = await screen.findByRole('button', { name: 'Udarbejd med AI' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  fireEvent.click(button);
  expect(screen.getByRole('button', { name: 'Udarbejder og kvalitetstjekker…' })).toBeDisabled();
  expect(authFetch.mock.calls.filter(([url]) => url.endsWith('/generate'))).toHaveLength(1);
  expect(authFetch).toHaveBeenCalledWith('/api/dpia/assessments/assessment-1/generate', expect.objectContaining({ method: 'POST' }));
  await act(async () => finishGeneration());
  expect(await screen.findByText(generated.executive_summary)).toBeInTheDocument();
  expect(screen.getByLabelText('Aktuel adresse')).toHaveTextContent('assessment_id=assessment-2');
  expect(screen.getByRole('link', { name: 'Se foregående version' })).toHaveAttribute('href', '/vurdering?assessment_id=assessment-1&case=case-1');
  expect(screen.getByRole('heading', { name: 'Kvalitetstjek med JEV' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Opret ny AI-version' })).toBeInTheDocument();
  expect(screen.queryByText('Codex-test')).not.toBeInTheDocument();
  expect(screen.getByText('Se kontrolpunktet').closest('details')).not.toHaveAttribute('open');
  expect(screen.getByText('JEV: Dokumentation af hjemmel — kræver opfølgning.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Kilder' }));
  expect(screen.getByRole('link', { name: 'Åbn kilde' })).toHaveAttribute('href', 'https://example.org/dpa');
  expect(screen.getByText(/^Hentet /)).toHaveTextContent('2026');
  expect(screen.queryByText(/0\.74|74%/)).not.toBeInTheDocument();
  expect(authFetch.mock.calls.filter(([url]) => url === '/api/dpia/assessments/assessment-2')).toHaveLength(0);
});

test.each(['gpt-5.6-sol', 'gpt-6-astra'])('viser en gemt Codex-test med %s uden automatisk modelkald', async model => {
  const codexResult = {
    ...generated,
    ai_generation: { ...generated.ai_generation, provider: 'codex-local-test', model, run_id: 'codex-test-1' },
  };
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation((url, options) => url === '/api/dpia/assessments/assessment-2'
    ? response(codexResult)
    : url.endsWith('/generate')
      ? response({ detail: 'AI Gateway er midlertidigt utilgængelig.' }, false, 503)
      : baseFetch(url, options));
  mount('/vurdering?assessment_id=assessment-2&case=case-1');
  expect(await screen.findByText('Codex-test')).toBeInTheDocument();
  expect(screen.getByText(`Udarbejdet som test i Codex med ${model}. Kontrolleret med typesafe-ai/jev.`)).toBeInTheDocument();
  expect(screen.getByText('Codex-tests startes i Codex og gemmes på sagen. Knappen ovenfor opretter en ny version via AI Gateway.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Opret ny AI-version' })).not.toBeInTheDocument();
  expect(authFetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);

  const button = screen.getByRole('button', { name: 'Opret via AI Gateway' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('AI Gateway er midlertidigt utilgængelig.');
  expect(authFetch).toHaveBeenCalledWith('/api/dpia/assessments/assessment-2/generate', expect.objectContaining({ method: 'POST' }));
  expect(authFetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  expect(screen.getByText(codexResult.executive_summary)).toBeInTheDocument();
  expect(screen.getByText('Codex-test')).toBeInTheDocument();
});

test('en gemt Codex-test aktiverer ikke Gateway-knappen når Gateway mangler', async () => {
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation((url, options) => url === '/api/dpia/ai/status'
    ? response({ configured: false })
    : url === '/api/dpia/assessments/assessment-2'
      ? response({ ...generated, ai_generation: { ...generated.ai_generation, provider: 'codex-local-test', model: 'gpt-5.6-sol' } })
      : baseFetch(url, options));
  mount('/vurdering?assessment_id=assessment-2');
  expect(await screen.findByText('Codex-test')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Opret via AI Gateway' })).toBeDisabled();
  expect(screen.getByText('AI-udarbejdelse er ikke tilgængelig på serveren i øjeblikket.')).toBeInTheDocument();
  expect(authFetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
});

test.each(['gpt-5.6-sol', 'gpt-6-astra'])('viser et planlagt kommunalt Codex-udkast med %s uden testmærkning eller automatisk Gateway-kald', async model => {
  const codexResult = {
    ...generated,
    project_name: 'AI-referater til kommunale projektmøder',
    ai_generation: { ...generated.ai_generation, provider: 'codex-local', model, run_id: 'municipal-scenario-1', model_run_provenance: 'operator_reported' },
  };
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation((url, options) => url === '/api/dpia/assessments/assessment-2'
    ? response(codexResult)
    : url.endsWith('/generate')
      ? response({ detail: 'AI Gateway er midlertidigt utilgængelig.' }, false, 503)
      : baseFetch(url, options));
  mount('/vurdering?assessment_id=assessment-2&case=case-1');
  expect(await screen.findByText('Udarbejdet i Codex')).toBeInTheDocument();
  expect(screen.getByText(`Udarbejdet i Codex med ${model}. Kontrolleret med typesafe-ai/jev.`)).toBeInTheDocument();
  expect(screen.getByText('Udkastet er udarbejdet i Codex. Model og kørsels-ID er oplyst ved importen. Knappen ovenfor opretter en ny version via AI Gateway.')).toBeInTheDocument();
  expect(screen.queryByText('Codex-test')).not.toBeInTheDocument();
  expect(screen.queryByText(/Udarbejdet som test i Codex/)).not.toBeInTheDocument();
  expect(authFetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  const button = screen.getByRole('button', { name: 'Opret via AI Gateway' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('AI Gateway er midlertidigt utilgængelig.');
  expect(authFetch).toHaveBeenCalledWith('/api/dpia/assessments/assessment-2/generate', expect.objectContaining({ method: 'POST' }));
  expect(screen.getByText(`Udarbejdet i Codex med ${model}. Kontrolleret med typesafe-ai/jev.`)).toBeInTheDocument();
});

test('et lokalt Codex-udkast aktiverer ikke Gateway-knappen når Gateway mangler', async () => {
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation((url, options) => url === '/api/dpia/ai/status'
    ? response({ configured: false })
    : url === '/api/dpia/assessments/assessment-2'
      ? response({ ...generated, ai_generation: { ...generated.ai_generation, provider: 'codex-local', model: 'gpt-6-astra' } })
      : baseFetch(url, options));
  mount('/vurdering?assessment_id=assessment-2');
  expect(await screen.findByText('Udarbejdet i Codex')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Opret via AI Gateway' })).toBeDisabled();
  expect(screen.queryByText('Codex-test')).not.toBeInTheDocument();
  expect(authFetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
});

test('faner adskiller analysen og risici og kan vælges med tastaturet uden modelkald', async () => {
  mount();
  const analysisTab = await screen.findByRole('tab', { name: 'Konsekvensanalyse' });
  expect(analysisTab).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel', { name: 'Konsekvensanalyse' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Risikovurdering' })).not.toBeInTheDocument();
  fireEvent.keyDown(analysisTab, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: /Risikovurdering/ })).toHaveFocus();
  expect(screen.getByRole('heading', { name: 'Risikovurdering' })).toBeVisible();
  fireEvent.keyDown(screen.getByRole('tab', { name: /Risikovurdering/ }), { key: 'End' });
  expect(screen.getByRole('tab', { name: 'Kilder' })).toHaveAttribute('aria-selected', 'true');
  expect(authFetch.mock.calls.filter(([url]) => url.endsWith('/generate'))).toHaveLength(0);
});

test('en fejl ved AI-udarbejdelsen bevarer den læsbare version og forsøger ikke automatisk igen', async () => {
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation((url, options) => url.endsWith('/generate')
    ? response({ detail: 'AI-tjenesten er midlertidigt utilgængelig.' }, false, 503)
    : baseFetch(url, options));
  mount('/vurdering?assessment=assessment-1&case=case-1');
  const button = await screen.findByRole('button', { name: 'Udarbejd med AI' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('AI-tjenesten er midlertidigt utilgængelig.');
  expect(screen.getByText(saved.executive_summary)).toBeInTheDocument();
  expect(authFetch.mock.calls.filter(([url]) => url.endsWith('/generate'))).toHaveLength(1);
});

test('Word og Excel hentes fra den samme gemte vurdering', async () => {
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation((url, options) => /\/export\.(docx|xlsx)$/.test(url)
    ? Promise.resolve({ ok: true, blob: async () => new Blob(['document']) })
    : baseFetch(url, options));
  window.URL.createObjectURL = jest.fn(() => 'blob:test-document');
  window.URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Hent konsekvensanalyse (Word)' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hent risikovurdering (Excel)' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Hent risikovurdering (Excel)' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2));
    expect(authFetch).toHaveBeenCalledWith('/api/dpia/assessments/assessment-1/export.docx');
    expect(authFetch).toHaveBeenCalledWith('/api/dpia/assessments/assessment-1/export.xlsx');
  } finally {
    click.mockRestore();
  }
});

test('en manglende gemt vurdering vises som fejl og falder ikke tilbage til en tom formular', async () => {
  const baseFetch = authFetch.getMockImplementation();
  authFetch.mockImplementation((url, options) => url === '/api/dpia/assessments/assessment-1'
    ? response({ detail: 'Not found' }, false, 404) : baseFetch(url, options));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Den gemte vurdering blev ikke fundet.');
  expect(screen.queryByLabelText('Løsningens eller projektets navn')).not.toBeInTheDocument();
});
