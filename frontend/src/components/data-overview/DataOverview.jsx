import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import { Link } from 'react-router-dom';
import ComplianceVerdict from '../rules/ComplianceVerdict';

/**
 * S.H.I.E.L.D. — DataOverview
 *
 * Signatur-mønster fra DESIGN.md: hver hovedside får et clean
 * drift-overblik ved bunden af canvas. Tre sektioner:
 *   1. 4-stat grid       (sager / betinget-go / citater / flagget)
 *   2. 2-kol data row    (seneste vurderinger ledger + citat-friskhed)
 *   3. 5-cell status-bar (backend / db / llm / verifier / engine)
 *
 * Komponenten henter sin egen data fra v3-API'erne så den kan
 * dropbares på alle sider uden props-drilling.
 */

// ---- Styled (Northern Modern) ------------------------------------------

const Wrap = styled.section`
  margin-top: 36px;
  padding-top: 28px;
  border-top: 1px solid ${(p) => p.theme.colors.borderSoft};
`;

const Eyebrow = styled.div`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${(p) => p.theme.colors.bronze};
  margin: 0 0 8px;
`;

const Heading = styled.h2`
  font-family: ${(p) => p.theme.fonts.display};
  font-weight: 600;
  font-size: 1.4rem;
  letter-spacing: -0.01em;
  color: ${(p) => p.theme.colors.text};
  margin: 0 0 20px;
`;

// 4-stat grid
const Stats = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  margin-bottom: 20px;

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const Stat = styled.div`
  padding: 18px 20px;
  border-right: 1px solid ${(p) => p.theme.colors.border};

  &:last-child { border-right: none; }

  @media (max-width: 720px) {
    &:nth-child(2n) { border-right: none; }
    &:nth-child(-n+2) { border-bottom: 1px solid ${(p) => p.theme.colors.border}; }
  }

  .label {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: ${(p) => p.theme.colors.textFaded};
    margin-bottom: 8px;
  }
  .value {
    font-family: ${(p) => p.theme.fonts.display};
    font-weight: 700;
    font-size: 2rem;
    letter-spacing: -0.02em;
    color: ${({ $tone, theme }) => {
      if ($tone === 'bronze') return theme.colors.bronze;
      if ($tone === 'success') return theme.colors.success;
      if ($tone === 'danger') return theme.colors.danger;
      return theme.colors.text;
    }};
    line-height: 1;
    margin-bottom: 6px;
  }
  .delta {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.72rem;
    color: ${(p) => p.theme.colors.textMuted};
  }
`;

// 2-kol data row
const DataRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.85fr);
  gap: 20px;
  margin-bottom: 20px;

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.div`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  overflow: hidden;
`;

const PanelHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding: 14px 22px;
  border-bottom: 1px solid ${(p) => p.theme.colors.border};
  background: ${(p) => p.theme.colors.background};

  .title {
    font-family: ${(p) => p.theme.fonts.display};
    font-weight: 600;
    font-size: 0.96rem;
    color: ${(p) => p.theme.colors.text};
  }
  .meta {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    color: ${(p) => p.theme.colors.textMuted};
  }
  a {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${(p) => p.theme.colors.primary};
    text-decoration: none;
    &:hover { text-decoration: underline; }
  }
`;

// Ledger table
const LedgerRow = styled.div`
  display: grid;
  grid-template-columns: 130px minmax(180px, 1fr) minmax(150px, auto) 100px 56px;
  align-items: center;
  padding: 12px 22px;
  border-bottom: 1px solid ${(p) => p.theme.colors.borderSoft};
  font-size: 0.92rem;

  &:last-child { border-bottom: none; }

  &.hdr {
    background: ${(p) => p.theme.colors.background};
    color: ${(p) => p.theme.colors.textFaded};
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 9px 22px;
  }

  .cid {
    font-family: ${(p) => p.theme.fonts.mono};
    color: ${(p) => p.theme.colors.primary};
    font-size: 0.82rem;
  }
  .cname {
    color: ${(p) => p.theme.colors.text};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: 8px;
  }
  .ts {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.78rem;
    color: ${(p) => p.theme.colors.textMuted};
  }
  .who {
    font-size: 0.82rem;
    color: ${(p) => p.theme.colors.textMuted};
  }

  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr) minmax(145px, auto);
    .cid, .ts, .who { display: none; }
    &.hdr { display: none; }
  }
`;

// Citation panel
const CitationRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 12px 18px;
  border-bottom: 1px solid ${(p) => p.theme.colors.borderSoft};
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.76rem;

  &:last-child { border-bottom: none; }

  .left {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    min-width: 0;
  }
  .marker {
    width: 8px; height: 8px;
    border-radius: 0;
    background: ${({ $status, theme }) =>
      $status === 'flagged' ? theme.colors.danger :
      $status === 'verified' ? theme.colors.success :
      theme.colors.textFaded};
    display: inline-block;
  }
  .citation-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 3px;
  }
  .name {
    color: ${(p) => p.theme.colors.text};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .source {
    color: ${(p) => p.theme.colors.textMuted};
    font-size: 0.68rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status-block {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    text-align: right;
  }
  .status-label {
    color: ${({ $status, theme }) =>
      $status === 'flagged' ? theme.colors.danger :
      $status === 'verified' ? theme.colors.success :
      theme.colors.textMuted};
    font-size: 0.7rem;
    font-weight: 600;
  }
  .when {
    color: ${(p) => p.theme.colors.textMuted};
    font-size: 0.68rem;
    white-space: nowrap;
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    gap: 8px;

    .status-block {
      align-items: flex-start;
      flex-direction: row;
      justify-content: space-between;
      padding-left: 17px;
      text-align: left;
    }
  }
`;

// Status-bar (5-cell footer)
const StatusBar = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  overflow: hidden;

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const StatusCell = styled.div`
  padding: 14px 18px;
  border-right: 1px solid ${(p) => p.theme.colors.border};
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.74rem;

  &:last-child { border-right: none; }

  .label {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: ${(p) => p.theme.colors.textFaded};
    margin-bottom: 4px;
  }
  .value {
    color: ${({ $tone, theme }) =>
      $tone === 'ok' ? theme.colors.success :
      $tone === 'warn' ? theme.colors.bronze :
      $tone === 'danger' ? theme.colors.danger :
      theme.colors.text};
    font-weight: 500;
  }

  @media (max-width: 720px) {
    &:nth-child(2n) { border-right: none; }
    &:nth-child(-n+4) { border-bottom: 1px solid ${(p) => p.theme.colors.border}; }
  }
`;

// ---- Helpers -----------------------------------------------------------

const initialsOf = (name) => {
  if (!name) return '—';
  return name.split(/[ @.]/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
};

const formatHHmm = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return 'igår';
  return d.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit' });
};

const truncateName = (s, n = 38) => {
  if (!s) return '';
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
};

const RULE_TITLES = {
  'ai_act.art13.transparens_og_brugerinformation': 'Artikel 13 · Transparens og brugerinformation',
  'ai_act.art14.menneskelig_overvaagning': 'Artikel 14 · Menneskelig overvågning',
  'ai_act.art5.forbudte_praksisser': 'Artikel 5 · Forbudte AI-praksisser',
  'ai_act.art50.transparens': 'Artikel 50 · Oplysningspligt og transparens',
  'ai_act.art6.hojrisiko_klassifikation': 'Artikel 6 · Klassifikation som højrisiko-AI',
  'forvaltningsloven.par19.partshoring': '§ 19 · Partshøring',
  'forvaltningsloven.par22.begrundelsespligt': '§ 22 · Begrundelsespligt',
  'forvaltningsloven.par24.begrundelsens_indhold': '§ 24 · Begrundelsens indhold',
  'forvaltningsloven.par3.inhabilitet': '§ 3 · Inhabilitet',
  'gdpr.art22.automatiseret_individuel_afgorelse': 'Artikel 22 · Automatiserede afgørelser',
  'gdpr.art32.sikkerhed_ved_behandling': 'Artikel 32 · Behandlingssikkerhed',
  'gdpr.art35.dpia_pligt': 'Artikel 35 · Pligt til konsekvensanalyse',
  'gdpr.art5.principper_for_behandling': 'Artikel 5 · Behandlingsprincipper',
  'gdpr.art6.retsgrundlag_for_behandling': 'Artikel 6 · Behandlingsgrundlag',
  'offentlighedsloven.par13.dataudtraek_og_sammenstilling': '§ 13 · Dataudtræk og sammenstilling',
};

const formatRuleName = (ruleId) => {
  if (!ruleId) return 'Ukendt regel';
  if (RULE_TITLES[ruleId]) return RULE_TITLES[ruleId];
  const readable = String(ruleId).replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return readable
    .replace(/\b(gdpr|ai|eu|nis2)\b/gi, (value) => value.toUpperCase())
    .replace(/^./, (value) => value.toUpperCase());
};

const sourceNameOf = (url) => {
  if (!url) return '';
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    if (hostname === 'eur-lex.europa.eu') return 'EUR-Lex';
    if (hostname === 'retsinformation.dk') return 'Retsinformation';
    if (hostname === 'datatilsynet.dk') return 'Datatilsynet';
    return hostname;
  } catch {
    return '';
  }
};

const citationStatusOf = (item) => {
  const isPartialMatch = (item.snippet || '').toLowerCase().includes('delvis match');
  if (item.flagged_for_review || isPartialMatch) {
    return { key: 'flagged', label: 'Kræver juridisk kontrol' };
  }
  if (item.citation_found) {
    return { key: 'verified', label: 'Verificeret' };
  }
  return { key: 'unknown', label: 'Ikke verificeret' };
};

// ---- Component ---------------------------------------------------------

const DataOverview = ({ scope = 'global' }) => {
  const [audit, setAudit] = useState({ items: [], total: 0 });
  const [cases, setCases] = useState({ items: [] });
  const [freshness, setFreshness] = useState({ items: [], counts: { verified: 0, flagged: 0, total: 0 } });
  const [version, setVersion] = useState(null);
  const [llm, setLlm] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [auditRes, casesRes, freshRes, versionRes] = await Promise.allSettled([
          axios.get('/api/v3/audit?limit=5'),
          axios.get('/api/v3/cases?limit=50'),
          axios.get('/api/v3/law/freshness'),
          axios.get('/api/version'),
        ]);

        if (cancelled) return;

        if (auditRes.status === 'fulfilled') setAudit(auditRes.value.data);
        if (casesRes.status === 'fulfilled') setCases(casesRes.value.data);
        if (freshRes.status === 'fulfilled') {
          const items = freshRes.value.data.items || [];
          const verified = items.filter((i) => i.citation_found && !i.flagged_for_review).length;
          const flagged = items.filter((i) => i.flagged_for_review).length;
          setFreshness({ items, counts: { verified, flagged, total: items.length } });
        }
        if (versionRes.status === 'fulfilled') setVersion(versionRes.value.data);
        setLoading(false);

        // Background LLM probe — non-blocking
        try {
          const llmRes = await axios.post('/api/compliance/test-llm', { prompt: 'ok' }, { timeout: 6000 });
          if (!cancelled) setLlm(llmRes.data);
        } catch {
          if (!cancelled) setLlm({ success: false });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive stats
  const inWorkflow = (cases.items || []).filter(
    (c) => !['arkiveret', 'godkendt'].includes(c.status),
  ).length;

  const conditionalOpen = (cases.items || []).filter(
    (c) => c.last_aggregate_status === 'BETINGET-GO' && c.status !== 'arkiveret',
  ).length;

  return (
    <Wrap>
      <Eyebrow>Drift-overblik</Eyebrow>
      <Heading>Aktuel status på tværs af alle sager og regler</Heading>

      {/* 4-stat grid */}
      <Stats>
        <Stat>
          <div className="label">Sager i workflow</div>
          <div className="value">{loading ? '…' : inWorkflow}</div>
          <div className="delta">{cases.items?.length || 0} totalt</div>
        </Stat>
        <Stat $tone="bronze">
          <div className="label">Sager, der kræver handling</div>
          <div className="value">{loading ? '…' : conditionalOpen}</div>
          <div className="delta">åbne opfølgningsspor</div>
        </Stat>
        <Stat $tone="success">
          <div className="label">Lovkilder verificeret</div>
          <div className="value">{loading ? '…' : `${freshness.counts.verified}/${freshness.counts.total}`}</div>
          <div className="delta">seneste kontrol registreret</div>
        </Stat>
        <Stat $tone={freshness.counts.flagged > 0 ? 'danger' : 'success'}>
          <div className="label">Kræver juridisk review</div>
          <div className="value">{loading ? '…' : freshness.counts.flagged}</div>
          <div className="delta">{freshness.counts.flagged > 0 ? 'kræver review' : 'alt verificeret'}</div>
        </Stat>
      </Stats>

      {/* Ledger + citations */}
      <DataRow>
        <Panel>
          <PanelHead>
            <span className="title">Seneste vurderinger</span>
            <Link to="/historik">Se hele historikken →</Link>
          </PanelHead>
          <LedgerRow className="hdr">
            <div>sags-id</div>
            <div>sag</div>
            <div>afgørelse</div>
            <div>vurderet</div>
            <div>af</div>
          </LedgerRow>
          {(audit.items || []).slice(0, 5).map((entry) => (
            <LedgerRow key={entry.id}>
              <div className="cid">{entry.case_id || '—'}</div>
              <div className="cname">{truncateName(entry.note || entry.case_id || 'Ukendt sag')}</div>
              <div><ComplianceVerdict status={entry.aggregate_status} size="sm" /></div>
              <div className="ts">{formatHHmm(entry.created_at)}</div>
              <div className="who">{initialsOf(entry.user_id)}</div>
            </LedgerRow>
          ))}
          {(audit.items || []).length === 0 && !loading && (
            <LedgerRow>
              <div className="cname" style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'inherit', opacity: 0.6 }}>
                Ingen vurderinger endnu — <Link to="/vurdering">start en vurdering</Link>
              </div>
            </LedgerRow>
          )}
        </Panel>

        <Panel>
          <PanelHead>
            <span className="title">Kontrol af lovkilder</span>
            <Link to="/lov-overvaagning">Åbn kildekontrol →</Link>
          </PanelHead>
          {(freshness.items || []).slice(0, 8).map((item) => {
            const citationStatus = citationStatusOf(item);
            const sourceName = sourceNameOf(item.source_url);
            return (
              <CitationRow key={item.rule_id} $status={citationStatus.key}>
                <div className="left">
                  <span className="marker" aria-hidden="true" />
                  <span className="citation-copy">
                    <span className="name" title={item.rule_id}>{formatRuleName(item.rule_id)}</span>
                    {sourceName && <span className="source">{sourceName}</span>}
                  </span>
                </div>
                <span className="status-block">
                  <span className="status-label">{citationStatus.label}</span>
                  <span className="when">
                    {item.last_checked_at ? `Kontrolleret ${formatHHmm(item.last_checked_at)}` : 'Ikke kontrolleret'}
                  </span>
                </span>
              </CitationRow>
            );
          })}
          {(freshness.items || []).length === 0 && !loading && (
            <CitationRow>
              <div className="left"><span className="name" style={{ opacity: 0.6 }}>Ingen friskheds-data endnu</span></div>
            </CitationRow>
          )}
        </Panel>
      </DataRow>

      {/* 5-cell status bar */}
      <StatusBar>
        <StatusCell $tone="ok">
          <div className="label">Backend</div>
          <div className="value">8001 · ok</div>
        </StatusCell>
        <StatusCell $tone="ok">
          <div className="label">Database</div>
          <div className="value">SQLite</div>
        </StatusCell>
        <StatusCell $tone={llm?.success ? 'ok' : 'warn'}>
          <div className="label">LLM</div>
          <div className="value">{llm?.success ? (llm.model || 'aktiv') : 'offline'}</div>
        </StatusCell>
        <StatusCell $tone={freshness.counts.flagged > 0 ? 'warn' : 'ok'}>
          <div className="label">Kildekontrol</div>
          <div className="value">
            {freshness.counts.verified}/{freshness.counts.total} verificeret
            {freshness.counts.flagged > 0 ? ` · ${freshness.counts.flagged} flagget` : ''}
          </div>
        </StatusCell>
        <StatusCell $tone="ok">
          <div className="label">Rule engine</div>
          <div className="value">{version?.version ? `v${version.version}` : '—'}</div>
        </StatusCell>
      </StatusBar>
    </Wrap>
  );
};

export default DataOverview;
