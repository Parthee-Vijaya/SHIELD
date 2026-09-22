import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { pageLayout, pageTitleStyle, sectionTitleStyle } from '../theme/layout';
import { useQuery } from 'react-query';
import axios from 'axios';
import { modelLabel } from '../utils/modelPresentation';

// ---- Layout primitives ----------------------------------------------------

const Page = styled.div`
  ${pageLayout}
`;

const Eyebrow = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: ${(p) => p.theme.colors.inkFaded};
  margin-bottom: 0.5rem;
  font-weight: 600;
`;

const Title = styled.h1`
  ${pageTitleStyle}
`;

const Lede = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  margin: 0 0 2.25rem;
  color: ${(p) => p.theme.colors.inkSoft};
  font-size: 1.05rem;
  line-height: 1.6;
  max-width: 720px;
`;

const Meta = styled.div`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.74rem;
  color: ${(p) => p.theme.colors.inkFaded};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 1.5rem;
  display: flex;
  gap: 1.25rem;
  align-items: center;
  flex-wrap: wrap;
`;

const StatusDot = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 0.45rem;
  background: ${(p) => {
    if (p.$status === 'operational') return '#2d6a31';
    if (p.$status === 'degraded') return '#b08a4a';
    if (p.$status === 'down' || p.$status === 'stopped') return '#a02020';
    return '#888';
  }};
`;

const SectionH = styled.h2`
  ${sectionTitleStyle}
  margin: 2.5rem 0 1rem;
`;

// ---- Card grids -----------------------------------------------------------

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
`;

const StatCard = styled.div`
  background: ${(p) => p.theme.colors.card};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 6px;
  padding: 1rem 1.2rem;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: ${(p) => {
      if (p.$tone === 'success') return '#2d6a31';
      if (p.$tone === 'warn') return '#b08a4a';
      if (p.$tone === 'danger') return '#a02020';
      return p.theme.colors.bronze;
    }};
    opacity: 0.5;
  }

  .label {
    font-family: ${(p) => p.theme.fonts.sans};
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: ${(p) => p.theme.colors.inkFaded};
    margin-bottom: 0.5rem;
    font-weight: 600;
  }

  .value {
    font-family: ${(p) => p.theme.fonts.display};
    font-size: 1.75rem;
    font-weight: 700;
    color: ${(p) => p.theme.colors.ink};
    line-height: 1.1;
    letter-spacing: -0.012em;
  }

  .delta {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.74rem;
    color: ${(p) => p.theme.colors.inkSoft};
    margin-top: 0.45rem;
  }
`;

// ---- Service health table -------------------------------------------------

const ServicesTable = styled.div`
  background: ${(p) => p.theme.colors.card};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 6px;
  overflow: hidden;
`;

const ServiceRow = styled.div`
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  padding: 0.7rem 1.2rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.lineSoft};
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.92rem;

  &:last-child { border-bottom: none; }

  .name { color: ${(p) => p.theme.colors.ink}; }
  .status {
    color: ${(p) => p.theme.colors.inkSoft};
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.84rem;
    text-align: right;
  }
`;

// ---- Scheduler jobs -------------------------------------------------------

const JobRow = styled.div`
  display: grid;
  grid-template-columns: 1.5fr 1.4fr 1.4fr 0.6fr;
  gap: 1rem;
  padding: 0.65rem 1.2rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.lineSoft};
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.92rem;

  &:last-child { border-bottom: none; }
  &.head {
    background: ${(p) => p.theme.colors.paperSoft};
    font-family: ${(p) => p.theme.fonts.sans};
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: ${(p) => p.theme.colors.inkFaded};
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }

  .mono {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.78rem;
    color: ${(p) => p.theme.colors.inkSoft};
  }
  .right { text-align: right; }
`;

// ---- Errors ---------------------------------------------------------------

const ErrorRow = styled.div`
  border: 1px solid ${(p) => p.theme.colors.line};
  border-left: 3px solid #a02020;
  border-radius: 4px;
  padding: 0.7rem 1rem;
  margin-bottom: 0.6rem;
  background: ${(p) => p.theme.colors.card};

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.35rem;
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.74rem;
    color: ${(p) => p.theme.colors.inkFaded};
  }
  .class {
    font-weight: 700;
    color: #a02020;
    margin-right: 0.5rem;
  }
  .endpoint {
    color: ${(p) => p.theme.colors.inkSoft};
  }
  .message {
    font-family: ${(p) => p.theme.fonts.body};
    color: ${(p) => p.theme.colors.ink};
    margin: 0.2rem 0;
  }
  .stack {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.72rem;
    color: ${(p) => p.theme.colors.inkFaded};
    background: ${(p) => p.theme.colors.paperSoft};
    padding: 0.5rem;
    border-radius: 3px;
    overflow-x: auto;
    white-space: pre;
    max-height: 180px;
    overflow-y: auto;
  }
`;

const Empty = styled.div`
  padding: 1.2rem;
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.95rem;
  color: ${(p) => p.theme.colors.inkSoft};
  font-style: italic;
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px dashed ${(p) => p.theme.colors.line};
  border-radius: 4px;
`;

// ---- Helpers --------------------------------------------------------------

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
};

const formatRelative = (iso) => {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return iso;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return `${seconds}s siden`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m siden`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}t siden`;
  return `${Math.round(seconds / 86400)}d siden`;
};

const formatNextRun = (iso) => {
  if (!iso) return '—';
  const t = new Date(iso);
  if (isNaN(t.getTime())) return iso;
  return t.toLocaleTimeString('da-DK', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
  });
};

// ---- Page -----------------------------------------------------------------

const DriftPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: health, isFetching: healthLoading, isError: healthError } = useQuery(
    ['ops-health', refreshKey],
    () => axios.get('/health').then((r) => r.data),
    { refetchInterval: 30_000, staleTime: 25_000 },
  );

  const { data: ops, isFetching: opsLoading, isError: opsError } = useQuery(
    ['ops-summary', refreshKey],
    () => axios.get('/api/v3/admin/ops-summary').then((r) => r.data),
    { refetchInterval: 30_000, staleTime: 25_000 },
  );

  const { data: errorsResp, isError: errorsError } = useQuery(
    ['ops-errors', refreshKey],
    () => axios.get('/api/v3/admin/errors?limit=10').then((r) => r.data),
    { refetchInterval: 30_000, staleTime: 25_000 },
  );

  const errors = errorsResp?.errors || [];

  const overall = health?.status || 'unknown';
  const overallTone =
    overall === 'healthy' ? 'success' : overall === 'degraded' ? 'warn' : 'danger';

  const services = useMemo(() => {
    if (!health?.services) return [];
    return Object.entries(health.services).map(([name, status]) => ({ name, status }));
  }, [health]);

  return (
    <Page>
      <Eyebrow>S.H.I.E.L.D. · drift</Eyebrow>
      <Title>Driftsstatus</Title>
      <Lede>
        Status på tværs af services, planlagte jobs og seneste fejl. Opdateres automatisk
        hvert 30. sekund. Bruges til hurtig morgentjek — tjek banneret nedenfor og
        scheduler-tabellen for at se om nattens jobs kørte som de skulle.
      </Lede>

      <Meta>
        <span><StatusDot $status={overall === 'healthy' ? 'operational' : overall} />Overall: <b>{overall}</b></span>
        {ops?.generated_at && <span>Opdateret: {formatRelative(ops.generated_at)}</span>}
        {(healthLoading || opsLoading) && <span>· henter…</span>}
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          style={{
            border: '1px solid currentColor',
            background: 'transparent',
            color: 'inherit',
            padding: '0.25rem 0.7rem',
            borderRadius: 3,
            fontFamily: 'inherit',
            fontSize: 'inherit',
            cursor: 'pointer',
            letterSpacing: 'inherit',
            textTransform: 'inherit',
          }}
        >
          Opdatér nu
        </button>
      </Meta>

      {(healthError || opsError || errorsError) && <p role="alert">Driftsoplysningerne kunne ikke hentes fuldt. Kontrollér forbindelsen og din adgang. Manglende oplysninger er ikke en bekræftelse på fejlfri drift.</p>}
      <Grid>
        <StatCard $tone={overallTone}>
          <div className="label">Sager (24h / total)</div>
          <div className="value">
            {ops?.cases_24h ?? '—'} / {ops?.cases_total ?? '—'}
          </div>
          <div className="delta">nye sager seneste døgn</div>
        </StatCard>
        <StatCard $tone="success">
          <div className="label">Vurderinger (24h)</div>
          <div className="value">{ops?.assessments_24h ?? '—'}</div>
          <div className="delta">{ops?.assessments_total ?? '—'} i alt</div>
        </StatCard>
        <StatCard $tone={ops?.freshness?.flagged > 0 ? 'warn' : 'success'}>
          <div className="label">Citat-friskhed</div>
          <div className="value">
            {ops?.freshness?.ok ?? '—'} / {ops?.freshness?.total ?? '—'}
          </div>
          <div className="delta">
            {ops?.freshness?.flagged ?? '—'} flagget · sidst {formatRelative(ops?.freshness?.last_checked_at)}
          </div>
        </StatCard>
        <StatCard $tone={ops?.errors?.last_24h_count > 0 ? 'danger' : 'success'}>
          <div className="label">Fejl seneste 24h</div>
          <div className="value">{ops?.errors?.last_24h_count ?? '—'}</div>
          <div className="delta">{ops?.errors?.buffer_size ?? '—'} i alt i bufferen</div>
        </StatCard>
        <StatCard>
          <div className="label">Disk: data-mappe</div>
          <div className="value">{formatBytes(ops?.disk?.data_size_bytes)}</div>
          <div className="delta">{ops?.disk?.data_dir?.split('/').slice(-2).join('/') || '—'}</div>
        </StatCard>
        <StatCard>
          <div className="label">Disk: log-mappe</div>
          <div className="value">{formatBytes(ops?.disk?.log_size_bytes)}</div>
          <div className="delta">{ops?.disk?.log_dir?.split('/').slice(-2).join('/') || '—'}</div>
        </StatCard>
        <StatCard $tone={ops?.backups?.latest ? 'success' : 'warn'}>
          <div className="label">Seneste backup</div>
          <div className="value">
            {ops?.backups?.latest
              ? formatRelative(ops.backups.latest.timestamp)
              : ops ? 'Ingen registreret' : 'Ikke tilgængelig'}
          </div>
          <div className="delta">
            {ops?.backups?.latest
              ? `${ops.backups.latest.kind} · ${formatBytes(ops.backups.latest.size_bytes)}`
              : 'pg_dump-job kører kl. 01:30'}
          </div>
        </StatCard>
        <StatCard>
          <div className="label">Backups gemt</div>
          <div className="value">
            {(ops?.backups?.by_kind?.daily ?? 0)
              + (ops?.backups?.by_kind?.weekly ?? 0)
              + (ops?.backups?.by_kind?.monthly ?? 0)
              + (ops?.backups?.by_kind?.manual ?? 0)}
          </div>
          <div className="delta">
            {ops?.backups?.by_kind
              ? `${ops.backups.by_kind.daily ?? 0}d · ${ops.backups.by_kind.weekly ?? 0}u · ${ops.backups.by_kind.monthly ?? 0}m`
              : '—'}
            {ops?.backups?.rsync_target ? ' · off-site ✓' : ' · lokalt'}
          </div>
        </StatCard>
      </Grid>

      {health?.ai?.model && <section aria-label="AI-forbindelse">
        <SectionH>AI-forbindelse</SectionH>
        <p><strong>{modelLabel(health.ai.model)}</strong>{health.ai.connection === 'local_temporary' ? ' · midlertidig lokal AI-forbindelse' : ''}</p>
        <p>{health.ai.status === 'configured' ? 'Aktiveret; modelkald kontrolleres ved brug. Denne status er ikke en gennemført svartest.' : 'Forbindelsens status skal kontrolleres. En registreret model er ikke i sig selv en gennemført svartest.'}</p>
      </section>}
      <SectionH>Services</SectionH>
      <ServicesTable>
        {services.map((s) => (
          <ServiceRow key={s.name}>
            <span className="name">{s.name}</span>
            <span className="status">
              <StatusDot $status={s.status.split(':')[0]} />
              {s.status}
            </span>
          </ServiceRow>
        ))}
        {services.length === 0 && (
          <ServiceRow>
            <span className="name">Henter…</span>
            <span className="status">—</span>
          </ServiceRow>
        )}
      </ServicesTable>

      <SectionH>Planlagte jobs</SectionH>
      <ServicesTable>
        <JobRow className="head">
          <div>Job</div>
          <div>Sidste kørsel</div>
          <div>Næste kørsel</div>
          <div className="right">Tid (s)</div>
        </JobRow>
        {ops?.scheduler_jobs &&
          Object.entries(ops.scheduler_jobs).map(([id, job]) => (
            <JobRow key={id}>
              <div>
                {job.name}
                <div className="mono">{id}</div>
              </div>
              <div className="mono">{formatRelative(job.last_run_ts)}</div>
              <div className="mono">{formatNextRun(job.next_run)}</div>
              <div className="mono right">
                {job.last_duration_seconds ? job.last_duration_seconds.toFixed(2) : '—'}
              </div>
            </JobRow>
          ))}
      </ServicesTable>

      <SectionH>Seneste fejl</SectionH>
      {errorsError || !errorsResp ? (
        <Empty>Fejlloggen er ikke tilgængelig.</Empty>
      ) : errors.length === 0 ? (
        <Empty>Ingen fejl er registreret i den hentede log.</Empty>
      ) : (
        errors.map((e, idx) => (
          <ErrorRow key={idx}>
            <div className="head">
              <span>
                <span className="class">{e.error_class}</span>
                <span className="endpoint">{e.endpoint || '—'}</span>
              </span>
              <span>{formatRelative(e.occurred_at)} · {e.request_id || ''}</span>
            </div>
            <div className="message">{e.message}</div>
            {e.stack && <pre className="stack">{e.stack}</pre>}
          </ErrorRow>
        ))
      )}
    </Page>
  );
};

export default DriftPage;
