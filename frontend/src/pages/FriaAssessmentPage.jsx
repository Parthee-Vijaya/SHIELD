import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { useMutation } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
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
  { label: 'Formål og berørte', description: 'Beskriv anvendelsen og de personer, der kan blive påvirket.' },
  { label: 'Grundlæggende rettigheder', description: 'Vurder påvirkningen rettighed for rettighed.' },
  { label: 'Nødvendighed', description: 'Dokumentér lovligt mål, alternativer og proportionalitet.' },
  { label: 'Kontrol og klage', description: 'Fastlæg menneskeligt tilsyn, afhjælpning og løbende kontrol.' },
];

const GROUP_OPTIONS = [
  { value: 'citizens', label: 'Borgere generelt', help: 'Personer, som modtager kommunal service eller berøres af en afgørelse.', vulnerabilities: ['none_identified'] },
  { value: 'children', label: 'Børn og unge', help: 'Personer under 18 år og deres værger.', vulnerabilities: ['children_or_young_people', 'dependency_on_public_service'] },
  { value: 'people_with_disabilities', label: 'Personer med handicap', help: 'Fysiske, psykiske, intellektuelle eller sensoriske funktionsnedsættelser.', vulnerabilities: ['disability', 'dependency_on_public_service'] },
  { value: 'socially_vulnerable', label: 'Socialt eller økonomisk sårbare', help: 'Personer med afhængighed af ydelser eller begrænset handlefrihed.', vulnerabilities: ['economic_or_social_disadvantage', 'dependency_on_public_service'] },
  { value: 'employees', label: 'Medarbejdere og ansøgere', help: 'Nuværende eller kommende medarbejdere.', vulnerabilities: ['employees_or_job_applicants'] },
  { value: 'minorities', label: 'Minoriteter', help: 'Grupper med risiko for indirekte eller historisk diskrimination.', vulnerabilities: ['migration_or_minority_status'] },
  { value: 'care_recipients', label: 'Pleje- og sundhedsmodtagere', help: 'Personer i et afhængighedsforhold til kommunal støtte.', vulnerabilities: ['health_condition', 'dependency_on_public_service'] },
  { value: 'non_digital_users', label: 'Digitalt udsatte', help: 'Personer med begrænset digital adgang, sprog eller kompetencer.', vulnerabilities: ['limited_language_or_digital_access'] },
];

const RIGHTS = [
  { id: 'human_dignity', label: 'Menneskelig værdighed', article: 'EU-chartrets artikel 1', help: 'Risiko for objektgørelse, stigmatisering eller tab af menneskelig handlefrihed.' },
  { id: 'private_life_and_data_protection', label: 'Privatliv og databeskyttelse', article: 'Artikel 7–8', help: 'Indgreb i privatliv, overvågning, datadeling eller manglende kontrol over oplysninger.' },
  { id: 'non_discrimination', label: 'Lighed og ikke-diskrimination', article: 'Artikel 20–21', help: 'Forskelsbehandling direkte, indirekte eller gennem proxyvariable.' },
  { id: 'rights_of_the_child', label: 'Barnets rettigheder', article: 'Artikel 24', help: 'Barnets bedste, ret til at blive hørt og behov for særlig beskyttelse.' },
  { id: 'rights_of_persons_with_disabilities', label: 'Integration af personer med handicap', article: 'Artikel 26', help: 'Tilgængelighed, selvstændighed og deltagelse i samfundslivet.' },
  { id: 'good_administration', label: 'God forvaltning', article: 'Artikel 41', help: 'Upartisk, retfærdig og rettidig behandling samt begrundelse.' },
  { id: 'effective_remedy_and_fair_trial', label: 'Effektive retsmidler og retfærdig rettergang', article: 'Artikel 47', help: 'Mulighed for at forstå, bestride og få prøvet resultatet.' },
  { id: 'freedom_of_expression_and_information', label: 'Ytrings- og informationsfrihed', article: 'Artikel 11', help: 'Nedkølende effekt, adgang til information eller uigennemsigtig prioritering.' },
  { id: 'social_security_and_assistance', label: 'Social sikring og bistand', article: 'Artikel 34', help: 'Adgang til støtte, ydelser og et værdigt liv.' },
  { id: 'workers_rights', label: 'Arbejdstagerrettigheder', article: 'Artikel 27–31', help: 'Inddragelse, rimelige vilkår, overvågning eller automatiseret ledelse.' },
];

const SCALE_OPTIONS = [
  { value: 1, label: 'Lav' },
  { value: 2, label: 'Middel' },
  { value: 3, label: 'Høj' },
  { value: 4, label: 'Meget høj' },
];

const WizardNav = styled.ol`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
  border-left: 1px solid ${(p) => p.theme.colors.line};

  @media (max-width: 760px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const WizardStep = styled.li`
  min-height: 94px;
  padding: 18px;
  border-right: 1px solid ${(p) => p.theme.colors.line};
  border-bottom: 3px solid ${(p) => (p.$active ? p.theme.colors.secondary : p.theme.colors.line)};
  background: ${(p) => (p.$active ? p.theme.colors.surface : p.theme.colors.paperSoft)};

  span { color: ${(p) => p.theme.colors.inkFaded}; font: 0.66rem ${(p) => p.theme.fonts.mono}; }
  strong { display: block; margin-top: 9px; color: ${(p) => p.theme.colors.ink}; font-size: 0.82rem; }
`;

const FormIntro = styled.div`
  padding: 30px 0 20px;
  h2 { margin: 0; font-size: 1.75rem; letter-spacing: -0.035em; }
  p { margin: 8px 0 0; color: ${(p) => p.theme.colors.inkSoft}; font-size: 0.88rem; }
`;

const RightCard = styled(Card)`
  display: grid;
  gap: 18px;
  padding: 0;
  overflow: hidden;
`;

const RightHeader = styled.div`
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 18px;
  padding: 20px;
  background: ${(p) => p.theme.colors.paperSoft};

  span { color: ${(p) => p.theme.colors.inkFaded}; font-size: 0.7rem; }
`;

const RightBody = styled.div`
  display: grid;
  gap: 16px;
  padding: 0 20px 20px;
`;

const MeasureEditor = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
  gap: 10px;
  align-items: end;
  padding: 18px;
  border: 1px solid ${(p) => p.theme.colors.line};

  .wide { grid-column: 1 / -1; }

  @media (max-width: 680px) { grid-template-columns: 1fr; }
`;

const ResultHero = styled.section`
  display: grid;
  gap: 16px;
  padding: 30px;
  border: 1px solid ${(p) => p.theme.colors.line};
  border-top: 5px solid ${(p) => p.$accent};
  background: ${(p) => p.theme.colors.surface};

  h2 { margin: 0; font-size: clamp(1.75rem, 3vw, 2.5rem); letter-spacing: -0.04em; }
  p { max-width: 850px; margin: 0; color: ${(p) => p.theme.colors.inkSoft}; line-height: 1.65; }
`;

const initialRights = Object.fromEntries(RIGHTS.map((right) => [right.id, {
  selected: false,
  impact_description: '',
  harm_scenarios: '',
  severity: 2,
  likelihood: 2,
  residual_severity: 2,
  residual_likelihood: 2,
  evidence: '',
}]));

const initialForm = (caseId = '') => ({
  case_id: caseId,
  system_name: '',
  purpose: '',
  deployment_context: '',
  geographic_scope: 'Kalundborg Kommune',
  duration: '',
  makes_or_supports_decisions_about_people: true,
  decision_owner: '',
  rights_or_dpo_expert_involved: false,
  affected_group_ids: [],
  affected_group_detail: '',
  estimated_people: '',
  groups_consulted: false,
  consultation_details: '',
  rights: initialRights,
  legitimate_objective: '',
  legal_mandate: '',
  alternatives_considered: '',
  why_necessary: '',
  data_and_function_minimisation: '',
  expected_public_benefit: '',
  expected_rights_cost: '',
  proportionality_reasoning: '',
  proportionality_conclusion: 'not_assessed',
  oversight_enabled: true,
  can_override_or_stop: true,
  sufficient_time_and_information: true,
  oversight_authority: '',
  competence_and_training: '',
  review_and_override_procedure: '',
  automation_bias_controls: '',
  people_are_informed: true,
  accessible_complaint_channel: true,
  human_reconsideration_available: true,
  appeal_or_independent_review_available: true,
  complaint_contact_point: '',
  complaint_response_target: '',
  accessibility_accommodations: '',
  monitoring_metrics: '',
  incident_and_escalation_process: '',
  change_triggers: '',
  responsible_owner: '',
  review_date: '',
  measures: [{ title: '', description: '', owner: '', due_date: '', status: 'planned', evidence: '' }],
});

function buildPayload(form) {
  const measures = form.measures.filter((measure) => measure.title.trim()).map((measure, index) => ({
    ...measure,
    id: `measure_${index + 1}`,
    due_date: measure.due_date || null,
  }));
  const selectedRights = RIGHTS.filter((right) => form.rights[right.id].selected).map((right) => ({
    id: `impact_${right.id}`,
    right: right.id,
    other_right_name: '',
    impact_description: form.rights[right.id].impact_description,
    harm_scenarios: form.rights[right.id].harm_scenarios.split('\n').map((item) => item.trim()).filter(Boolean),
    affected_group_ids: form.affected_group_ids,
    evidence_references: form.rights[right.id].evidence.split(',').map((item) => item.trim()).filter(Boolean),
    severity: Number(form.rights[right.id].severity),
    likelihood: Number(form.rights[right.id].likelihood),
    measure_ids: measures.map((measure) => measure.id),
    expected_residual_severity: Number(form.rights[right.id].residual_severity),
    expected_residual_likelihood: Number(form.rights[right.id].residual_likelihood),
  }));

  return {
    case_id: form.case_id.trim(),
    system_name: form.system_name,
    purpose: form.purpose,
    deployment_context: form.deployment_context,
    use_period_and_frequency: `${form.duration}. Geografisk omfang: ${form.geographic_scope}.`,
    makes_or_supports_decisions_about_people: form.makes_or_supports_decisions_about_people,
    decision_owner: form.decision_owner,
    rights_or_dpo_expert_involved: form.rights_or_dpo_expert_involved,
    affected_groups: form.affected_group_ids.map((id) => {
      const group = GROUP_OPTIONS.find((option) => option.value === id);
      return {
        id,
        name: group?.label || id,
        how_affected: form.affected_group_detail,
        estimated_number: form.estimated_people ? Number(form.estimated_people) : null,
        vulnerability_factors: group?.vulnerabilities || ['none_identified'],
        consulted: form.groups_consulted,
        consultation_details: form.groups_consulted ? form.consultation_details : '',
      };
    }),
    rights_impacts: selectedRights,
    necessity: {
      legitimate_objective: form.legitimate_objective,
      legal_basis_reference: form.legal_mandate,
      suitability_reasoning: form.why_necessary,
      less_intrusive_alternatives: form.alternatives_considered.split('\n').map((item) => item.trim()).filter(Boolean),
      chosen_option_reasoning: form.proportionality_reasoning,
      data_and_function_minimisation: form.data_and_function_minimisation,
    },
    proportionality: {
      expected_public_benefit: form.expected_public_benefit,
      expected_rights_cost: form.expected_rights_cost,
      balancing_reasoning: form.proportionality_reasoning,
      conclusion: form.proportionality_conclusion,
    },
    human_oversight: {
      enabled: form.oversight_enabled,
      responsible_role: form.oversight_authority,
      can_override_or_stop: form.can_override_or_stop,
      sufficient_time_and_information: form.sufficient_time_and_information,
      competence_and_training: form.competence_and_training,
      review_and_override_procedure: form.review_and_override_procedure,
      automation_bias_controls: form.automation_bias_controls,
    },
    complaints_and_remedies: {
      people_are_informed: form.people_are_informed,
      accessible_complaint_channel: form.accessible_complaint_channel,
      human_reconsideration_available: form.human_reconsideration_available,
      appeal_or_independent_review_available: form.appeal_or_independent_review_available,
      contact_point: form.complaint_contact_point,
      response_target: form.complaint_response_target,
      accessibility_accommodations: form.accessibility_accommodations,
    },
    measures,
    monitoring: {
      responsible_owner: form.responsible_owner,
      metrics: form.monitoring_metrics.split('\n').map((item) => item.trim()).filter(Boolean),
      review_date: form.review_date,
      incident_and_escalation_process: form.incident_and_escalation_process,
      change_triggers: form.change_triggers.split('\n').map((item) => item.trim()).filter(Boolean),
    },
  };
}

async function assessFria(form) {
  const response = await axios.post('/api/fria/assess', buildPayload(form));
  return response.data;
}

function ToggleOptions({ options, selected, onToggle }) {
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

function BinaryChoice({ legend, value, onChange, help }) {
  return (
    <Fieldset>
      <legend>{legend}</legend>
      {help ? <Inset><p>{help}</p></Inset> : null}
      <ChoiceGrid>
        <Choice $selected={value === true}><input type="radio" checked={value === true} onChange={() => onChange(true)} /><span><strong>Ja</strong></span></Choice>
        <Choice $selected={value === false}><input type="radio" checked={value === false} onChange={() => onChange(false)} /><span><strong>Nej</strong></span></Choice>
      </ChoiceGrid>
    </Fieldset>
  );
}

function ContextStep({ form, setField, toggleGroup }) {
  return (
    <>
      <Fieldset>
        <legend>Anvendelsen</legend>
        <Grid $columns={2}>
          <Field><label htmlFor="fria-system">Systemnavn</label><input id="fria-system" value={form.system_name} onChange={(event) => setField('system_name', event.target.value)} required /></Field>
          <Field><label htmlFor="fria-case">Sags-ID</label><input id="fria-case" value={form.case_id} onChange={(event) => setField('case_id', event.target.value)} required /></Field>
        </Grid>
        <Field><label htmlFor="fria-purpose">Formål og forventet fordel</label><textarea id="fria-purpose" value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} required /></Field>
        <Field><label htmlFor="fria-context">Konkret anvendelseskontekst</label><textarea id="fria-context" value={form.deployment_context} onChange={(event) => setField('deployment_context', event.target.value)} placeholder="Beskriv hvor, hvornår og hvordan output anvendes, samt hvilken betydning det får…" required /></Field>
        <Grid $columns={2}>
          <Field><label htmlFor="duration">Periode og hyppighed</label><textarea id="duration" value={form.duration} onChange={(event) => setField('duration', event.target.value)} placeholder="Fx dagligt i en 6-måneders pilot og derefter ved hver ny ansøgning…" required /></Field>
          <Field><label htmlFor="decision-owner">Ansvarlig for beslutningen</label><input id="decision-owner" value={form.decision_owner} onChange={(event) => setField('decision_owner', event.target.value)} required /></Field>
        </Grid>
      </Fieldset>

      <Grid $columns={2}>
        <BinaryChoice legend="Træffer eller understøtter systemet beslutninger om personer?" value={form.makes_or_supports_decisions_about_people} onChange={(value) => setField('makes_or_supports_decisions_about_people', value)} />
        <BinaryChoice legend="Er en grundrettigheds- eller DPO-ekspert inddraget?" value={form.rights_or_dpo_expert_involved} onChange={(value) => setField('rights_or_dpo_expert_involved', value)} />
      </Grid>

      <Fieldset>
        <legend>Berørte personer og grupper</legend>
        <ToggleOptions options={GROUP_OPTIONS} selected={form.affected_group_ids} onToggle={toggleGroup} />
        <Field><label htmlFor="affected-detail">Særlige sårbarheder og afhængighedsforhold</label><textarea id="affected-detail" value={form.affected_group_detail} onChange={(event) => setField('affected_group_detail', event.target.value)} /></Field>
        <Grid $columns={2}>
          <Field><label htmlFor="estimated-people">Anslået antal personer</label><input id="estimated-people" type="number" min="0" value={form.estimated_people} onChange={(event) => setField('estimated_people', event.target.value)} /></Field>
          <Field><label htmlFor="geographic-scope">Geografisk område</label><input id="geographic-scope" value={form.geographic_scope} onChange={(event) => setField('geographic_scope', event.target.value)} /></Field>
        </Grid>
        <BinaryChoice legend="Er de berørte grupper blevet inddraget?" value={form.groups_consulted} onChange={(value) => setField('groups_consulted', value)} />
        {form.groups_consulted ? <Field><label htmlFor="consultation-details">Hvordan og hvornår blev de inddraget?</label><textarea id="consultation-details" value={form.consultation_details} onChange={(event) => setField('consultation_details', event.target.value)} required /></Field> : null}
      </Fieldset>
    </>
  );
}

function RightsStep({ form, toggleRight, updateRight }) {
  const selected = RIGHTS.filter((right) => form.rights[right.id].selected);
  return (
    <>
      <Fieldset>
        <legend>Hvilke rettigheder kan blive påvirket?</legend>
        <Inset><p>Vælg både direkte og indirekte påvirkninger. En påvirkning kan være positiv og samtidig skabe en risiko for bestemte grupper.</p></Inset>
        <ChoiceGrid>
          {RIGHTS.map((right) => (
            <Choice key={right.id} $selected={form.rights[right.id].selected}>
              <input type="checkbox" checked={form.rights[right.id].selected} onChange={() => toggleRight(right.id)} />
              <span><strong>{right.label}</strong><small>{right.article} · {right.help}</small></span>
            </Choice>
          ))}
        </ChoiceGrid>
      </Fieldset>

      {selected.map((right) => {
        const impact = form.rights[right.id];
        const residualScore = Number(impact.residual_severity) * Number(impact.residual_likelihood);
        const residualBand = residualScore <= 3 ? 'Lav' : residualScore <= 7 ? 'Middel' : residualScore <= 11 ? 'Høj' : 'Meget høj';
        return (
          <RightCard key={right.id}>
            <RightHeader><div><h3>{right.label}</h3><span>{right.article}</span></div><StatusPill $tone={toneForStatus(residualBand)}>{residualBand} restrisiko</StatusPill></RightHeader>
            <RightBody>
              <Field><label htmlFor={`${right.id}-impact`}>Hvordan kan rettigheden blive påvirket?</label><textarea id={`${right.id}-impact`} value={impact.impact_description} onChange={(event) => updateRight(right.id, 'impact_description', event.target.value)} required /></Field>
              <Field><label htmlFor={`${right.id}-harms`}>Konkrete skadescenarier</label><textarea id={`${right.id}-harms`} value={impact.harm_scenarios} onChange={(event) => updateRight(right.id, 'harm_scenarios', event.target.value)} placeholder="Skriv ét scenarie pr. linje…" required /></Field>
              <Grid $columns={2}>
                <Field><label htmlFor={`${right.id}-severity`}>Iboende alvor</label><select id={`${right.id}-severity`} value={impact.severity} onChange={(event) => updateRight(right.id, 'severity', Number(event.target.value))}>{SCALE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
                <Field><label htmlFor={`${right.id}-likelihood`}>Iboende sandsynlighed</label><select id={`${right.id}-likelihood`} value={impact.likelihood} onChange={(event) => updateRight(right.id, 'likelihood', Number(event.target.value))}>{SCALE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
                <Field><label htmlFor={`${right.id}-residual-severity`}>Forventet resterende alvor</label><select id={`${right.id}-residual-severity`} value={impact.residual_severity} onChange={(event) => updateRight(right.id, 'residual_severity', Number(event.target.value))}>{SCALE_OPTIONS.filter((option) => option.value <= impact.severity).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
                <Field><label htmlFor={`${right.id}-residual-likelihood`}>Forventet resterende sandsynlighed</label><select id={`${right.id}-residual-likelihood`} value={impact.residual_likelihood} onChange={(event) => updateRight(right.id, 'residual_likelihood', Number(event.target.value))}>{SCALE_OPTIONS.filter((option) => option.value <= impact.likelihood).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
              </Grid>
              <Field><label htmlFor={`${right.id}-evidence`}>Evidensreferencer</label><input id={`${right.id}-evidence`} value={impact.evidence} onChange={(event) => updateRight(right.id, 'evidence', event.target.value)} placeholder="Fx DBA v2.1, testprotokol 4, politik for menneskeligt tilsyn" /><small>Adskil flere referencer med komma.</small></Field>
            </RightBody>
          </RightCard>
        );
      })}
    </>
  );
}

function NecessityStep({ form, setField }) {
  return (
    <>
      <Fieldset>
        <legend>Nødvendighed</legend>
        <Inset><p>En legitim gevinst er ikke i sig selv nok. Dokumentér hvorfor målet ikke kan nås lige så effektivt med et mindre indgribende alternativ.</p></Inset>
        <Field><label htmlFor="legitimate-objective">Legitimt og konkret mål</label><textarea id="legitimate-objective" value={form.legitimate_objective} onChange={(event) => setField('legitimate_objective', event.target.value)} required /></Field>
        <Field><label htmlFor="legal-mandate">Præcis hjemmel eller mandat</label><textarea id="legal-mandate" value={form.legal_mandate} onChange={(event) => setField('legal_mandate', event.target.value)} placeholder="Angiv bestemmelse, kommunal opgave og eventuelle rammer…" required /></Field>
        <Field><label htmlFor="why-necessary">Hvorfor er løsningen egnet til at nå målet?</label><textarea id="why-necessary" value={form.why_necessary} onChange={(event) => setField('why_necessary', event.target.value)} required /></Field>
        <Field><label htmlFor="alternatives">Mindre indgribende alternativer</label><textarea id="alternatives" value={form.alternatives_considered} onChange={(event) => setField('alternatives_considered', event.target.value)} placeholder="Skriv ét reelt alternativ pr. linje…" required /><small>Hvert alternativ skal beskrives konkret.</small></Field>
        <Field><label htmlFor="data-minimisation">Data- og funktionsminimering</label><textarea id="data-minimisation" value={form.data_and_function_minimisation} onChange={(event) => setField('data_and_function_minimisation', event.target.value)} placeholder="Hvilke data og funktioner er fravalgt, begrænset eller gjort valgfrie?" required /></Field>
      </Fieldset>
      <Fieldset>
        <legend>Proportionalitet</legend>
        <Field><label htmlFor="public-benefit">Forventet offentlig fordel</label><textarea id="public-benefit" value={form.expected_public_benefit} onChange={(event) => setField('expected_public_benefit', event.target.value)} required /></Field>
        <Field><label htmlFor="rights-cost">Forventet omkostning for grundlæggende rettigheder</label><textarea id="rights-cost" value={form.expected_rights_cost} onChange={(event) => setField('expected_rights_cost', event.target.value)} required /></Field>
        <Field><label htmlFor="proportionality">Samlet afvejning og begrundelse for den valgte løsning</label><textarea id="proportionality" value={form.proportionality_reasoning} onChange={(event) => setField('proportionality_reasoning', event.target.value)} required /></Field>
        <Field><label htmlFor="proportionality-conclusion">Konklusion</label><select id="proportionality-conclusion" value={form.proportionality_conclusion} onChange={(event) => setField('proportionality_conclusion', event.target.value)}><option value="not_assessed">Ikke afsluttet</option><option value="proportionate">Proportional</option><option value="proportionate_with_conditions">Proportional med vilkår</option><option value="not_proportionate">Ikke proportional</option></select></Field>
      </Fieldset>
    </>
  );
}

function ControlStep({ form, setField, updateMeasure, addMeasure, removeMeasure }) {
  return (
    <>
      <Fieldset>
        <legend>Menneskeligt tilsyn</legend>
        <Grid $columns={3}>
          <BinaryChoice legend="Er menneskeligt tilsyn aktiveret?" value={form.oversight_enabled} onChange={(value) => setField('oversight_enabled', value)} />
          <BinaryChoice legend="Kan den ansvarlige tilsidesætte output eller stoppe brugen?" value={form.can_override_or_stop} onChange={(value) => setField('can_override_or_stop', value)} />
          <BinaryChoice legend="Har den ansvarlige tilstrækkelig tid og information?" value={form.sufficient_time_and_information} onChange={(value) => setField('sufficient_time_and_information', value)} />
        </Grid>
        {form.oversight_enabled ? (
          <>
            <Field><label htmlFor="oversight-authority">Ansvarlig rolle og mandat</label><textarea id="oversight-authority" value={form.oversight_authority} onChange={(event) => setField('oversight_authority', event.target.value)} required /></Field>
            <Field><label htmlFor="oversight-training">Kompetencer og uddannelse</label><textarea id="oversight-training" value={form.competence_and_training} onChange={(event) => setField('competence_and_training', event.target.value)} required /></Field>
            <Field><label htmlFor="override-procedure">Review-, tilsidesættelses- og stopprocedure</label><textarea id="override-procedure" value={form.review_and_override_procedure} onChange={(event) => setField('review_and_override_procedure', event.target.value)} required /></Field>
            <Field><label htmlFor="bias-controls">Kontrol mod automation bias</label><textarea id="bias-controls" value={form.automation_bias_controls} onChange={(event) => setField('automation_bias_controls', event.target.value)} required /></Field>
          </>
        ) : null}
      </Fieldset>

      <Fieldset>
        <legend>Klage og afhjælpning</legend>
        <Grid $columns={2}>
          <BinaryChoice legend="Informeres de berørte om systemets rolle?" value={form.people_are_informed} onChange={(value) => setField('people_are_informed', value)} />
          <BinaryChoice legend="Er der en tilgængelig klagekanal?" value={form.accessible_complaint_channel} onChange={(value) => setField('accessible_complaint_channel', value)} />
          <BinaryChoice legend="Kan sagen genvurderes af et menneske?" value={form.human_reconsideration_available} onChange={(value) => setField('human_reconsideration_available', value)} />
          <BinaryChoice legend="Findes appel eller uafhængigt review?" value={form.appeal_or_independent_review_available} onChange={(value) => setField('appeal_or_independent_review_available', value)} />
        </Grid>
        {form.accessible_complaint_channel ? (
          <>
            <Grid $columns={2}>
              <Field><label htmlFor="complaint-contact">Kontaktpunkt</label><input id="complaint-contact" value={form.complaint_contact_point} onChange={(event) => setField('complaint_contact_point', event.target.value)} required /></Field>
              <Field><label htmlFor="response-target">Svarmål</label><input id="response-target" value={form.complaint_response_target} onChange={(event) => setField('complaint_response_target', event.target.value)} placeholder="Fx senest 10 arbejdsdage" required /></Field>
            </Grid>
            <Field><label htmlFor="accessibility-accommodations">Tilgængelighed og støtte til berørte grupper</label><textarea id="accessibility-accommodations" value={form.accessibility_accommodations} onChange={(event) => setField('accessibility_accommodations', event.target.value)} required /></Field>
          </>
        ) : null}
      </Fieldset>

      <Fieldset>
        <legend>Løbende kontrol</legend>
        <Field><label htmlFor="monitoring-metrics">Målinger</label><textarea id="monitoring-metrics" value={form.monitoring_metrics} onChange={(event) => setField('monitoring_metrics', event.target.value)} placeholder="Skriv én måling pr. linje, fx fejlrate pr. borgergruppe…" required /></Field>
        <Field><label htmlFor="incident-process">Hændelses- og eskalationsproces</label><textarea id="incident-process" value={form.incident_and_escalation_process} onChange={(event) => setField('incident_and_escalation_process', event.target.value)} required /></Field>
        <Field><label htmlFor="change-triggers">Ændringer der udløser nyt review</label><textarea id="change-triggers" value={form.change_triggers} onChange={(event) => setField('change_triggers', event.target.value)} placeholder="Skriv én udløser pr. linje, fx ny modelversion…" required /></Field>
        <Grid $columns={2}>
          <Field><label htmlFor="responsible-owner">Ansvarlig funktion</label><input id="responsible-owner" value={form.responsible_owner} onChange={(event) => setField('responsible_owner', event.target.value)} required /></Field>
          <Field><label htmlFor="review-date">Næste review</label><input id="review-date" type="date" value={form.review_date} onChange={(event) => setField('review_date', event.target.value)} required /></Field>
        </Grid>
      </Fieldset>

      <Fieldset>
        <legend>Handlingsplan</legend>
        {form.measures.map((measure, index) => (
          <MeasureEditor key={`measure-${index}`}>
            <Field><label htmlFor={`measure-${index}-title`}>Foranstaltning {index + 1}</label><input id={`measure-${index}-title`} value={measure.title} onChange={(event) => updateMeasure(index, 'title', event.target.value)} /></Field>
            <Field><label htmlFor={`measure-${index}-owner`}>Ansvarlig</label><input id={`measure-${index}-owner`} value={measure.owner} onChange={(event) => updateMeasure(index, 'owner', event.target.value)} /></Field>
            <Field className="wide"><label htmlFor={`measure-${index}-description`}>Beskrivelse</label><textarea id={`measure-${index}-description`} value={measure.description} onChange={(event) => updateMeasure(index, 'description', event.target.value)} /></Field>
            <Field><label htmlFor={`measure-${index}-status`}>Status</label><select id={`measure-${index}-status`} value={measure.status} onChange={(event) => updateMeasure(index, 'status', event.target.value)}><option value="planned">Planlagt</option><option value="in_progress">I gang</option><option value="implemented_unverified">Implementeret, ikke verificeret</option><option value="implemented_verified">Implementeret og verificeret</option></select></Field>
            {['planned', 'in_progress'].includes(measure.status) ? <Field><label htmlFor={`measure-${index}-due`}>Frist</label><input id={`measure-${index}-due`} type="date" value={measure.due_date} onChange={(event) => updateMeasure(index, 'due_date', event.target.value)} /></Field> : null}
            <Field className="wide"><label htmlFor={`measure-${index}-evidence`}>Evidens</label><textarea id={`measure-${index}-evidence`} value={measure.evidence} onChange={(event) => updateMeasure(index, 'evidence', event.target.value)} placeholder="Påkrævet når foranstaltningen markeres implementeret og verificeret." /></Field>
            <SecondaryButton type="button" onClick={() => removeMeasure(index)} disabled={form.measures.length === 1}>Fjern</SecondaryButton>
          </MeasureEditor>
        ))}
        <SecondaryButton type="button" onClick={addMeasure}>Tilføj foranstaltning</SecondaryButton>
      </Fieldset>
    </>
  );
}

function normalizeResult(payload) {
  const source = payload?.assessment || payload?.result || payload || {};
  return {
    ...source,
    status: source.decision_readiness_label || source.decision_readiness || source.status || source.overall_status || source.risk_level || 'Kræver manuel vurdering',
    summary: source.summary || source.conclusion || source.explanation || `Samlet iboende risiko: ${source.overall_inherent_risk || 'ikke beregnet'}. Samlet resterende risiko: ${source.overall_residual_risk || 'ikke beregnet'}.`,
    impacts: toArray(source.rights_findings || source.rights_impacts || source.impacts || source.findings),
    measures: toArray(source.measures || source.required_measures || source.action_items || source.actions),
    missing: toArray(source.blockers || source.missing_information || source.open_questions || source.gaps),
    sources: toArray(source.sources || source.citations || source.legal_sources),
  };
}

function valueTitle(value, fallback) {
  if (typeof value === 'string') return value;
  return value?.title || value?.label || value?.right_label || value?.right || fallback;
}

function valueDescription(value) {
  if (typeof value === 'string') return value;
  return value?.description || value?.summary || value?.impact_description || value?.reason || '';
}

function ResultPage({ payload, onReset }) {
  const result = normalizeResult(payload);
  const tone = toneForStatus(result.status);
  const accent = { success: '#246042', warning: '#b08a4a', danger: '#9b302b', neutral: '#006f71' }[tone];
  return (
    <Page>
      <PageHeader>
        <div><Eyebrow>S.H.I.E.L.D. · grundrettigheder</Eyebrow><Title>Grundrettighedsvurdering</Title><Lede>En samlet FRIA med påvirkninger, restrisici, kontrol og afhjælpning.</Lede></div>
        <SecondaryButton type="button" onClick={onReset}>Ny vurdering</SecondaryButton>
      </PageHeader>

      <Section><ResultHero $accent={accent}><StatusPill $tone={tone}>{result.status}</StatusPill><h2>{result.title || 'Samlet vurdering'}</h2><p>{result.summary}</p></ResultHero></Section>

      <Section>
        <SectionHeader><div><h2>Påvirkede rettigheder</h2><p>Hver påvirkning vises med forklaring og restrisiko.</p></div></SectionHeader>
        {result.impacts.length ? <Grid $columns={2}>{result.impacts.map((impact, index) => <Card key={impact.id || impact.right || index}><StatusPill $tone={toneForStatus(impact.residual_risk || impact.risk_level)}>{impact.residual_risk || impact.risk_level || 'Vurderet'}</StatusPill><h3>{valueTitle(impact, `Rettighed ${index + 1}`)}</h3><p>{valueDescription(impact)}</p></Card>)}</Grid> : <StatePanel><strong>Ingen rettighedsfund returneret</strong><p>Kontrollér om alle relevante påvirkninger blev udfyldt og indsendt.</p></StatePanel>}
      </Section>

      <Section>
        <SectionHeader><div><h2>Påkrævede foranstaltninger</h2><p>Foranstaltningerne skal få en ansvarlig, frist og dokumenteret effekt.</p></div></SectionHeader>
        {result.measures.length ? <List>{result.measures.map((measure, index) => <ListItem key={measure.id || index}><div><strong>{valueTitle(measure, `Foranstaltning ${index + 1}`)}</strong><p>{valueDescription(measure)}</p></div><StatusPill $tone={toneForStatus(measure.status)}>{measure.status || 'Planlagt'}</StatusPill></ListItem>)}</List> : <StatePanel><strong>Ingen yderligere foranstaltninger returneret</strong><p>Det betyder ikke automatisk, at restrisikoen er accepteret; godkenderen skal tage stilling.</p></StatePanel>}
      </Section>

      {result.missing.length ? <Section><SectionHeader><div><h2>Manglende oplysninger</h2><p>Disse forhold skal afklares før endelig godkendelse.</p></div></SectionHeader><List>{result.missing.map((item, index) => <ListItem key={item.id || index}><div><strong>{valueTitle(item, `Uafklaret forhold ${index + 1}`)}</strong><p>{valueDescription(item)}</p></div><StatusPill $tone="warning">Åben</StatusPill></ListItem>)}</List></Section> : null}

      <Section>
        <SectionHeader><div><h2>Retsgrundlag og metode</h2><p>FRIA-resultatet skal læses sammen med den konkrete AI Act- og DPIA-vurdering.</p></div></SectionHeader>
        {result.sources.length ? result.sources.map((source, index) => <TextLink key={source.url || source.href || index} href={source.url || source.href} target="_blank" rel="noreferrer">{valueTitle(source, `Kilde ${index + 1}`)} <span aria-hidden="true">↗</span></TextLink>) : <TextLink href="https://eur-lex.europa.eu/eli/reg/2024/1689" target="_blank" rel="noreferrer">AI-forordningen, artikel 27 <span aria-hidden="true">↗</span></TextLink>}
      </Section>

      <Inset $accent="#b08a4a"><strong>Godkendelse er en menneskelig beslutning</strong><p>S.H.I.E.L.D. strukturerer vurderingen og synliggør mangler. Den ansvarlige myndighed skal selv godkende proportionalitet, restrisiko og de planlagte foranstaltninger.</p></Inset>
    </Page>
  );
}

function FriaAssessmentPage() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => initialForm(searchParams.get('case_id') || ''));
  const mutation = useMutation(assessFria);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const toggleGroup = (value) => setForm((current) => ({
    ...current,
    affected_group_ids: current.affected_group_ids.includes(value) ? current.affected_group_ids.filter((item) => item !== value) : [...current.affected_group_ids, value],
  }));
  const toggleRight = (rightId) => setForm((current) => ({
    ...current,
    rights: { ...current.rights, [rightId]: { ...current.rights[rightId], selected: !current.rights[rightId].selected } },
  }));
  const updateRight = (rightId, field, value) => setForm((current) => {
    const nextImpact = { ...current.rights[rightId], [field]: value };
    if (field === 'severity') nextImpact.residual_severity = Math.min(nextImpact.residual_severity, value);
    if (field === 'likelihood') nextImpact.residual_likelihood = Math.min(nextImpact.residual_likelihood, value);
    return { ...current, rights: { ...current.rights, [rightId]: nextImpact } };
  });
  const updateMeasure = (index, field, value) => setForm((current) => ({
    ...current,
    measures: current.measures.map((measure, measureIndex) => measureIndex === index ? { ...measure, [field]: value } : measure),
  }));
  const addMeasure = () => setForm((current) => ({ ...current, measures: [...current.measures, { title: '', description: '', owner: '', due_date: '', status: 'planned', evidence: '' }] }));
  const removeMeasure = (index) => setForm((current) => ({ ...current, measures: current.measures.filter((_, measureIndex) => measureIndex !== index) }));

  const selectedRights = useMemo(() => RIGHTS.filter((right) => form.rights[right.id].selected), [form.rights]);
  const canContinue = useMemo(() => {
    if (step === 0) return form.case_id.trim().length >= 2
      && form.system_name.trim().length >= 2
      && form.purpose.trim().length >= 20
      && form.deployment_context.trim().length >= 20
      && form.duration.trim().length >= 20
      && form.decision_owner.trim().length >= 2
      && form.affected_group_ids.length > 0
      && form.affected_group_detail.trim().length >= 20
      && (!form.groups_consulted || form.consultation_details.trim().length >= 20);
    if (step === 1) return selectedRights.length > 0 && selectedRights.every((right) => {
      const impact = form.rights[right.id];
      return impact.impact_description.trim().length >= 20
        && impact.harm_scenarios.split('\n').some((item) => item.trim().length >= 5);
    });
    if (step === 2) {
      const alternatives = form.alternatives_considered.split('\n').map((item) => item.trim()).filter(Boolean);
      return form.legitimate_objective.trim().length >= 20
        && form.legal_mandate.trim().length >= 5
        && form.why_necessary.trim().length >= 20
        && alternatives.length > 0
        && alternatives.every((item) => item.length >= 10)
        && form.data_and_function_minimisation.trim().length >= 20
        && form.expected_public_benefit.trim().length >= 20
        && form.expected_rights_cost.trim().length >= 20
        && form.proportionality_reasoning.trim().length >= 40;
    }
    const oversightReady = !form.oversight_enabled || [form.oversight_authority, form.competence_and_training, form.review_and_override_procedure, form.automation_bias_controls].every((value) => value.trim().length >= 20);
    const complaintsReady = !form.accessible_complaint_channel || (form.complaint_contact_point.trim().length >= 5 && form.complaint_response_target.trim().length >= 5 && form.accessibility_accommodations.trim().length >= 20);
    const metrics = form.monitoring_metrics.split('\n').map((item) => item.trim()).filter(Boolean);
    const triggers = form.change_triggers.split('\n').map((item) => item.trim()).filter(Boolean);
    const measures = form.measures.filter((measure) => measure.title.trim());
    const measuresReady = measures.every((measure) => measure.description.trim().length >= 20
      && measure.owner.trim().length >= 2
      && (!['planned', 'in_progress'].includes(measure.status) || Boolean(measure.due_date))
      && (measure.status !== 'implemented_verified' || measure.evidence.trim().length >= 20));
    const claimsReduction = selectedRights.some((right) => {
      const impact = form.rights[right.id];
      return impact.residual_severity < impact.severity || impact.residual_likelihood < impact.likelihood;
    });
    return oversightReady
      && complaintsReady
      && form.responsible_owner.trim().length >= 2
      && Boolean(form.review_date)
      && metrics.length > 0
      && metrics.every((item) => item.length >= 5)
      && triggers.length > 0
      && triggers.every((item) => item.length >= 5)
      && form.incident_and_escalation_process.trim().length >= 20
      && measuresReady
      && (!claimsReduction || measures.length > 0);
  }, [form, selectedRights, step]);

  const submit = (event) => {
    event.preventDefault();
    if (step < STEPS.length - 1) {
      setStep((current) => current + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    mutation.mutate(form);
  };

  const reset = () => {
    mutation.reset();
    setStep(0);
    setForm(initialForm(searchParams.get('case_id') || ''));
  };

  if (mutation.isSuccess) return <ResultPage payload={mutation.data} onReset={reset} />;

  return (
    <Page>
      <PageHeader>
        <div><Eyebrow>S.H.I.E.L.D. · AI Act artikel 27</Eyebrow><Title>Grundrettighedsvurdering</Title><Lede>Dokumentér hvem der påvirkes, hvilke rettigheder der er på spil, om løsningen er nødvendig, og hvordan personer kan få menneskelig kontrol og afhjælpning.</Lede></div>
      </PageHeader>

      <WizardNav aria-label="Grundrettighedsvurderingens trin">
        {STEPS.map((item, index) => <WizardStep key={item.label} $active={index === step} aria-current={index === step ? 'step' : undefined}><span>Trin {index + 1} af {STEPS.length}</span><strong>{item.label}</strong></WizardStep>)}
      </WizardNav>

      <Form onSubmit={submit}>
        <FormIntro><h2>{STEPS[step].label}</h2><p>{STEPS[step].description}</p></FormIntro>
        {step === 0 ? <ContextStep form={form} setField={setField} toggleGroup={toggleGroup} /> : null}
        {step === 1 ? <RightsStep form={form} toggleRight={toggleRight} updateRight={updateRight} /> : null}
        {step === 2 ? <NecessityStep form={form} setField={setField} /> : null}
        {step === 3 ? <ControlStep form={form} setField={setField} updateMeasure={updateMeasure} addMeasure={addMeasure} removeMeasure={removeMeasure} /> : null}

        {mutation.isError ? <ErrorPanel role="alert"><strong>Vurderingen kunne ikke gemmes</strong><p>{String(mutation.error?.response?.data?.detail || mutation.error?.message || 'Ukendt fejl')}</p></ErrorPanel> : null}

        <FormActions>
          <SecondaryButton type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || mutation.isLoading}>Tilbage</SecondaryButton>
          <Button type="submit" disabled={!canContinue || mutation.isLoading}>{mutation.isLoading ? 'Vurderer…' : step === STEPS.length - 1 ? 'Vis samlet FRIA' : 'Næste'}</Button>
        </FormActions>
      </Form>
    </Page>
  );
}

export default FriaAssessmentPage;
