import React, { useState } from 'react';
import styled from 'styled-components';
import { useMutation } from 'react-query';
import axios from 'axios';
import { ComplianceVerdict } from '../components/rules';

/**
 * SammenlignPage — Step 4 from HANDOFF.md.
 *
 * Side-by-side diff between the legacy ComplianceController (the engine
 * that lived in src/compliance_engine.py before v3) and the new v3
 * rule_engine on the same input. Used to validate that v3 covers the
 * cases legacy catches before we delete legacy code.
 */

const SAMPLE_REQUEST = {
  system_description:
    'Borgerassistent — pensionsansøgning. AI-drevet tjeneste der hjælper borgere ' +
    'med pensionsansøgninger og foretager profilering af risikoprofil. Træffer ' +
    'skriftlige afgørelser om tildeling. Behandler personoplysninger.',
  signals: {
    'system.uses_ai': true,
    'system.processes_personal_data': true,
    'system.makes_decisions_about_persons': true,
    'system.is_used_by_public_authority': true,
    'system.makes_administrative_decisions': true,
  },
  predicates: {
    anvendelsesomraade: 'vaesentlige_offentlige_tjenester',
    profilering: true,
    er_helautomatiseret: true,
    har_retsvirkning_eller_betydelig_paavirkning: true,
    retsgrundlag: 'samfundets_interesse_eller_offentlig_myndighed_e',
    meddeles_skriftligt: true,
    fuld_medhold: false,
  },
};

async function postCompare(body) {
  const res = await axios.post('/api/v3/compare', body);
  return res.data;
}

const Page = styled.div`
  max-width: 1180px;
  margin: 0 auto;
  padding: 3rem 2.5rem 5rem;
`;

const Eyebrow = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: ${(p) => p.theme.colors.inkFaded};
  margin-bottom: 0.6rem;
  font-weight: 600;
`;

const Title = styled.h1`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 2.4rem;
  font-weight: 700;
  letter-spacing: -0.022em;
  line-height: 1.12;
  margin: 0 0 0.6rem;
  color: ${(p) => p.theme.colors.ink};
`;

const Lede = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  margin: 0 0 2.5rem;
  color: ${(p) => p.theme.colors.inkSoft};
  font-size: 1.05rem;
  line-height: 1.65;
  max-width: 720px;
`;

const FormCard = styled.form`
  background: ${(p) => p.theme.colors.card};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 10px;
  padding: 1.75rem;
  margin-bottom: 2rem;
`;

const Label = styled.label`
  display: block;
  font-family: ${(p) => p.theme.fonts.sans};
  font-weight: 500;
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  color: ${(p) => p.theme.colors.inkSoft};
  margin-bottom: 0.5rem;
  text-transform: uppercase;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 120px;
  padding: 0.85rem 1rem;
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 6px;
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1rem;
  line-height: 1.6;
  resize: vertical;
  background: ${(p) => p.theme.colors.paper};
  color: ${(p) => p.theme.colors.ink};
`;

const Controls = styled.div`
  display: flex;
  gap: 0.85rem;
  margin-top: 1.25rem;
  flex-wrap: wrap;
  align-items: center;
`;

const PrimaryButton = styled.button`
  background: ${(p) => p.theme.colors.primary};
  color: white;
  border: none;
  padding: 0.7rem 1.4rem;
  border-radius: 6px;
  font-family: ${(p) => p.theme.fonts.sans};
  font-weight: 600;
  font-size: 0.92rem;
  cursor: pointer;
`;

const SecondaryButton = styled.button`
  background: transparent;
  color: ${(p) => p.theme.colors.ink};
  border: 1px solid ${(p) => p.theme.colors.line};
  padding: 0.65rem 1.1rem;
  border-radius: 6px;
  font-family: ${(p) => p.theme.fonts.sans};
  font-weight: 500;
  font-size: 0.9rem;
  cursor: pointer;
`;

const VerdictBanner = styled.div`
  background: ${(p) =>
    p.$agreement === 'match' ? 'rgba(45, 106, 49, 0.10)' : p.theme.colors.primaryBg};
  border-left: 4px solid ${(p) =>
    p.$agreement === 'match' ? p.theme.colors.success : p.theme.colors.primary};
  border-radius: 0 6px 6px 0;
  padding: 1.1rem 1.4rem;
  margin: 1.75rem 0 2.5rem;
`;

const VerdictStatus = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: ${(p) =>
    p.$agreement === 'match' ? p.theme.colors.success : p.theme.colors.primary};
  font-weight: 700;
  margin-bottom: 0.35rem;
`;

const VerdictText = styled.div`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1.05rem;
  color: ${(p) => p.theme.colors.ink};
  line-height: 1.5;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Column = styled.section`
  background: ${(p) => p.theme.colors.card};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 10px;
  padding: 1.5rem 1.75rem;
`;

const ColumnHead = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.line};
`;

const ColumnTitle = styled.h2`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
`;

const Stat = styled.div`
  display: flex;
  justify-content: space-between;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.88rem;
  color: ${(p) => p.theme.colors.inkSoft};
  padding: 0.4rem 0;

  b {
    color: ${(p) => p.theme.colors.ink};
    font-weight: 500;
  }
`;

const TopicList = styled.div`
  margin-top: 0.75rem;
`;

const TopicLabel = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${(p) => p.theme.colors.inkFaded};
  font-weight: 600;
  margin-bottom: 0.5rem;
`;

const TopicChip = styled.span`
  display: inline-block;
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px solid ${(p) => p.theme.colors.line};
  color: ${(p) => p.theme.colors.ink};
  padding: 3px 10px;
  border-radius: 999px;
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.78rem;
  margin: 0 0.4rem 0.4rem 0;
`;

const TriggeredItem = styled.div`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.92rem;
  color: ${(p) => p.theme.colors.ink};
  padding: 0.55rem 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.lineSoft};
  line-height: 1.5;

  &:last-child { border-bottom: none; }

  .id {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.75rem;
    color: ${(p) => p.theme.colors.inkFaded};
    display: block;
    margin-top: 2px;
  }
`;

const Empty = styled.div`
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px dashed ${(p) => p.theme.colors.line};
  border-radius: 8px;
  padding: 2.5rem;
  text-align: center;
  color: ${(p) => p.theme.colors.inkSoft};
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1rem;
  font-style: italic;
`;

const ErrorBox = styled.div`
  background: ${(p) => p.theme.colors.dangerSoft};
  border: 1px solid ${(p) => p.theme.colors.danger};
  color: ${(p) => p.theme.colors.danger};
  padding: 1rem 1.25rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.9rem;
`;

const SammenlignPage = () => {
  const [description, setDescription] = useState(SAMPLE_REQUEST.system_description);
  const mutation = useMutation(postCompare);
  const data = mutation.data;

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({
      ...SAMPLE_REQUEST,
      system_description: description.trim() || SAMPLE_REQUEST.system_description,
    });
  };

  const v3 = data?.v3;
  const legacy = data?.legacy;
  const diff = data?.diff;
  const agreement = diff?.agreement;

  return (
    <Page>
      <Eyebrow>S.H.I.E.L.D. · regelmotor-sammenligning</Eyebrow>
      <Title>Sammenlign engines</Title>
      <Lede>
        <strong>Validation-værktøj</strong> der udelukkende bruges til at
        sammenligne den gamle <code>ComplianceController</code> mod den nye v3
        rule_engine på samme input. Når jurist har kørt 10-15 sektor-cases
        gennem her og alle returnerer <code>match</code>, kan legacy-koden
        slettes (~4 800 linjer) — beskrevet i{' '}
        <a href="https://github.com/Parthee-Vijaya/SHIELD/blob/v3-hjemmel/SLETNING-EVAL.md" target="_blank" rel="noreferrer noopener">
          SLETNING-EVAL.md
        </a>. Denne side fjernes når sletningen er sket.
      </Lede>

      <FormCard onSubmit={handleSubmit}>
        <Label htmlFor="desc">Beskriv systemet</Label>
        <TextArea
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Controls>
          <PrimaryButton type="submit" disabled={mutation.isLoading}>
            {mutation.isLoading ? 'Kører…' : 'Sammenlign'}
          </PrimaryButton>
          <SecondaryButton
            type="button"
            onClick={() => setDescription(SAMPLE_REQUEST.system_description)}
          >
            Reset til eksempel
          </SecondaryButton>
        </Controls>
      </FormCard>

      {mutation.isError && (
        <ErrorBox>
          Kald til /api/v3/compare fejlede:{' '}
          {String(mutation.error?.message || mutation.error)}
        </ErrorBox>
      )}

      {!data && !mutation.isLoading && !mutation.isError && (
        <Empty>
          Klik <strong>"Sammenlign"</strong> for at køre begge engines på input.
        </Empty>
      )}

      {data && (
        <>
          <VerdictBanner $agreement={agreement}>
            <VerdictStatus $agreement={agreement}>
              {agreement === 'match' ? '✓ Engines er enige' : agreement === 'different' ? 'Uenighed' : 'Sammenligning'}
            </VerdictStatus>
            <VerdictText>
              v3 ender på <strong>{diff?.v3_decision || '—'}</strong>; legacy ender på{' '}
              <strong>{diff?.legacy_decision || '—'}</strong>.
              {agreement === 'match'
                ? ' Begge engines er enige om afgørelsen — v3 kan trygt overtage for legacy.'
                : agreement === 'different'
                ? ' Engines når forskellige resultater — undersøg manglen før legacy slettes.'
                : ''}
              {!legacy?.available && (
                <> Legacy engine er ikke initialiseret ({legacy?.reason}).</>
              )}
            </VerdictText>
          </VerdictBanner>

          <Grid>
            <Column>
              <ColumnHead>
                <ColumnTitle>v3 rule_engine</ColumnTitle>
                <ComplianceVerdict status={v3?.aggregate_status} size="sm" />
              </ColumnHead>
              <Stat><span>Engine</span> <b>{v3?.rule_engine_version}</b></Stat>
              <Stat><span>Regler loaded</span> <b>{v3?.rules_loaded}</b></Stat>
              <Stat><span>Triggered</span> <b>{v3?.triggered_count}</b></Stat>
              {diff?.v3_topics?.length > 0 && (
                <TopicList>
                  <TopicLabel>Lov-områder dækket</TopicLabel>
                  {diff.v3_topics.map((t) => <TopicChip key={t}>{t}</TopicChip>)}
                </TopicList>
              )}
              {v3?.triggered?.length > 0 && (
                <TopicList>
                  <TopicLabel>Triggered regler</TopicLabel>
                  {v3.triggered.map((t) => (
                    <TriggeredItem key={t.rule_id}>
                      {t.kilde?.lov || '—'} · {t.kilde?.artikel || ''}{' '}
                      {t.status && <em>· {t.status}</em>}
                      <span className="id">{t.rule_id}</span>
                    </TriggeredItem>
                  ))}
                </TopicList>
              )}
            </Column>

            <Column>
              <ColumnHead>
                <ColumnTitle>Legacy ComplianceController</ColumnTitle>
                {legacy?.available && (
                  <ComplianceVerdict
                    status={(legacy.decision || '').toUpperCase().replace('_', '-')}
                    size="sm"
                  />
                )}
              </ColumnHead>
              {!legacy?.available && (
                <Empty>
                  {legacy?.reason || 'Legacy engine er ikke tilgængelig'}
                </Empty>
              )}
              {legacy?.available && (
                <>
                  <Stat><span>Risk score</span> <b>{legacy.risk_score}</b></Stat>
                  <Stat><span>Klassifikation</span> <b>{legacy.classification || '—'}</b></Stat>
                  <Stat><span>Triggered</span> <b>{legacy.triggered_count}</b></Stat>
                  {diff?.legacy_topics?.length > 0 && (
                    <TopicList>
                      <TopicLabel>Lov-områder dækket</TopicLabel>
                      {diff.legacy_topics.map((t) => <TopicChip key={t}>{t}</TopicChip>)}
                    </TopicList>
                  )}
                  {legacy.triggered?.length > 0 && (
                    <TopicList>
                      <TopicLabel>Triggered regler</TopicLabel>
                      {legacy.triggered.map((t, i) => (
                        <TriggeredItem key={i}>
                          {t.beskrivelse || t.regel_id || '—'}
                          {t.alvorlighed && <em> · {t.alvorlighed}</em>}
                          <span className="id">{t.regel_id} · {t.kategori}</span>
                        </TriggeredItem>
                      ))}
                    </TopicList>
                  )}
                </>
              )}
            </Column>
          </Grid>
        </>
      )}
    </Page>
  );
};

export default SammenlignPage;
