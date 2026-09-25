import React from 'react';
import styled from 'styled-components';
import { TextLink } from '../workflow/WorkflowUi';

const Tools = styled.section`
  margin-top: 30px;
  padding: clamp(18px, 3vw, 28px);
  border: 1px solid ${p => p.theme.colors.lineSoft};
  border-radius: ${p => p.theme.borderRadiusLarge};
  background: ${p => p.theme.colors.surface};
  min-width: 0;
  h2 { margin: 0 0 10px; font-size: 1.35rem; }
  > p { max-width: 76ch; color: ${p => p.theme.colors.inkSoft}; line-height: 1.6; }
  article { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(0, 2fr); gap: 18px 30px; padding: 22px 0; border-top: 1px solid ${p => p.theme.colors.lineSoft}; }
  article > div { min-width: 0; overflow-wrap: anywhere; }
  article:last-child { padding-bottom: 0; }
  h3 { margin: 0 0 8px; font-size: 1rem; }
  p { margin: 0 0 10px; font-size: 0.86rem; line-height: 1.6; }
  small { display: block; margin-top: 8px; color: ${p => p.theme.colors.inkSoft}; line-height: 1.5; }
  @media (max-width: 600px) { article { grid-template-columns: minmax(0, 1fr); gap: 8px; } }
`;

export const assessmentType = item => {
  const raw = item.category || item.type || item.assessment_type;
  return ({ dpia_assessment: 'dpia', ai_act_assessment: 'ai_act', fria_assessment: 'fria' })[raw] || raw;
};

export function latestDpia(assessments = []) {
  return assessments.filter(item => assessmentType(item) === 'dpia').slice().sort((a, b) =>
    Number(b.version || 0) - Number(a.version || 0) || (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)
  )[0];
}

export default function CaseAssessmentTools({ caseId, assessments = [] }) {
  const id = encodeURIComponent(caseId);
  const latest = latestDpia(assessments);
  const tracks = [
    { id: 'dpia', title: 'Konsekvensanalyse og risikovurdering', why: 'Samler anvendelse, personoplysninger, dokumentation, risici og forslag til foranstaltninger i sagens beslutningsgrundlag.', when: latest ? 'Der findes allerede en vurdering. Fortsæt herfra, og opret en ny version, når materialet eller anvendelsen ændres.' : 'Brug dette spor til at opbygge den første samlede vurdering af den konkrete anvendelse.', href: latest ? `/vurdering?assessment_id=${encodeURIComponent(latest.id)}&case=${id}` : `/vurdering?case=${id}`, action: latest ? 'Fortsæt seneste konsekvensanalyse' : 'Start konsekvensanalyse' },
    { id: 'legal_screening', title: 'Juridisk screening', why: 'Giver en indledende, regelbaseret gennemgang af de registrerede oplysninger og fremhæver forhold, der kræver faglig afklaring.', when: 'Brug den til at afgrænse de juridiske spørgsmål. Screeningen erstatter ikke en gennemgået konsekvensanalyse eller en godkendelse.', href: `/juridisk-screening?case=${id}`, action: 'Åbn juridisk screening' },
    { id: 'ai_act', title: 'AI Act-afklaring', why: 'Belyser AI-løsningens klassifikation, kommunens rolle og de forhold, der skal undersøges efter AI-forordningen.', when: 'Brug dette særskilte spor til at dokumentere AI Act-afklaringen. En databeskyttelsesvurdering afgør ikke alene disse spørgsmål.', href: `/ai-act-vurdering?case_id=${id}`, action: 'Åbn AI Act-afklaring' },
    { id: 'fria', title: 'Vurdering af grundrettigheder', why: 'Belyser mulige konsekvenser for de mennesker, som AI-løsningen kan påvirke, ud over behandlingen af personoplysninger.', when: 'Relevansen skal afklares i den konkrete sag. At værktøjet er tilgængeligt betyder ikke, at denne vurdering allerede er påkrævet eller udført.', href: `/grundrettigheder?case_id=${id}`, action: 'Åbn grundrettighedsvurdering' },
  ];
  return <Tools aria-label="Vurderingsspor og deres formål">
    <h2>Hvilken vurdering skal bruges?</h2>
    <p>Vurderingerne belyser forskellige spørgsmål. Vælg et spor ud fra sagen og de afklaringer, der mangler.</p>
    {tracks.map(track => {
      const count = assessments.filter(item => assessmentType(item) === track.id).length;
      return <article key={track.id}><div><h3>{track.title}</h3><small>{count ? `${count} ${count === 1 ? 'gemt version' : 'gemte versioner'}` : 'Ingen vurdering registreret i dette spor'}</small></div><div><p>{track.why}</p><p>{track.when}</p><TextLink href={track.href}>{track.action} →</TextLink></div></article>;
    })}
  </Tools>;
}
