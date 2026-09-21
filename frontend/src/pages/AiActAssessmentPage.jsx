import React, { useState } from 'react';
import axios from 'axios';
import { useMutation } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import AssessmentCaseSelect from '../components/workflow/AssessmentCaseSelect';
import {
  Button,
  Card,
  Choice,
  ChoiceGrid,
  ErrorPanel,
  Eyebrow,
  Field,
  Fieldset,
  Form,
  FormActions,
  Grid,
  Inset,
  Lede,
  List,
  ListItem,
  Page,
  PageHeader,
  SecondaryButton,
  Section,
  SectionHeader,
  StatePanel,
  StatusPill,
  TextLink,
  Title,
  toArray,
  toneForStatus,
} from '../components/workflow/WorkflowUi';

const STEPS = [
  { id: 'context', label: 'System og rolle', description: 'Fastlæg kommunens rolle og anvendelseskontekst.' },
  { id: 'prohibited', label: 'Forbudte praksisser', description: 'Screen for AI-forordningens artikel 5.' },
  { id: 'risk', label: 'Risikoklasse', description: 'Vurder sikkerhedskomponenter og bilag III-anvendelser.' },
  { id: 'transparency', label: 'Transparens', description: 'Identificér oplysnings- og mærkningskrav.' },
];

const ROLE_OPTIONS = [
  { value: 'provider', label: 'Udbyder', help: 'Kommunen udvikler systemet eller markedsfører det under eget navn.' },
  { value: 'deployer', label: 'Idriftsætter', help: 'Kommunen anvender systemet under egen myndighed.' },
  { value: 'importer', label: 'Importør', help: 'Kommunen bringer et system fra et tredjeland ind på EU-markedet.' },
  { value: 'distributor', label: 'Distributør', help: 'Kommunen gør et system tilgængeligt uden selv at være udbyder eller importør.' },
  { value: 'product_manufacturer', label: 'Produktfabrikant', help: 'AI-systemet indgår i et produkt under kommunens navn eller varemærke.' },
];

const ROLE_FACT_OPTIONS = [
  { field: 'develops_or_has_developed_system', label: 'Udvikler eller får udviklet systemet', help: 'Kan gøre kommunen til udbyder.' },
  { field: 'places_or_puts_into_service_under_own_name', label: 'Sætter det i drift under eget navn', help: 'Kan gøre kommunen til udbyder, selv om en leverandør har bygget løsningen.' },
  { field: 'uses_system_under_own_authority', label: 'Anvender systemet under egen myndighed', help: 'Er det normale faktum for en kommunal idriftsætter.' },
  { field: 'imports_non_eu_system_to_union_market', label: 'Importerer fra et tredjeland', help: 'Kan gøre kommunen til importør.' },
  { field: 'makes_system_available_in_supply_chain', label: 'Gør systemet tilgængeligt for andre', help: 'Kan gøre kommunen til distributør.' },
  { field: 'substantial_modification', label: 'Foretager en væsentlig ændring', help: 'Kan flytte udbyderansvaret til kommunen.' },
  { field: 'changes_intended_purpose_to_high_risk', label: 'Ændrer formålet til højrisikobrug', help: 'Kan flytte udbyderansvaret til kommunen.' },
];

const ARTICLE_5_OPTIONS = [
  { value: 'manipulation_causing_significant_harm', label: 'Manipulerende eller vildledende teknik', help: 'Påvirker adfærd og kan medføre væsentlig skade.' },
  { value: 'vulnerability_exploitation_causing_significant_harm', label: 'Udnytter sårbarhed', help: 'Udnytter alder, handicap eller social/økonomisk situation.' },
  { value: 'social_scoring_with_detrimental_treatment', label: 'Social scoring', help: 'Scorer personer og medfører uberettiget eller uforholdsmæssig behandling.' },
  { value: 'criminal_risk_prediction_solely_from_profiling', label: 'Individbaseret kriminalitetsprognose', help: 'Forudsiger risiko alene ud fra profilering eller personlighed.' },
  { value: 'untargeted_facial_image_scraping', label: 'Målrettet opbygning af ansigtsdatabase', help: 'Indsamler ansigtsbilleder bredt fra internet eller overvågning.' },
  { value: 'emotion_inference_in_workplace_or_education', label: 'Følelsesgenkendelse på arbejde eller uddannelse', help: 'Omfatter ikke de snævre medicinske eller sikkerhedsmæssige undtagelser.' },
  { value: 'biometric_sensitive_trait_categorisation', label: 'Biometrisk kategorisering af følsomme forhold', help: 'Udleder fx etnicitet, religion, politik eller seksuel orientering.' },
  { value: 'real_time_remote_biometric_identification_for_law_enforcement', label: 'Biometrisk fjernidentifikation i realtid', help: 'Bruges i offentligt tilgængelige rum til retshåndhævelse.' },
];

const ANNEX_III_OPTIONS = [
  { value: 'biometrics', label: 'Biometri', help: 'Fjernidentifikation, kategorisering eller følelsesgenkendelse.' },
  { value: 'critical_infrastructure', label: 'Kritisk infrastruktur', help: 'Sikkerhedskomponent til fx energi, vand, varme eller digital infrastruktur.' },
  { value: 'education_or_vocational_training', label: 'Uddannelse', help: 'Adgang, optagelse, evaluering eller overvågning af elever.' },
  { value: 'employment_or_worker_management', label: 'Ansættelse og medarbejdere', help: 'Rekruttering, udvælgelse, opgavefordeling, evaluering eller opsigelse.' },
  { value: 'essential_public_services_or_benefits', label: 'Væsentlige offentlige ydelser', help: 'Adgang til eller vurdering af ydelser og tjenester.' },
  { value: 'law_enforcement', label: 'Retshåndhævelse', help: 'Risiko-, troværdigheds- eller bevisvurdering.' },
  { value: 'migration_asylum_or_border_control', label: 'Migration, asyl og grænsekontrol', help: 'Behandling af ansøgninger eller risikovurdering.' },
  { value: 'administration_of_justice', label: 'Retspleje', help: 'Bistår en judiciel myndighed med fortolkning af fakta og ret.' },
  { value: 'democratic_processes', label: 'Demokratiske processer', help: 'Påvirker valg, afstemninger eller borgeres stemmeadfærd.' },
];

const TRANSPARENCY_OPTIONS = [
  { value: 'direct_interaction_with_people', label: 'Interagerer direkte med personer', help: 'Fx chatbot eller taleassistent.' },
  { value: 'synthetic_audio_image_video_or_text', label: 'Genererer syntetisk indhold', help: 'Lyd, billeder, video eller tekst genereret eller manipuleret af AI.' },
  { value: 'emotion_recognition_or_biometric_categorisation', label: 'Følelsesgenkendelse eller biometrisk kategorisering', help: 'Berørte personer skal typisk informeres.' },
  { value: 'deepfake_content', label: 'Deepfake-indhold', help: 'Billede, lyd eller video, som kan fremstå autentisk.' },
  { value: 'ai_generated_public_interest_text', label: 'Tekst om forhold af offentlig interesse', help: 'AI-genereret eller manipuleret tekst offentliggøres for at informere offentligheden.' },
];

const StepNav = styled.ol`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  border-left: 1px solid ${(p) => p.theme.colors.line};
  list-style: none;

  @media (max-width: 760px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const StepItem = styled.li`
  min-height: 96px;
  border-right: 1px solid ${(p) => p.theme.colors.line};
  border-bottom: 3px solid ${(p) => (p.$active ? p.theme.colors.primary : p.theme.colors.line)};
  background: ${(p) => (p.$active ? p.theme.colors.primaryShallow : p.theme.colors.surface)};
  button { padding: 18px; width: 100%; min-height: inherit; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  button:focus-visible { outline: 3px solid ${(p) => p.theme.colors.primary}; outline-offset: -4px; }

  span { display: block; color: ${(p) => p.theme.colors.inkFaded}; font: 0.66rem ${(p) => p.theme.fonts.mono}; }
  strong { display: block; margin-top: 9px; color: ${(p) => p.theme.colors.ink}; font-size: 0.82rem; }
`;

const FormIntro = styled.div`
  padding: 30px 0 20px;
  h2 { margin: 0; font-size: 1.75rem; letter-spacing: -0.035em; }
  p { margin: 8px 0 0; color: ${(p) => p.theme.colors.inkSoft}; font-size: 0.88rem; }
`;

const ResultHero = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.6fr);
  gap: 28px;
  padding: 32px;
  border: 1px solid ${(p) => p.theme.colors.line};
  border-left: 5px solid ${(p) => p.$color};
  background: ${(p) => p.theme.colors.surface};

  h2 { margin: 10px 0 0; font-size: clamp(1.7rem, 3vw, 2.45rem); letter-spacing: -0.04em; }
  p { margin: 13px 0 0; color: ${(p) => p.theme.colors.inkSoft}; line-height: 1.62; }

  @media (max-width: 760px) { grid-template-columns: 1fr; padding: 22px; }
`;

const ResultFacts = styled.dl`
  display: grid;
  align-content: start;
  margin: 0;
  border-top: 1px solid ${(p) => p.theme.colors.line};

  div { padding: 13px 0; border-bottom: 1px solid ${(p) => p.theme.colors.line}; }
  dt { color: ${(p) => p.theme.colors.inkFaded}; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; }
  dd { margin: 5px 0 0; color: ${(p) => p.theme.colors.ink}; font-weight: 620; }
`;

const initialForm = (caseId = '') => ({
  case_id: caseId,
  system_name: '',
  intended_purpose: '',
  deployment_context: '',
  declared_roles: [],
  is_ai_system: null,
  union_nexus: true,
  scope_exclusion: 'none',
  develops_or_has_developed_system: false,
  places_or_puts_into_service_under_own_name: false,
  uses_system_under_own_authority: true,
  has_written_mandate_for_non_eu_provider: false,
  imports_non_eu_system_to_union_market: false,
  makes_system_available_in_supply_chain: false,
  product_manufacturer_places_embedded_ai_under_own_name: false,
  substantial_modification: false,
  changes_intended_purpose_to_high_risk: false,
  is_public_authority: true,
  provides_public_service: true,
  article_5_practices: [],
  article_5_exception_context: '',
  annex_i_conditions_met: false,
  annex_iii_use_cases: [],
  profiles_natural_persons: false,
  significant_risk_to_health_safety_or_fundamental_rights: false,
  materially_influences_decisions: false,
  article_6_3_condition: 'none',
  transparency_use_cases: [],
});

async function assessAiAct(form) {
  const { article_5_exception_context, annex_i_conditions_met, materially_influences_decisions, ...rest } = form;
  const response = await axios.post('/api/ai-act/assess', {
    ...rest,
    case_id: form.case_id.trim(),
    article_5_exception_claimed: article_5_exception_context.trim().length >= 20,
    article_5_exception_basis: article_5_exception_context.trim().length >= 20 ? article_5_exception_context.trim() : '',
    annex_i_safety_component_or_product: annex_i_conditions_met,
    annex_i_requires_third_party_conformity: annex_i_conditions_met,
    materially_influences_decision_outcome: materially_influences_decisions,
  });
  return response.data;
}

function toggleList(current, field, value) {
  const values = new Set(current[field]);
  if (values.has(value)) values.delete(value);
  else values.add(value);
  return { ...current, [field]: [...values] };
}

function YesNoField({ legend, help, value, onChange }) {
  return (
    <Fieldset>
      <legend>{legend}</legend>
      {help ? <Inset><p>{help}</p></Inset> : null}
      <ChoiceGrid>
        <Choice $selected={value === true}>
          <input type="radio" checked={value === true} onChange={() => onChange(true)} />
          <span><strong>Ja</strong></span>
        </Choice>
        <Choice $selected={value === false}>
          <input type="radio" checked={value === false} onChange={() => onChange(false)} />
          <span><strong>Nej</strong></span>
        </Choice>
      </ChoiceGrid>
    </Fieldset>
  );
}

function MultiChoice({ options, selected, onToggle }) {
  return (
    <ChoiceGrid>
      {options.map((option) => (
        <Choice key={option.value} $selected={selected.includes(option.value)}>
          <input type="checkbox" checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} />
          <span><strong>{option.label}</strong><small>{option.help}</small></span>
        </Choice>
      ))}
    </ChoiceGrid>
  );
}

function BooleanFactChoices({ options, form, setField }) {
  return (
    <ChoiceGrid>
      {options.map((option) => (
        <Choice key={option.field} $selected={form[option.field]}>
          <input type="checkbox" checked={form[option.field]} onChange={(event) => setField(option.field, event.target.checked)} />
          <span><strong>{option.label}</strong><small>{option.help}</small></span>
        </Choice>
      ))}
    </ChoiceGrid>
  );
}

function ContextStep({ form, setField, toggle }) {
  return (
    <>
      <Fieldset>
        <legend>Systemets identitet</legend>
        <Grid $columns={2}>
          <Field><label htmlFor="ai-system-name">Systemnavn</label><input id="ai-system-name" value={form.system_name} onChange={(event) => setField('system_name', event.target.value)} required /></Field>
          <AssessmentCaseSelect id="ai-case-id" value={form.case_id} onChange={value => setField('case_id', value)} />
        </Grid>
        <Field><label htmlFor="ai-purpose">Tilsigtet formål</label><textarea id="ai-purpose" value={form.intended_purpose} onChange={(event) => setField('intended_purpose', event.target.value)} placeholder="Beskriv den opgave systemet løser, for hvem og med hvilken virkning…" required /></Field>
        <Field><label htmlFor="ai-context">Anvendelseskontekst</label><textarea id="ai-context" value={form.deployment_context} onChange={(event) => setField('deployment_context', event.target.value)} placeholder="Fx borgerservice, socialområdet, HR eller intern administration…" required /></Field>
      </Fieldset>

      <Fieldset>
        <legend>Kommunens rolle</legend>
        <Inset><p>En organisation kan have flere roller. S.H.I.E.L.D. kontrollerer derfor både den valgte rolle og de faktiske handlinger.</p></Inset>
        <MultiChoice options={ROLE_OPTIONS} selected={form.declared_roles} onToggle={(value) => toggle('declared_roles', value)} />
      </Fieldset>

      <Fieldset>
        <legend>Hvad gør kommunen konkret?</legend>
        <BooleanFactChoices options={ROLE_FACT_OPTIONS} form={form} setField={setField} />
      </Fieldset>

      <YesNoField legend="Er løsningen et AI-system efter forordningens definition?" help="Vælg nej, hvis der alene er tale om faste, menneskeskrevne regler. Hvis definitionen er uafklaret, skal det undersøges før screeningen kan afsluttes." value={form.is_ai_system} onChange={(value) => setField('is_ai_system', value)} />
      <YesNoField legend="Har anvendelsen tilknytning til EU?" help="Fx fordi systemet markedsføres eller anvendes i EU, eller fordi output bruges om personer i EU." value={form.union_nexus} onChange={(value) => setField('union_nexus', value)} />
      <Fieldset>
        <legend>Mulig undtagelse fra anvendelsesområdet</legend>
        <Field>
          <label htmlFor="scope-exclusion">Vælg kun en undtagelse, hvis den er dokumenteret</label>
          <select id="scope-exclusion" value={form.scope_exclusion} onChange={(event) => setField('scope_exclusion', event.target.value)}>
            <option value="none">Ingen undtagelse</option>
            <option value="military_defence_or_national_security">Militær, forsvar eller national sikkerhed</option>
            <option value="sole_scientific_research_and_development">Alene videnskabelig forskning og udvikling</option>
            <option value="pre_market_research_testing_or_development">Forskning, test eller udvikling før markedsføring</option>
            <option value="personal_non_professional_use">Rent personlig, ikke-erhvervsmæssig brug</option>
          </select>
        </Field>
      </Fieldset>
    </>
  );
}

function ProhibitedStep({ form, setField, toggle }) {
  const exceptionEligible = form.article_5_practices.length > 0 && form.article_5_practices.every((practice) => [
    'emotion_inference_in_workplace_or_education',
    'biometric_sensitive_trait_categorisation',
    'real_time_remote_biometric_identification_for_law_enforcement',
  ].includes(practice));
  return (
    <>
      <Fieldset>
        <legend>Kan nogen af disse praksisser være en del af løsningen?</legend>
        <Inset $accent="#9b302b"><p>Et match er ikke automatisk den endelige juridiske konklusion. S.H.I.E.L.D. viser den relevante regel og eventuelle snævre undtagelser til manuel kontrol.</p></Inset>
        <MultiChoice options={ARTICLE_5_OPTIONS} selected={form.article_5_practices} onToggle={(value) => toggle('article_5_practices', value)} />
      </Fieldset>
      {exceptionEligible ? (
        <Fieldset>
          <legend>Mulig undtagelseskontekst</legend>
          <Field><label htmlFor="article-5-context">Beskriv eventuel medicinsk, sikkerhedsmæssig eller retshåndhævelsesmæssig undtagelse</label><textarea id="article-5-context" value={form.article_5_exception_context} onChange={(event) => setField('article_5_exception_context', event.target.value)} /></Field>
        </Fieldset>
      ) : form.article_5_practices.length ? <StatePanel><strong>Ingen undtagelse i denne screening</strong><p>De valgte praksisser skal behandles som potentielt forbudte og kontrolleres juridisk.</p></StatePanel> : <StatePanel><strong>Ingen praksisser valgt</strong><p>Fortsæt, hvis ingen af beskrivelserne passer. Valget bliver registreret som en eksplicit negativ screening.</p></StatePanel>}
    </>
  );
}

function RiskStep({ form, setField, toggle }) {
  return (
    <>
      <YesNoField legend="Er begge betingelser i artikel 6, stk. 1, opfyldt?" help="AI er en sikkerhedskomponent i et bilag I-produkt, og produktet kræver tredjeparts-overensstemmelsesvurdering." value={form.annex_i_conditions_met} onChange={(value) => setField('annex_i_conditions_met', value)} />
      <Fieldset>
        <legend>Anvendelsesområder i bilag III</legend>
        <MultiChoice options={ANNEX_III_OPTIONS} selected={form.annex_iii_use_cases} onToggle={(value) => toggle('annex_iii_use_cases', value)} />
      </Fieldset>
      <Grid $columns={2}>
        <YesNoField legend="Profilerer løsningen fysiske personer?" value={form.profiles_natural_persons} onChange={(value) => setField('profiles_natural_persons', value)} />
        <YesNoField legend="Påvirker outputtet væsentligt en afgørelse om personer?" value={form.materially_influences_decisions} onChange={(value) => setField('materially_influences_decisions', value)} />
      </Grid>
      <YesNoField legend="Skaber anvendelsen en væsentlig risiko for sundhed, sikkerhed eller grundlæggende rettigheder?" value={form.significant_risk_to_health_safety_or_fundamental_rights} onChange={(value) => setField('significant_risk_to_health_safety_or_fundamental_rights', value)} />
    </>
  );
}

function TransparencyStep({ form, toggle }) {
  return (
    <Fieldset>
      <legend>Transparenssituationer</legend>
      <Inset><p>Vælg alle relevante situationer. Resultatet forklarer hvem der skal informeres, hvornår og om indhold skal mærkes maskinlæsbart.</p></Inset>
      <MultiChoice options={TRANSPARENCY_OPTIONS} selected={form.transparency_use_cases} onToggle={(value) => toggle('transparency_use_cases', value)} />
    </Fieldset>
  );
}

function normalizeResult(payload) {
  const source = payload?.assessment || payload?.result || payload || {};
  const classification = source.classification || source.risk_class || source.overall_classification || 'Kræver manuel kontrol';
  return {
    ...source,
    classification,
    classificationLabel: source.classification_label || source.label || classification,
    summary: source.summary || source.explanation || source.rationale || 'S.H.I.E.L.D. har samlet den foreløbige rolle-, risiko- og pligtbestemmelse.',
    roles: toArray(source.roles || source.determined_roles || source.applicable_roles),
    obligations: toArray(source.obligations || source.applicable_obligations || source.requirements),
    reasons: toArray(source.reasons || source.findings || source.classification_reasons),
    sources: toArray(source.sources || source.legal_sources || source.citations),
    nextSteps: toArray(source.next_steps || source.follow_up_actions || source.actions),
    blockers: toArray(source.blockers),
    friaRequired: Boolean(source.fria_required || source.requires_fundamental_rights_assessment || source.fundamental_rights_assessment_required),
  };
}

function ResultPage({ payload, onReset }) {
  const result = normalizeResult(payload);
  const tone = toneForStatus(result.classification);
  const colorByTone = { success: '#246042', warning: '#b08a4a', danger: '#9b302b', neutral: '#006f71' };

  return (
    <Page>
      <PageHeader>
        <div><Eyebrow>S.H.I.E.L.D. · AI-forordningen</Eyebrow><Title>Rolle, risiko og pligter</Title><Lede>Et forklarligt beslutningsgrundlag med direkte spor fra faktum til mulige pligter.</Lede></div>
        <SecondaryButton type="button" onClick={onReset}>Ny vurdering</SecondaryButton>
      </PageHeader>

      <Section>
        <ResultHero $color={colorByTone[tone]}>
          <div>
            <StatusPill $tone={tone}>{result.classificationLabel}</StatusPill>
            <h2>{result.title || 'Foreløbig AI Act-klassifikation'}</h2>
            <p>{result.summary}</p>
          </div>
          <ResultFacts>
            <div><dt>Rolle</dt><dd>{result.roles.map((item) => typeof item === 'string' ? item : item.label || item.role).filter(Boolean).join(', ') || 'Ikke fastlagt'}</dd></div>
            <div><dt>Grundrettighedsvurdering</dt><dd>{result.friaRequired ? 'Sandsynligvis påkrævet' : 'Ikke udløst af screeningen'}</dd></div>
            <div><dt>Pligter fundet</dt><dd>{result.obligations.length}</dd></div>
          </ResultFacts>
        </ResultHero>
      </Section>

      <Section>
        <SectionHeader><div><h2>Hvorfor lander vurderingen her?</h2><p>Hvert fund skal kunne spores til et svar og en bestemmelse.</p></div></SectionHeader>
        {result.reasons.length ? (
          <Grid $columns={2}>{result.reasons.map((item, index) => <Card key={item.id || index}><h3>{itemTitle(item, `Begrundelse ${index + 1}`)}</h3><p>{itemDescription(item) || String(item)}</p></Card>)}</Grid>
        ) : <StatePanel><strong>Ingen særskilte begrundelser returneret</strong><p>Læs opsummeringen og kontrollér de relevante kilder manuelt.</p></StatePanel>}
      </Section>

      {result.blockers.length ? (
        <Section>
          <SectionHeader><div><h2>Blokeringer</h2><p>Disse forhold skal afklares, før sagen kan gå videre.</p></div></SectionHeader>
          <List>{result.blockers.map((item, index) => <ListItem key={`${item}-${index}`}><div><strong>Blokerende forhold {index + 1}</strong><p>{String(item)}</p></div><StatusPill $tone="danger">Blokerer</StatusPill></ListItem>)}</List>
        </Section>
      ) : null}

      <Section>
        <SectionHeader><div><h2>Mulige pligter</h2><p>Pligterne er et arbejdsgrundlag og skal bekræftes af den ansvarlige juridiske funktion.</p></div></SectionHeader>
        {result.obligations.length ? (
          <List>{result.obligations.map((item, index) => <ListItem key={item.id || item.article || index}><div><strong>{itemTitle(item, `Pligt ${index + 1}`)}</strong><p>{itemDescription(item) || (typeof item === 'string' ? item : '')}</p></div><StatusPill $tone={toneForStatus(item.status || item.priority)}>Relevant</StatusPill></ListItem>)}</List>
        ) : <StatePanel><strong>Ingen konkrete pligter returneret</strong><p>Det kan skyldes, at løsningen falder uden for definitionen, eller at flere fakta mangler.</p></StatePanel>}
      </Section>

      {result.nextSteps.length ? (
        <Section>
          <SectionHeader><div><h2>Næste handlinger</h2><p>Omsæt resultatet til dokumentation og ansvar.</p></div></SectionHeader>
          <List>{result.nextSteps.map((item, index) => <ListItem key={item.id || index}><div><strong>{itemTitle(item, `Handling ${index + 1}`)}</strong><p>{itemDescription(item) || (typeof item === 'string' ? item : '')}</p></div></ListItem>)}</List>
        </Section>
      ) : null}

      <Section>
        <SectionHeader><div><h2>Kilder</h2><p>Brug altid den gældende forordning og officielle EU-vejledning som sidste kontrol.</p></div></SectionHeader>
        {result.sources.length ? result.sources.map((source, index) => <TextLink key={source.url || source.href || index} href={source.url || source.href} target="_blank" rel="noreferrer">{itemTitle(source, `Kilde ${index + 1}`)} <span aria-hidden="true">↗</span></TextLink>) : <TextLink href="https://ai-act-service-desk.ec.europa.eu/en" target="_blank" rel="noreferrer">EU AI Act Service Desk <span aria-hidden="true">↗</span></TextLink>}
      </Section>

      <Inset $accent="#b08a4a"><strong>Juridisk forbehold</strong><p>Resultatet er en dokumenteret screening, ikke en automatisk myndighedsafgørelse. Klassifikation, undtagelser og pligter skal godkendes på baggrund af den konkrete anvendelse.</p></Inset>
    </Page>
  );
}

function itemTitle(item, fallback) {
  if (typeof item === 'string') return item;
  return item?.title || item?.label || item?.name || item?.article || fallback;
}

function itemDescription(item) {
  if (typeof item === 'string') return item;
  return item?.description || item?.summary || item?.reason || item?.explanation || '';
}

export function validateAiActForm(form) {
  const errors = [];
  if (form.case_id.trim().length < 2) errors.push('Vælg en eksisterende sag eller angiv dens sagsreference.');
  if (form.system_name.trim().length < 2) errors.push('Angiv systemnavn med mindst 2 tegn.');
  if (form.intended_purpose.trim().length < 20) errors.push('Beskriv det tilsigtede formål med mindst 20 tegn.');
  if (form.deployment_context.trim().length < 20) errors.push('Beskriv anvendelseskonteksten med mindst 20 tegn.');
  if (form.is_ai_system === null) errors.push('Tag stilling til, om løsningen er et AI-system.');
  if (form.is_ai_system && !form.declared_roles.length) errors.push('Vælg mindst én rolle for kommunen.');
  return errors;
}

function AiActAssessmentPage() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => initialForm(searchParams.get('case_id') || ''));
  const mutation = useMutation(assessAiAct);
  const [validationErrors, setValidationErrors] = useState([]);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const toggle = (field, value) => setForm((current) => toggleList(current, field, value));
  const goToStep = next => { setStep(next); setValidationErrors([]); };

  const submit = (event) => {
    event.preventDefault();
    if (step < STEPS.length - 1) { goToStep(step + 1); return; }
    const errors = validateAiActForm(form);
    if (errors.length) { setStep(0); setValidationErrors(errors); return; }
    setValidationErrors([]);
    mutation.mutate(form);
  };

  const reset = () => {
    mutation.reset();
    setStep(0);
    setValidationErrors([]);
    setForm(initialForm(searchParams.get('case_id') || ''));
  };

  if (mutation.isSuccess) return <ResultPage payload={mutation.data} onReset={reset} />;

  return (
    <Page>
      <PageHeader>
        <div><Eyebrow>S.H.I.E.L.D. · AI-forordningen</Eyebrow><Title>AI Act-vurdering på en sag</Title><Lede>Fastlæg først rolle, dernæst forbud, risikoklasse og konkrete transparenspligter. Resultatet gemmes på den valgte sag og viser både konklusionen og hvorfor.</Lede></div>
      </PageHeader>

      <StepNav aria-label="Vurderingens trin">
        {STEPS.map((item, index) => <StepItem key={item.id} $active={index === step}><button type="button" disabled={mutation.isLoading} aria-current={index === step ? 'step' : undefined} onClick={() => goToStep(index)}><span>Trin {index + 1} af {STEPS.length}</span><strong>{item.label}</strong></button></StepItem>)}
      </StepNav>

      <Form onSubmit={submit} noValidate>
        <FormIntro><h2>{STEPS[step].label}</h2><p>{STEPS[step].description}</p><p>Du kan frit se alle trin. Oplysningerne kontrolleres, når du vælger at udarbejde vurderingen.</p></FormIntro>
        {validationErrors.length > 0 && <ErrorPanel role="alert"><strong>Vurderingen kan ikke udarbejdes endnu</strong><ul>{validationErrors.map(error => <li key={error}>{error}</li>)}</ul></ErrorPanel>}
        {step === 0 ? <ContextStep form={form} setField={setField} toggle={toggle} /> : null}
        {step === 1 ? <ProhibitedStep form={form} setField={setField} toggle={toggle} /> : null}
        {step === 2 ? <RiskStep form={form} setField={setField} toggle={toggle} /> : null}
        {step === 3 ? <TransparencyStep form={form} toggle={toggle} /> : null}

        {mutation.isError ? <ErrorPanel role="alert"><strong>Vurderingen kunne ikke gennemføres</strong><p>{String(mutation.error?.response?.data?.detail || mutation.error?.message || 'Ukendt fejl')}</p></ErrorPanel> : null}

        <FormActions>
          <SecondaryButton type="button" onClick={() => goToStep(Math.max(0, step - 1))} disabled={step === 0 || mutation.isLoading}>Tilbage</SecondaryButton>
          <div>
            {step === STEPS.length - 1 ? <Button type="submit" disabled={mutation.isLoading}>{mutation.isLoading ? 'Vurderer…' : 'Vis rolle, risiko og pligter'}</Button> : <Button type="button" disabled={mutation.isLoading} onClick={() => goToStep(step + 1)}>Næste</Button>}
          </div>
        </FormActions>
      </Form>
    </Page>
  );
}

export default AiActAssessmentPage;
