/**
 * Build-time diagnostic modal.
 *
 * Vises på hver page refresh (browser reload), så vi som udviklere lige
 * får et øjeblik til at se config-status før vi navigerer rundt. Klik
 * "OK" lukker den for resten af denne tab-session — fjernes på næste F5.
 *
 * Når S.H.I.E.L.D. går i pilot, fjernes denne komponent (eller den gates på
 * REACT_APP_BUILD_MODE=true).
 */
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 31, 0.55);
  z-index: 5000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 5vh 1rem;
  overflow-y: auto;
  font-family: ${(p) => p.theme.fonts.sans};
`;

const Card = styled.div`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: 8px;
  width: 100%;
  max-width: 720px;
  padding: 1.6rem 1.85rem 1.4rem;
  box-shadow: 0 24px 48px -12px rgba(20, 24, 31, 0.32),
    0 8px 16px -4px rgba(20, 24, 31, 0.16);
  position: relative;
`;

const Eyebrow = styled.div`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: ${(p) => p.theme.colors.bronze || '#b08a4a'};
  font-weight: 700;
  margin-bottom: 0.35rem;
`;

const Title = styled.h2`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: -0.012em;
  line-height: 1.25;
  margin: 0 0 0.45rem;
  color: ${(p) => p.theme.colors.ink};
`;

const Lede = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.95rem;
  color: ${(p) => p.theme.colors.text};
  line-height: 1.55;
  margin: 0 0 1rem;
`;

const PortBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 4px;
  padding: 0.7rem 1rem;
  margin-bottom: 1rem;
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.78rem;
  color: ${(p) => p.theme.colors.inkSoft};
  letter-spacing: 0.04em;

  span b {
    color: ${(p) => p.theme.colors.ink};
    font-weight: 700;
  }
`;

const ItemList = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 1.1rem;
`;

const ItemRow = styled.div`
  display: grid;
  grid-template-columns: 24px 140px 1fr;
  align-items: start;
  gap: 0.7rem;
  padding: 0.55rem 0.85rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.lineSoft};
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.88rem;

  &:last-child { border-bottom: none; }

  .marker {
    font-family: ${(p) => p.theme.fonts.mono};
    font-weight: 700;
    text-align: center;
    color: ${(p) => {
      switch (p.$status) {
        case 'ok': return '#2d6a31';
        case 'warn': return '#b08a4a';
        case 'fail': return '#a02020';
        default: return p.theme.colors.textMuted;
      }
    }};
  }

  .name {
    font-family: ${(p) => p.theme.fonts.sans};
    font-weight: 600;
    color: ${(p) => p.theme.colors.ink};
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    padding-top: 2px;
  }

  .body {
    color: ${(p) => p.theme.colors.text};
  }

  .detail {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.74rem;
    color: ${(p) => p.theme.colors.inkFaded};
    margin-top: 0.2rem;
    word-break: break-word;
  }
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const Hint = styled.div`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.7rem;
  color: ${(p) => p.theme.colors.textMuted};
  letter-spacing: 0.04em;
`;

const OkButton = styled.button`
  background: ${(p) => p.theme.colors.primary};
  color: white;
  border: none;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 0.55rem 1.4rem;
  border-radius: 4px;
  cursor: pointer;

  &:hover { background: ${(p) => p.theme.colors.primaryDark}; }
`;

const STATUS_MARK = {
  ok: '✓',
  warn: '⚠',
  fail: '✗',
  info: 'ℹ',
};

const BuildTimeConfigCheck = () => {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get('/api/v3/admin/config', { timeout: 6000 });
        if (cancelled) return;
        setReport(r.data);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Kunne ikke hente config');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ESC eller Enter dismiss'er
  useEffect(() => {
    if (dismissed) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setDismissed(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dismissed]);

  if (dismissed) return null;
  if (loading) {
    return (
      <Overlay>
        <Card>
          <Eyebrow>Build mode · diagnostic</Eyebrow>
          <Title>Tjekker konfiguration…</Title>
          <Lede>Henter <code>/api/v3/admin/config</code></Lede>
        </Card>
      </Overlay>
    );
  }

  if (error || !report) {
    return (
      <Overlay onClick={() => setDismissed(true)}>
        <Card onClick={(e) => e.stopPropagation()}>
          <Eyebrow>Build mode · diagnostic</Eyebrow>
          <Title>Backend ikke nåbar</Title>
          <Lede>Config-endpoint fejlede: <code>{error || 'ukendt fejl'}</code></Lede>
          <Footer>
            <Hint>Backend kører måske ikke endnu</Hint>
            <OkButton onClick={() => setDismissed(true)}>Forsæt alligevel</OkButton>
          </Footer>
        </Card>
      </Overlay>
    );
  }

  const okCount = report.items.filter((i) => i.status === 'ok').length;
  const warnCount = report.items.filter((i) => i.status === 'warn').length;
  const failCount = report.items.filter((i) => i.status === 'fail').length;

  // Vi henter frontend-port fra browseren og backend-port fra report
  const frontendPort = typeof window !== 'undefined' ? window.location.port : '?';

  return (
    <Overlay onClick={() => setDismissed(true)}>
      <Card onClick={(e) => e.stopPropagation()}>
        <Eyebrow>Build mode · diagnostic</Eyebrow>
        <Title>S.H.I.E.L.D. · konfigurations-check</Title>
        <Lede>
          {failCount > 0 ? '✗ Kritiske fejl ' : warnCount > 0 ? '⚠ Status med advarsler' : '✓ Alt grønt'}
          {' — '}
          {okCount} ok · {warnCount} advarsler{failCount ? ` · ${failCount} fejl` : ''}.
          Trykker du OK fortsætter du til appen; modal vises igen ved næste browser-refresh.
        </Lede>

        <PortBar>
          <span>Backend: <b>{report.api_host}:{report.api_port}</b></span>
          <span>Frontend: <b>{window.location.host}</b></span>
          <span>Reload-mode: <b>{report.api_reload ? 'on (dev)' : 'off (prod)'}</b></span>
        </PortBar>

        <ItemList>
          {report.items.map((it) => (
            <ItemRow key={it.name} $status={it.status}>
              <span className="marker">{STATUS_MARK[it.status] || '·'}</span>
              <span className="name">{it.name}</span>
              <div>
                <div className="body">{it.summary}</div>
                {it.detail && <div className="detail">{it.detail}</div>}
              </div>
            </ItemRow>
          ))}
        </ItemList>

        <Footer>
          <Hint>Esc / Enter / klik udenfor lukker også</Hint>
          <OkButton onClick={() => setDismissed(true)} autoFocus>OK — fortsæt</OkButton>
        </Footer>
      </Card>
    </Overlay>
  );
};

export default BuildTimeConfigCheck;
