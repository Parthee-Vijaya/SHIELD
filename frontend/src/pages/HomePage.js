import { pageLayout, pageTitleStyle } from '../theme/layout';
import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from 'react-query';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext';
import { useTutorial } from '../contexts/TutorialContext';
import WorkspaceSearch from '../components/workspace-search/WorkspaceSearch';
import { Button, SecondaryButton, Eyebrow, StatePanel, ErrorPanel } from '../components/workflow/WorkflowUi';
import { calendarDate, dayKey, todayDayKeyCopenhagen, formatAssessmentDate } from '../features/overview/reviewDates';

const PAGE_SIZE = 5;
const Page = styled.div`
  ${pageLayout}
  color: ${p => p.theme.colors.text};
  h1, h2, h3, p { overflow-wrap: anywhere; }
  h1 { ${pageTitleStyle} margin: 0; }
  h2 { margin: 0; font-size: 1.5rem; font-weight: 620; letter-spacing: -.03em; }
  h3 { margin: 9px 0 7px; font-size: 1rem; line-height: 1.42; font-weight: 620; }
  a, button, input, select { &:focus-visible { outline: 3px solid ${p => p.theme.colors.primary}; outline-offset: 3px; } }
  .material-intro { border: 1px solid ${p => p.theme.colors.border}; padding: 28px; background: ${p => p.theme.colors.surface}; }
  .material-intro h2 { font-size: 1.15rem; line-height: 1.4; }
  .material-intro p { margin: 12px 0 20px; font-size: .84rem; line-height: 1.6; }
  .material-intro li { display: grid; grid-template-columns: 48px minmax(0,1fr); gap: 12px; padding: 14px 0; border-top: 1px solid ${p => p.theme.colors.border}; font-size: .82rem; line-height: 1.5; }
  .material-intro li:last-child { padding-bottom: 0; }
  .material-intro small { display: block; margin-top: 4px; color: ${p => p.theme.colors.textMuted}; font-size: .73rem; line-height: 1.5; }
  .file-type { font: 600 .66rem ${p => p.theme.fonts.mono}; padding-top: 4px; color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark}; }
  .workflow-steps { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 26px; margin: 42px 0 24px; padding: 24px 0; border-block: 1px solid ${p => p.theme.colors.border}; }
  .workflow-steps > li { padding-right: 24px; border-right: 1px solid ${p => p.theme.colors.border}; min-width: 0; }
  .workflow-steps > li:last-child { padding-right: 0; border-right: 0; }
  .workflow-steps .step-number { font: 500 .8rem ${p => p.theme.fonts.mono}; color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark}; }
  .workflow-steps h3 { margin: 14px 0 9px; font-size: .92rem; }
  .workflow-steps p { margin: 0; color: ${p => p.theme.colors.textMuted}; font-size: .8rem; line-height: 1.65; }
  .responsibility { margin: 0 0 48px; max-width: 960px; color: ${p => p.theme.colors.textMuted}; font-size: .8rem; line-height: 1.7; }
  .responsibility strong { color: ${p => p.theme.colors.text}; }
  .work-intro { padding: 26px 0 18px; border-top: 1px solid ${p => p.theme.colors.border}; }
  .work-intro .subtext { margin-bottom: 0; }

  .home-actions { display: flex; flex-wrap: wrap; gap: 10px; flex-shrink: 0; }
  .home-actions a { display: inline-flex; align-items: center; justify-content: center; gap: 16px; text-decoration: none; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid ${p => p.theme.colors.border}; }
  .toolbar label { display: flex; align-items: center; gap: 10px; font-size: .8rem; font-weight: 600; }
  select { min-height: 42px; max-width: 100%; padding: 8px 34px 8px 12px; border: 1px solid ${p => p.theme.colors.border}; background: ${p => p.theme.colors.surface}; color: inherit; font: inherit; }
  .toolbar small { color: ${p => p.theme.colors.textMuted}; font-size: .75rem; }
  .stats { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); margin: 0 0 32px; border-block: 1px solid ${p => p.theme.colors.border}; }
  .stats > div { padding: 22px 24px; border-right: 1px solid ${p => p.theme.colors.border}; }
  .stats > div:first-child { padding-left: 0; } .stats > div:last-child { border-right: 0; }
  .stats dt { color: ${p => p.theme.colors.textMuted}; font-size: .78rem; }
  .stats dd { margin: 10px 0 7px; font-size: 2.2rem; font-weight: 600; line-height: 1; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
  .stats small { display: block; color: ${p => p.theme.colors.textMuted}; line-height: 1.4; font-size: .7rem; }
  .columns { display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 40px; }
  section { min-width: 0; scroll-margin-top: 100px; }
  .section-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
  .section-head a { font-size: .8rem; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  .subtext { margin: 8px 0 18px; color: ${p => p.theme.colors.textMuted}; font-size: .82rem; line-height: 1.55; }
  .queue-controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin: 20px 0 8px; }
  .queue-controls > div { display: flex; gap: 4px; flex-wrap: wrap; }
  .queue-controls button { min-height: 44px; padding: 8px 11px; border: 1px solid transparent; background: transparent; color: ${p => p.theme.colors.textMuted}; font: 600 .78rem ${p => p.theme.fonts.body}; cursor: pointer; }
  .queue-controls button[aria-pressed=true] { border-color: ${p => p.theme.colors.primary}; background: ${p => p.theme.colors.primarySoft}; color: ${p => p.theme.colors.primaryDark}; }
  ul, ol { list-style: none; margin: 0; padding: 0; }
  .case-row { display: grid; grid-template-columns: minmax(0,1fr) 24px; gap: 16px; padding: 19px 0; border-bottom: 1px solid ${p => p.theme.colors.border}; color: inherit; text-decoration: none; }
  .case-row:hover h3, .recent-row:hover strong { color: ${p => p.theme.colors.primaryDark}; text-decoration: underline; text-underline-offset: 3px; }
  .case-row p { margin: 7px 0 0; font-size: .8rem; line-height: 1.55; color: ${p => p.theme.colors.textMuted}; }
  .arrow { align-self: center; color: ${p => p.theme.colors.primary}; font-size: 1.25rem; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; color: ${p => p.theme.colors.textMuted}; font-size: .7rem; overflow-wrap: anywhere; }
  .case-row .meta:last-child { margin-top: 8px; }
  .tag { display: inline-block; padding: 4px 7px; background: ${p => p.theme.colors.surfaceAlt}; color: ${p => p.theme.colors.textMuted}; font-size: .68rem; line-height: 1.4; font-weight: 650; }
  .tag[data-tone=danger] { background: ${p => p.theme.colors.dangerSoft}; color: ${p => p.theme.colors.danger}; }
  .tag[data-tone=warning] { background: ${p => p.theme.colors.warningSoft}; color: ${p => p.theme.colors.warning}; }
  .pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; }
  .pager span { color: ${p => p.theme.colors.textMuted}; font-size: .75rem; } .pager > div { display: flex; gap: 8px; }
  .pager button { font-size: .75rem; min-height: 44px; padding: 8px 12px; }
  .columns > aside { min-width: 0; border-left: 1px solid ${p => p.theme.colors.border}; padding-left: 28px; }
  .columns > aside h2 { font-size: 1.25rem; }
  .review { display: grid; grid-template-columns: 48px minmax(0,1fr); gap: 14px; padding: 17px 0; border-bottom: 1px solid ${p => p.theme.colors.border}; text-decoration: none; color: inherit; }
  .review time { display: block; text-align: center; font-size: .68rem; color: ${p => p.theme.colors.textMuted}; }
  .review time b { display: block; font-size: 1.5rem; line-height: 1; margin-bottom: 5px; font-weight: 580; color: ${p => p.theme.colors.text}; }
  .review strong { display: block; font-size: .83rem; line-height: 1.45; overflow-wrap: anywhere; }
  .review small { display: block; margin-top: 6px; color: ${p => p.theme.colors.textMuted}; font-size: .7rem; }
  .review[data-overdue=true] small, .review[data-overdue=true] b { color: ${p => p.theme.colors.danger}; }
  .review:hover strong { text-decoration: underline; text-underline-offset: 3px; }
  .help { margin-top: 30px; padding: 22px; background: ${p => p.theme.colors.primarySoft}; }
  .help h3 { margin: 0; } .help p { font-size: .8rem; line-height: 1.55; color: ${p => p.theme.colors.textMuted}; } .help button { width: 100%; }
  .shortcuts { margin-top: 24px; } .shortcuts a { display: flex; justify-content: space-between; gap: 12px; padding: 13px 0; border-bottom: 1px solid ${p => p.theme.colors.border}; font-size: .8rem; font-weight: 600; }
  .recent { margin-top: 36px; padding-top: 28px; border-top: 1px solid ${p => p.theme.colors.border}; }
  .recent-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 12px; align-items: center; padding: 16px 0; border-bottom: 1px solid ${p => p.theme.colors.border}; color: inherit; text-decoration: none; }
  .recent-row strong { display: block; font-weight: 610; font-size: .9rem; line-height: 1.45; overflow-wrap: anywhere; }
  .recent-row small { display: block; margin-top: 6px; font-size: .72rem; color: ${p => p.theme.colors.textMuted}; line-height: 1.5; }
  .home-eyebrow, .section-head a, .shortcuts a, .arrow,
  .case-row:hover h3, .recent-row:hover strong,
  .queue-controls button[aria-pressed=true] {
    color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark};
  }
  @media (max-width: 980px) { .columns { grid-template-columns: minmax(0,1fr) 280px; gap: 24px; } .columns > aside { padding-left: 20px; } .home-header { gap: 28px; } .material-intro { padding: 22px; } }
  @media (max-width: 900px) { .home-header { grid-template-columns: 1fr; gap: 28px; } .workflow-steps { grid-template-columns: repeat(2,minmax(0,1fr)); } .workflow-steps > li:nth-child(2) { border-right: 0; padding-right: 0; } }
  @media (max-width: 760px) { .columns { grid-template-columns: 1fr; gap: 30px; } .columns > aside { padding: 26px 0 0; border-left: 0; border-top: 1px solid ${p => p.theme.colors.border}; } }
  @media (max-width: 640px) { padding: 28px 16px 48px; }
  @media (max-width: 600px) { .stats { grid-template-columns: repeat(2,minmax(0,1fr)); } .stats > div { padding: 18px 12px; } .stats > div:nth-child(2) { border-right: 0; } .stats > div:nth-child(3) { padding-left: 0; } .stats > div:nth-child(-n+2) { border-bottom: 1px solid ${p => p.theme.colors.border}; } }
  @media (max-width: 480px) { .queue-controls input { width: 100%; } .workflow-steps { grid-template-columns: 1fr; gap: 20px; margin-top: 30px; } .workflow-steps > li { border-right: 0; padding-right: 0; } .workflow-steps h3 { margin-top: 8px; } .material-intro { padding: 20px; } }
  .home-welcome { display: flex; align-items: center; justify-content: space-between; gap: 28px; padding: 0 0 28px; }
  .home-welcome h1 { margin-top: 12px; font-size: clamp(2rem,3.5vw,2.75rem); line-height: 1.15; }
  .home-welcome p { margin: 12px 0 0; max-width: 700px; color: ${p => p.theme.colors.textMuted}; font-size: .94rem; line-height: 1.65; }
  .home-welcome > a { flex-shrink: 0; display: inline-flex; align-items: center; gap: 24px; text-decoration: none; }
  .home-search { margin-bottom: 22px; }
  .home-start-guide { margin-bottom: 26px; border-bottom: 1px solid ${p => p.theme.colors.border}; padding-bottom: 18px; }
  .home-start-guide > summary { cursor: pointer; font-weight: 600; font-size: .85rem; line-height: 1.6; }
  .home-start-guide > summary span { margin-left: 16px; color: ${p => p.theme.colors.textMuted}; font-weight: 400; font-size: .77rem; }
  .home-start-guide .workflow-steps { margin: 18px 0; padding: 20px 0; }
  .home-start-guide .responsibility { margin-bottom: 22px; }
  .home-start-guide .material-intro { margin-bottom: 4px; }
  .home-start-guide .material-intro ul { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 24px; }
  .work-intro { border-top: 0; padding-top: 0; }
  @media(max-width: 760px) { .home-welcome { align-items: flex-start; flex-direction: column; gap: 18px; } .home-start-guide .material-intro ul { grid-template-columns: 1fr; gap: 0; } }
  @media(max-width: 640px) { padding: 28px 20px 48px; .home-start-guide > summary span { display: block; margin-left: 18px; } }
  @media(max-width: 380px) { padding-inline: 14px; }

`;
const casePath = (item, tab = item.attention?.tab || 'overview', scope = 'all') => `/sager/${encodeURIComponent(item.id)}?tab=${encodeURIComponent(tab)}${scope === 'examples' ? '&from=examples' : ''}`;

export default function HomePage() {
  const { ready, isAuthenticated, user, authFetch, login } = useAuth();
  const tutorial = useTutorial();
  const [params, setParams] = useSearchParams();
  const scope = ['all','work','examples'].includes(params.get('scope')) ? params.get('scope') : 'work';
  const [queueFilter, setQueueFilter] = useState('attention');
  const [page, setPage] = useState(0);
  const query = useQuery(['case-overview',user?.oid || user?.id,scope], async ({ signal }) => {
    const response = await authFetch(`/api/v3/cases/overview?scope=${scope}&limit=500`, { signal });
    if (!response.ok) throw new Error('Sagsoversigten kunne ikke hentes.');
    const payload = await response.json();
    if (!Array.isArray(payload.items) || !payload.stats) throw new Error('Sagsoversigten kunne ikke læses.');
    return payload;
  }, { enabled: Boolean(ready && isAuthenticated), staleTime: 0, retry: 1 });
  const data = query.data;
  const active = (data?.items || []).filter(item=>item.status !== 'arkiveret');
  const attention = active.filter(item=>['requires_action','awaiting_approval','review_due','draft','ready_for_approval'].includes(item.attention?.kind));
  const selected = (queueFilter==='attention' ? attention : active).slice().sort((a,b)=>(a.attention?.priority ?? 99)-(b.attention?.priority ?? 99) || String(b.updated_at).localeCompare(String(a.updated_at)));
  const pages = Math.max(1,Math.ceil(selected.length/PAGE_SIZE));
  const currentPage = Math.min(page,pages-1);
  const today = todayDayKeyCopenhagen();
  const reviews = active.map(item=>({...item,reviewDate:calendarDate(item.next_review_at)})).filter(item=>item.reviewDate).sort((a,b)=>a.reviewDate-b.reviewDate).slice(0,3);
  const recent = Array.isArray(data?.latest_assessments) ? data.latest_assessments.slice(0,4) : [];
  const resetBrowse = () => setPage(0);
  const changeScope = value => { const next = new URLSearchParams(params); if(value==='work') next.delete('scope'); else next.set('scope',value); setParams(next); resetBrowse(); };
  const movePage = value => { setPage(value); document.getElementById('home-queue-title')?.focus({preventScroll:true}); document.getElementById('home-queue')?.scrollIntoView?.({block:'start',behavior:'instant'}); };

  return <Page>
    <header className="home-welcome">
      <div><Eyebrow className="home-eyebrow">Dit arbejdsrum</Eyebrow>
        <h1>{user?.name ? `Goddag, ${user.name.trim().split(/\s+/)[0]}` : 'Overblik over jeres AI-løsninger'}</h1>
        <p>Find grundlaget, afklar det åbne, og følg jeres AI-løsninger frem mod en faglig beslutning.</p>
      </div>
      <Button as={Link} to="/anskaffelse">Opret AI-løsning <span aria-hidden="true">→</span></Button>
    </header>
    <section className="home-search" aria-label="Søg i arbejdsrummet"><WorkspaceSearch /></section>
    <details className="home-start-guide" id="saadan-arbejder-i">
      <summary>Sådan arbejder I med en AI-løsning <span>Fra materiale til faglig beslutning</span></summary>
      <section aria-label="Sådan vurderer I en AI-løsning">
        <ol className="workflow-steps">
          <li><span className="step-number" aria-hidden="true">01</span><h3>Opret AI-løsningen</h3><p>Angiv leverandør, fagområde og den opgave, AI-funktionen skal understøtte.</p></li>
          <li><span className="step-number" aria-hidden="true">02</span><h3>Saml materialet</h3><p>Tilføj præsentationer, aftaler og links som dokumenteret grundlag på sagen.</p></li>
          <li><span className="step-number" aria-hidden="true">03</span><h3>Gennemgå oplysningerne</h3><p>Afklar AI-udtræk, manglende oplysninger og de fund, JEV markerer til kontrol.</p></li>
          <li><span className="step-number" aria-hidden="true">04</span><h3>Forbered dialogen med jura</h3><p>Gennemgå risiko- og konsekvensanalysen, følg kilderne og hent Word og Excel.</p></li>
        </ol>
        <p className="responsibility"><strong>AI hjælper med udkastet. I træffer beslutningen.</strong> JEV vurderer tekstens støtte i kilderne og markerer tvivl. Den faglige og juridiske vurdering skal gennemgås af kommunen.</p>
      </section>
      <section className="material-intro" aria-labelledby="home-material-title">
        <h2 id="home-material-title">Start med det, I allerede har</h2>
        <p>Tilføj materiale til sagen, og byg grundlaget op, efterhånden som oplysningerne kommer fra leverandøren.</p>
        <ul>
          <li><span className="file-type" aria-hidden="true">PPTX</span><div>Præsentation af AI-løsningen<small>AI-funktioner, brugere og den kommunale opgave</small></div></li>
          <li><span className="file-type" aria-hidden="true">AFTALE</span><div>Databehandleraftale og bilag<small>Behandling, underdatabehandlere og sikkerhed</small></div></li>
          <li><span className="file-type" aria-hidden="true">LINK</span><div>Leverandørens hjemmeside<small>Produktbeskrivelse og offentlig dokumentation</small></div></li>
        </ul>
      </section>
    </details>
    {!ready ? <StatePanel role="status">Kontrollerer adgang…</StatePanel> : !isAuthenticated ? <StatePanel><strong>Log ind for at se dine sager</strong><p>Her får du overblik over vurderinger, opgaver og dokumentation.</p><Button onClick={login}>Log ind med Microsoft</Button></StatePanel> : <>
      <section className="work-intro" aria-labelledby="home-work-title"><div className="section-head"><h2 id="home-work-title">Jeres sager</h2><Link to={scope==='examples' ? '/sager?examples=1' : '/sager'}>Åbn sagsoversigten →</Link></div><p className="subtext">Følg dokumentation, faglig gennemgang og næste skridt for hver AI-løsning.</p></section>
      <div className="toolbar"><label htmlFor="home-scope">Vis<select id="home-scope" value={scope} onChange={event=>changeScope(event.target.value)}><option value="work">Kommunens arbejdssager</option><option value="examples">Eksempelsager</option><option value="all">Arbejdssager og eksempler</option></select></label><small>{scope==='examples' ? 'Fiktive sager til gennemgang og demonstration' : scope==='all' ? 'Arbejdssager og tydeligt markerede eksempelsager' : 'Eksempelsager vises kun, når du vælger dem'}{query.isFetching && !query.isLoading ? ' · Opdaterer…' : ''}</small></div>
      {query.isLoading && <StatePanel role="status">Henter sager og næste handlinger…</StatePanel>}
      {query.isError && <ErrorPanel role="alert"><strong>Overblikket kunne ikke hentes</strong><p>Prøv igen for at få aktuelle tal og handlinger.</p><Button onClick={()=>query.refetch()}>Prøv igen</Button></ErrorPanel>}
      {!query.isLoading && !query.isError && data && <>
        <dl className="stats" aria-label="Sagsstatus"><div><dt>Aktive sager</dt><dd>{data.stats.active}</dd><small>{data.stats.archived} arkiveret · {data.stats.examples} eksempelsager</small></div><div><dt>Kræver handling</dt><dd>{data.stats.requires_action}</dd><small>Blokeringer, tiltag eller overskredet frist</small></div><div><dt>Afventer godkendelse</dt><dd>{data.stats.awaiting_approval}</dd><small>Sendt til faglig beslutning</small></div><div><dt>Opfølgning inden 30 dage</dt><dd>{data.stats.review_due_soon}</dd><small>{data.stats.review_overdue} med overskredet frist</small></div></dl>
        {data.truncated && <StatePanel role="status">Viser {data.count} af {data.total} sager. Nøgletallene dækker alle sager i det valgte udsnit. <Link to="/sager">Åbn sagsoversigten</Link>.</StatePanel>}
        <div className="columns"><div>
          <section id="home-queue" aria-labelledby="home-queue-title"><div className="section-head"><h2 id="home-queue-title" tabIndex="-1">Næste handlinger</h2><Link to={scope==='examples' ? '/sager?examples=1' : '/sager'}>Se sagsoversigten →</Link></div><p className="subtext">Åbn en sag for at gennemgå grundlaget og fortsætte arbejdet.</p>
            <div className="queue-controls"><div role="group" aria-label="Sager i arbejdslisten"><button aria-pressed={queueFilter==='attention'} onClick={()=>{setQueueFilter('attention');setPage(0);}}>Til opfølgning ({attention.length})</button><button aria-pressed={queueFilter==='all'} onClick={()=>{setQueueFilter('all');setPage(0);}}>Alle aktive ({active.length})</button></div></div>
            {!selected.length ? <StatePanel><strong>{!active.length ? 'Der er ingen aktive sager i dette udsnit' : 'Ingen registreret opfølgning'}</strong><p>{!active.length ? 'Opret en AI-løsning, og tilføj leverandørmaterialet til sagen.' : 'Du kan åbne alle aktive sager og følge deres dokumentation.'}</p>{!active.length && <Button as={Link} to="/anskaffelse">Opret den første sag</Button>}</StatePanel> : <>
              <ul aria-label="Sager med næste handling">{selected.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE).map(item=><li key={item.id}><Link className="case-row" to={casePath(item, undefined, scope)}><div><div className="meta"><span className="tag" data-tone={item.attention?.kind==='requires_action' ? 'danger' : ['awaiting_approval','review_due'].includes(item.attention?.kind) ? 'warning' : 'neutral'}>{item.attention?.label || item.status_label || 'Åbn sag'}</span><span>{item.case_id}</span>{item.is_example && <span>Eksempelsag</span>}</div><h3>{item.title || 'Sag uden titel'}</h3><p>{item.attention?.detail || 'Åbn sagen og gennemgå dokumentationen.'}</p><div className="meta"><span>{item.assigned_to || 'Ansvarlig ikke angivet'}</span><span>{item.status_label || item.status}</span></div></div><span className="arrow" aria-hidden="true">→</span></Link></li>)}</ul>
              <nav className="pager" aria-label="Sider i arbejdslisten"><span role="status">Viser {currentPage*PAGE_SIZE+1}–{Math.min((currentPage+1)*PAGE_SIZE,selected.length)} af {selected.length} sager</span>{pages>1 && <div><SecondaryButton disabled={!currentPage} onClick={()=>movePage(currentPage-1)}>Forrige</SecondaryButton><SecondaryButton disabled={currentPage===pages-1} onClick={()=>movePage(currentPage+1)}>Næste</SecondaryButton></div>}</nav>
            </>}
          </section>
          <section className="recent" aria-labelledby="home-recent-title"><div className="section-head"><h2 id="home-recent-title">Seneste gemte vurderinger</h2><Link to="/historik">Hele historikken →</Link></div><p className="subtext">Åbn analysen for at læse den eller hente Word og Excel.</p>{recent.length ? <ul>{recent.map(item=><li key={item.id}><Link className="recent-row" to={`/vurdering?assessment_id=${encodeURIComponent(item.id)}${item.case_db_id ? `&case=${encodeURIComponent(item.case_db_id)}` : ''}`}><div><strong>{item.project_name || 'Vurdering uden systemnavn'}</strong><small>Version {item.version || 1} · {formatAssessmentDate(item.created_at)}{item.department ? ` · ${item.department}` : ''}</small><small>{item.status_label || 'Kræver faglig gennemgang'}</small></div><span className="arrow" aria-hidden="true">↗</span></Link></li>)}</ul> : <p className="subtext">Der er endnu ingen gemte vurderinger i dette udsnit.</p>}</section>
        </div><aside>
          <section aria-labelledby="home-reviews-title"><h2 id="home-reviews-title">Kommende opfølgning</h2><p className="subtext">Planlagte datoer for gennemgang af sagerne.</p>{reviews.length ? <ul>{reviews.map(item=>{const overdue=dayKey(item.reviewDate)<today; return <li key={item.id}><Link className="review" to={casePath(item,'overview',scope)} data-overdue={overdue}><time dateTime={dayKey(item.reviewDate)}><b>{item.reviewDate.getDate()}</b>{item.reviewDate.toLocaleDateString('da-DK',{month:'short'})}<br/>{item.reviewDate.getFullYear()}</time><div><strong>{item.title}</strong><small>{overdue ? 'Fristen er overskredet' : 'Planlagt opfølgning'}</small></div></Link></li>;})}</ul> : <p className="subtext">Ingen frister registreret. Planlæg næste opfølgning på den enkelte sag.</p>}</section>
          <div className="help"><h3>Ny i S.H.I.E.L.D.?</h3><p>Bliv guidet gennem sager, dokumentation, faglig gennemgang og download.</p><SecondaryButton onClick={tutorial.restart} disabled={!tutorial.canStart || tutorial.saving || tutorial.loading}>{tutorial.saving ? 'Åbner guide…' : 'Start interaktiv guide'}</SecondaryButton></div>
          <nav className="shortcuts" aria-label="Genveje"><Link to="/dokumentbank">Dokumentbank <span aria-hidden="true">↗</span></Link><Link to="/videnbase">Viden og vejledning <span aria-hidden="true">↗</span></Link><Link to="/drift">Driftsstatus <span aria-hidden="true">↗</span></Link></nav>
        </aside></div>
      </>}
    </>}
  </Page>;
}
