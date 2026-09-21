import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';

import {
  PageShell,
  PageHeader,
  PrimaryButton,
  OutlinePill,
} from '../components/page-chrome/PageChrome';

// ---- Routing engine ------------------------------------------------------
//
// EC's logic.json bruger 5 condition-typer:
//  - answer_is:                     radio — selected answer index = N
//  - flag_equals:                   {flag_name, value} sammenligner flag-state
//  - if_any_answer_in:              checkbox — mindst ét af N er valgt
//  - if_none_selected_in:           checkbox — ingen af N er valgt
//  - is_this_exact_match_selected:  checkbox — præcis disse (no more, no less)
//
// Vi evaluerer betingelser i samme rækkefølge som EC's egen JSON og picker
// første matchende routing-rule.

function selectedSet(answer) {
  if (Array.isArray(answer)) return new Set(answer.map(Number));
  if (answer === null || answer === undefined) return new Set();
  return new Set([Number(answer)]);
}

function evalCondition(cond, answer, flags) {
  if ('answer_is' in cond) {
    return Number(answer) === Number(cond.answer_is);
  }
  if ('flag_equals' in cond) {
    const { flag_name, value } = cond.flag_equals;
    return flags[flag_name] === value;
  }
  const sel = selectedSet(answer);
  if ('if_any_answer_in' in cond) {
    return cond.if_any_answer_in.some((n) => sel.has(Number(n)));
  }
  if ('if_none_selected_in' in cond) {
    return !cond.if_none_selected_in.some((n) => sel.has(Number(n)));
  }
  if ('is_this_exact_match_selected' in cond) {
    const target = new Set(cond.is_this_exact_match_selected.map(Number));
    if (target.size !== sel.size) return false;
    for (const v of target) if (!sel.has(v)) return false;
    return true;
  }
  // Unknown condition — defensiv: fail
  return false;
}

function evalRouting(question, answer, flags) {
  for (const route of question.routing || []) {
    const allMatch = (route.conditions || []).every((c) =>
      evalCondition(c, answer, flags),
    );
    if (allMatch) return route;
  }
  return null;
}

function applyFlagOps(flags, ops) {
  if (!ops) return flags;
  const next = { ...flags };
  for (const { flag_name, value } of ops) {
    next[flag_name] = value;
  }
  return next;
}

// ---- Styled --------------------------------------------------------------

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 1rem;
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.74rem;
  color: ${(p) => p.theme.colors.textMuted};
  letter-spacing: 0.04em;
`;

const StepProgress = styled.div`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

const QuestionCard = styled.div`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: 8px;
  padding: 1.5rem 1.75rem 1.25rem;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: -1px;
    left: 1.85rem;
    right: 1.85rem;
    height: 2px;
    background: linear-gradient(
      to right,
      transparent,
      ${(p) => p.theme.colors.primary || '#0d2e54'} 50%,
      transparent
    );
    opacity: 0.4;
  }
`;

const Eyebrow = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: ${(p) => p.theme.colors.textMuted};
  font-weight: 600;
  margin-bottom: 0.4rem;
`;

const QuestionTitle = styled.h2`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.012em;
  line-height: 1.3;
  margin: 0 0 0.4rem;
  color: ${(p) => p.theme.colors.ink};
`;

const QuestionText = styled.div`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1.02rem;
  color: ${(p) => p.theme.colors.text};
  line-height: 1.55;
  margin-bottom: 1.1rem;
`;

const InfoToggle = styled.button`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${(p) => p.theme.colors.primary};
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 3px;
  padding: 0.25rem 0.7rem;
  cursor: pointer;
  margin-bottom: 0.85rem;
`;

const InfoBox = styled.div`
  background: ${(p) => p.theme.colors.paperSoft};
  border-left: 3px solid ${(p) => p.theme.colors.bronze};
  padding: 0.85rem 1.1rem;
  margin-bottom: 1rem;
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.92rem;
  line-height: 1.55;
  color: ${(p) => p.theme.colors.text};
  white-space: pre-wrap;
`;

const SourceLine = styled.div`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.72rem;
  color: ${(p) => p.theme.colors.textMuted};
  letter-spacing: 0.04em;
  margin-bottom: 1rem;
`;

const OptionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 1.4rem;
`;

const OptionLabel = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.7rem 1rem;
  border: 1px solid ${(p) => (p.$active ? p.theme.colors.primary : p.theme.colors.border)};
  border-radius: 4px;
  background: ${(p) => (p.$active ? (p.theme.colors.primarySoft || 'rgba(13,46,84,0.05)') : p.theme.colors.surface)};
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.96rem;
  color: ${(p) => p.theme.colors.text};
  line-height: 1.45;

  &:hover { border-color: ${(p) => p.theme.colors.primary}; }

  input { margin-top: 3px; cursor: pointer; }

  .help {
    display: block;
    font-size: 0.84rem;
    color: ${(p) => p.theme.colors.textMuted};
    margin-top: 0.3rem;
    font-style: italic;
  }
`;

const Controls = styled.div`
  display: flex;
  gap: 0.75rem;
  align-items: center;
`;

const SecondaryButton = styled.button`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.88rem;
  background: transparent;
  border: 1px solid ${(p) => p.theme.colors.border};
  color: ${(p) => p.theme.colors.text};
  padding: 0.55rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  &:hover { border-color: ${(p) => p.theme.colors.primary}; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

// ---- Result page --------------------------------------------------------

const ResultCard = styled.div`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: 8px;
  padding: 1.5rem 1.75rem;
`;

const FlagList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 1rem;
`;

const FlagRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.55rem 0.85rem;
  border: 1px solid ${(p) => p.theme.colors.border};
  border-left: 3px solid ${(p) => (p.$tone === 'risk' ? '#a02020' : p.$tone === 'obligation' ? '#b08a4a' : '#2d6a31')};
  border-radius: 4px;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.92rem;
  background: ${(p) => p.theme.colors.surface};

  .name {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.74rem;
    color: ${(p) => p.theme.colors.textMuted};
    margin-top: 0.3rem;
  }
`;

const VersionBadge = styled.span`
  display: inline-block;
  background: ${(p) => p.theme.colors.bronzeSoft || 'rgba(176,138,74,0.15)'};
  color: ${(p) => p.theme.colors.bronze || '#b08a4a'};
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 3px;
`;

// ---- Main page ----------------------------------------------------------

const EuAiActCheckerPage = () => {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);

  const [currentQid, setCurrentQid] = useState('Q1');
  const [answer, setAnswer] = useState(null); // number for radio, array for checkbox
  const [flags, setFlags] = useState({});
  const [history, setHistory] = useState([]); // [{qid, answer, snapshotFlags}]
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get('/api/eu-ai-act-checker?lang=en');
        if (cancelled) return;
        if (!r.data?.ready) {
          setError('Vejviserens spørgsmål er ikke tilgængelige på serveren. Prøv senere, eller kontakt den driftsansvarlige.');
          return;
        }
        setPayload(r.data);
      } catch (err) {
        setError(err.message || 'Kunne ikke hente checker-data');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const questionsLogic = payload?.logic?.questions_logic || {};
  const questionsContent = payload?.content?.questions_content || {};
  const flagsContent = payload?.content?.flags_content || {};

  const isEnd = currentQid === 'END' || currentQid === null;
  const currentLogic = questionsLogic[currentQid];
  const currentContent = questionsContent[currentQid];
  const isCheckbox = currentLogic?.type === 'checkbox';

  const reset = () => {
    setCurrentQid('Q1');
    setAnswer(null);
    setFlags({});
    setHistory([]);
    setShowInfo(false);
  };

  const goBack = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setCurrentQid(last.qid);
    setAnswer(last.answer);
    setFlags(last.snapshotFlags);
    setShowInfo(false);
  };

  const handleNext = () => {
    if (!currentLogic) return;
    if (answer === null || (isCheckbox && (!Array.isArray(answer) || answer.length === 0))) return;

    let nextFlags = { ...flags };

    // Apply set_flags from selected answer(s)
    if (isCheckbox) {
      for (const idx of answer) {
        const a = currentLogic.answers?.[String(idx)];
        if (a?.set_flags) nextFlags = applyFlagOps(nextFlags, a.set_flags);
      }
    } else {
      const a = currentLogic.answers?.[String(answer)];
      if (a?.set_flags) nextFlags = applyFlagOps(nextFlags, a.set_flags);
    }

    // Evaluate routing
    const route = evalRouting(currentLogic, answer, nextFlags);
    if (route?.set_flags) nextFlags = applyFlagOps(nextFlags, route.set_flags);

    setHistory([...history, { qid: currentQid, answer, snapshotFlags: flags }]);
    setFlags(nextFlags);
    setCurrentQid(route?.go_to || 'END');
    setAnswer(null);
    setShowInfo(false);
  };

  const toggleCheckbox = (idx, exclusive) => {
    setAnswer((prev) => {
      const current = Array.isArray(prev) ? [...prev] : [];
      if (exclusive) {
        // exclusive answer kan ikke kombineres — toggle alt-eller-ingen
        return current.includes(idx) ? [] : [idx];
      }
      // Hvis et exclusive answer er valgt, ryd det først
      const exclusiveAnswers = Object.entries(currentLogic?.answers || {})
        .filter(([_, a]) => a?.exclusive)
        .map(([k]) => Number(k));
      const cleaned = current.filter((n) => !exclusiveAnswers.includes(n));
      const i = cleaned.indexOf(idx);
      if (i >= 0) cleaned.splice(i, 1);
      else cleaned.push(idx);
      return cleaned;
    });
  };

  // Result-page: filter raised flags
  const raisedFlags = useMemo(() => {
    if (!isEnd) return [];
    const out = [];
    for (const [name, value] of Object.entries(flags)) {
      if (value === false || value === undefined || value === null) continue;
      const meta = flagsContent[name] || {};
      out.push({ name, value, ...meta });
    }
    // Sort: risk first, then obligation, then info
    const tone = (n) => {
      if (/risk|prohibit|highrisk/i.test(n)) return 0;
      if (/obligation/i.test(n)) return 1;
      return 2;
    };
    out.sort((a, b) => tone(a.name) - tone(b.name));
    return out;
  }, [isEnd, flags, flagsContent]);

  if (error) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="S.H.I.E.L.D. · EU compliance checker"
          title="EU AI Act-vejviser (engelsk)"
          lede="Vejviseren kunne ikke hentes. Der er ikke foretaget en vurdering."
        />
        <p role="alert">{error}</p>
      </PageShell>
    );
  }

  if (!payload || !payload.ready) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="S.H.I.E.L.D. · EU compliance checker"
          title="EU AI Act-vejviser (engelsk)"
          lede="Henter den gemte udgave af Europa-Kommissionens vejviser…"
        />
        <div style={{ fontFamily: 'monospace', opacity: 0.6 }}>
          Henter spørgsmål…
        </div>
      </PageShell>
    );
  }

  const meta = payload.meta || {};

  return (
    <PageShell>
      <PageHeader
        eyebrow="S.H.I.E.L.D. · EU compliance checker"
        title="EU AI Act-vejviser (engelsk)"
        lede="En engelsk vejviser baseret på Europa-Kommissionens spørgsmål om AI-forordningen. Den hjælper med at afklare mulige krav; den giver ikke en godkendelse. Svarene bevares, mens du skifter mellem AI Act-fanerne, men nulstilles, når du forlader arbejdsområdet eller genindlæser. De gemmes ikke på en sag."
      />

      <Toolbar>
        <span>
          Kildens opdateringsdato: <VersionBadge>{meta.last_update_date || '?'}</VersionBadge>{' '}
          synkroniseret {meta.fetched_at ? new Date(meta.fetched_at).toLocaleString('da-DK') : '—'}
        </span>
        {history.length > 0 && (
          <StepProgress>Trin {history.length + 1}{isEnd ? ' (resultat)' : ''}</StepProgress>
        )}
      </Toolbar>

      {!isEnd && currentLogic && currentContent && (
        <QuestionCard>
          <Eyebrow>{currentQid}</Eyebrow>
          <QuestionTitle>{currentContent.main_title}</QuestionTitle>
          <QuestionText>{currentContent.secondary_title}</QuestionText>

          {currentContent.info && (
            <>
              <InfoToggle type="button" onClick={() => setShowInfo((s) => !s)}>
                {showInfo ? 'Skjul forklaring' : 'Forklaring + AI Act-reference'}
              </InfoToggle>
              {showInfo && <InfoBox>{currentContent.info}</InfoBox>}
            </>
          )}

          {currentContent.sources && (
            <SourceLine>Kilde: {currentContent.sources}</SourceLine>
          )}

          <OptionList>
            {Object.entries(currentContent.answers || {}).map(([idx, ans]) => {
              const i = Number(idx);
              const isChecked = isCheckbox
                ? Array.isArray(answer) && answer.includes(i)
                : answer === i;
              const exclusive = currentLogic.answers?.[idx]?.exclusive;
              return (
                <OptionLabel key={idx} $active={isChecked}>
                  <input
                    type={isCheckbox ? 'checkbox' : 'radio'}
                    name={currentQid}
                    checked={isChecked}
                    onChange={() => {
                      if (isCheckbox) toggleCheckbox(i, exclusive);
                      else setAnswer(i);
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div>{ans.label}</div>
                    {ans.help && <span className="help">{ans.help}</span>}
                  </div>
                </OptionLabel>
              );
            })}
          </OptionList>

          <Controls>
            <PrimaryButton type="button" onClick={handleNext} disabled={
              answer === null || (isCheckbox && (!Array.isArray(answer) || answer.length === 0))
            }>
              Næste →
            </PrimaryButton>
            <SecondaryButton type="button" onClick={goBack} disabled={history.length === 0}>
              ← Tilbage
            </SecondaryButton>
            <SecondaryButton type="button" onClick={reset}>
              Start forfra
            </SecondaryButton>
          </Controls>
        </QuestionCard>
      )}

      {isEnd && (
        <ResultCard>
          <Eyebrow>Resultat</Eyebrow>
          <QuestionTitle>Klassificering færdig</QuestionTitle>
          <p style={{ fontFamily: 'inherit', color: 'inherit', lineHeight: 1.55 }}>
            Du har gennemført alle relevante spørgsmål. Nedenfor ser du de
            obligationer, klassificeringer eller forbud der gælder for dit
            system iht. EU AI Act ifølge EC's logik. Klik <em>Start forfra</em> for at
            klassificere et nyt system.
          </p>

          <FlagList>
            {raisedFlags.length === 0 ? (
              <div style={{ fontStyle: 'italic', opacity: 0.7 }}>
                Ingen obligationer eller risiko-flags rejst — systemet falder uden for AI Act's anvendelsesområde.
              </div>
            ) : (
              raisedFlags.map((f) => {
                const tone = /risk|prohibit|highrisk/i.test(f.name)
                  ? 'risk'
                  : /obligation/i.test(f.name)
                  ? 'obligation'
                  : 'info';
                return (
                  <FlagRow key={f.name} $tone={tone}>
                    <div style={{ flex: 1 }}>
                      <div>{f.label || f.title || f.name}</div>
                      {f.description && (
                        <div style={{ fontSize: '0.84rem', opacity: 0.8, marginTop: '0.2rem' }}>
                          {f.description}
                        </div>
                      )}
                      <div className="name">{f.name}</div>
                    </div>
                  </FlagRow>
                );
              })
            )}
          </FlagList>

          <div style={{ marginTop: '1.5rem' }}>
            <PrimaryButton type="button" onClick={reset}>
              Start forfra
            </PrimaryButton>
          </div>
        </ResultCard>
      )}
    </PageShell>
  );
};

export default EuAiActCheckerPage;
