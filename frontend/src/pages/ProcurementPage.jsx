import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext';
import DepartmentField from '../components/DepartmentField';
import MaterialCoverage from '../components/assessment/MaterialCoverage';
import EvidenceNavigator from '../components/assessment/EvidenceNavigator';
import ClarificationList from '../components/assessment/ClarificationList';
import { CONTROL_OPTIONS, DATA_CATEGORY_OPTIONS, DATA_SUBJECT_OPTIONS, OPTION_LABELS } from '../features/dpia/assessmentModel';

const Page = styled.main`
  max-width: 1240px; margin: auto; padding: 54px 24px 100px; overflow-wrap: anywhere;
  h1 { font-size: clamp(2.3rem,5vw,4rem); line-height: 1.12; hyphens: auto; letter-spacing: -.045em; margin: 10px 0 18px; }
  h2 { font-size: 1.7rem; margin-bottom: 14px; } h3 { margin-bottom: 10px; }
  a:not([class]) { color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark}; }
  p { margin-bottom: 14px; } small { color: ${p => p.theme.colors.textMuted}; }
  input:not([type=checkbox]), textarea, select { width: 100%; min-width: 0; padding: 12px; font: inherit; }
  textarea { min-height: 125px; resize: vertical; } input[type=checkbox] { width: 20px; height: 20px; flex-shrink: 0; accent-color: ${p => p.theme.colors.primary}; }
  label { display: block; font-weight: 600; margin-bottom: 8px; }
  details { margin: 12px 0; } summary { cursor: pointer; font-weight: 600; }
  blockquote { padding: 12px 16px; border-left: 3px solid ${p => p.theme.colors.border}; margin: 12px 0; white-space: pre-wrap; }
  ul { padding-left: 22px; } li { margin-bottom: 10px; }
  @media(max-width:600px) { padding: 28px 16px 80px; h1 { font-size: clamp(1.9rem,8vw,2.3rem); } }
`;
const Eyebrow = styled.p`color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark}; font-size: .75rem; font-weight: 650; letter-spacing: .12em; text-transform: uppercase;`;
const Lead = styled.p`max-width: 760px; font-size: 1.05rem; color: ${p => p.theme.colors.textMuted};`;
const Steps = styled.nav`display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); margin: 32px 0; border-block: 1px solid ${p => p.theme.colors.border}; @media(max-width:700px) { grid-template-columns: repeat(2,minmax(0,1fr)); }`;
const Step = styled.button`text-align: left; padding: 18px 12px; color: ${p => p.$active ? (p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark) : p.theme.colors.text}; background: ${p => p.$active ? p.theme.colors.primarySoft : 'transparent'}; font: inherit; font-size: .86rem; border-bottom: 3px solid ${p => p.$active ? p.theme.colors.primary : 'transparent'}; &:disabled { opacity: .45; cursor: default; }`;
const Grid = styled.div`display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 22px; margin: 24px 0; > * { min-width: 0; } @media(max-width:700px) { grid-template-columns: 1fr; }`;
const Section = styled.section`padding: 26px 0; border-bottom: 1px solid ${p => p.theme.colors.border};`;
const Actions = styled.div`display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 24px;`;
const Button = styled.button`display: inline-flex; align-items: center; justify-content: center; padding: 12px 18px; min-height: 46px; max-width: 100%; white-space: normal; font: inherit; font-size: .88rem; border: 1px solid ${p => p.theme.colors.primary}; background: ${p => p.$secondary ? 'transparent' : p.theme.colors.primary}; color: ${p => p.$secondary ? (p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark) : '#fff'}; &:hover { color: ${p => p.$secondary ? (p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark) : '#fff'}; opacity:.9; } &:disabled { opacity:.5; cursor:wait; }`;
const Notice = styled.div`margin: 18px 0; padding: 16px 20px; background: ${p => p.theme.colors.surfaceAlt}; border-left: 3px solid ${p => p.$error ? p.theme.colors.danger : p.theme.colors.primary};`;
const Fact = styled.article`padding: 22px 0; border-bottom: 1px solid ${p => p.theme.colors.border}; > label { display:flex; align-items:flex-start; gap:12px; }`;
const EMPTY = { system_name:'', supplier_name:'', organisation:'Kalundborg Kommune', department:'', owner:'', intended_use:'', procurement_stage:'new_purchase', journal_reference:'' };
const STEP_NAMES = ['AI-løsning og behov','Leverandørmateriale','Oplysninger og kilder','Vurdering og jura'];
const STEP_KEYS = ['profile','materials','facts','review'];
const CATEGORIES = [['supplier_documentation','Leverandørmateriale'],['data_processing_agreement','Databehandleraftale'],['security_documentation','Sikkerhedsdokumentation'],['other','Øvrigt materiale']];
const FACT_LABELS = { purpose:'Formål', processing_description:'Behandling af oplysninger', supplier_name:'Leverandør', solution_type:'Løsningstype', hosting_region:'Hosting', transfer_outside_eea:'Overførsel uden for EU/EØS', model_training:'Brug af data til modeltræning', retention_period:'Opbevaring', data_subjects:'Registrerede', personal_data_categories:'Personoplysninger', special_categories:'Følsomme oplysninger', criminal_data:'Strafbare forhold', cpr_data:'CPR-numre', vulnerable_subjects:'Sårbare personer', large_scale:'Stort omfang', systematic_monitoring:'Systematisk overvågning', automated_decisions:'Automatiske afgørelser', human_oversight:'Menneskeligt tilsyn', controls:'Oplyste sikkerhedsforanstaltninger', secondary_uses:'Sekundære formål' };
const VALUE_LABELS = {
  controls: Object.fromEntries(CONTROL_OPTIONS),
  personal_data_categories: Object.fromEntries(DATA_CATEGORY_OPTIONS),
  data_subjects: Object.fromEntries(DATA_SUBJECT_OPTIONS),
};
const showValue = (field,value) => Array.isArray(value)
  ? value.map(item=>showValue(field,item)).join(', ') || 'Ikke oplyst'
  : typeof value === 'boolean' ? (value ? 'Ja' : 'Nej')
  : VALUE_LABELS[field]?.[value] || OPTION_LABELS[field]?.[value] || String(value ?? 'Ikke oplyst');
const date = value => value ? new Date(value).toLocaleString('da-DK') : '';
const providerLabel = provider => ({'codex-local-test':'Codex · lokal kørsel','vercel-ai-gateway':'Vercel AI Gateway'}[provider] || provider || 'Ikke oplyst');
const positiveCount = value => Number.isInteger(value) && value > 0;
const count = value => value.toLocaleString('da-DK');

function AnalysisBatchSummary({ batching }) {
  if (batching?.strategy !== 'map-reduce-v1' || !positiveCount(batching.batch_count) || !positiveCount(batching.source_count)) return null;
  return <Notice><strong>{count(batching.batch_count)} delanalyser samlet til én analyse</strong><p>{count(batching.source_count)} kildeuddrag er fordelt på delanalyserne.{positiveCount(batching.source_text_chars) ? ` Det behandlede tekstgrundlag er ${count(batching.source_text_chars)} tegn.` : ''} Kildehenvisningerne følger med i det samlede resultat.</p><small>Se fordelingen og den gemte JEV-kontrol under sagens fane Teknisk kørsel. Analysen kræver fortsat faglig gennemgang.</small></Notice>;
}

export default function ProcurementPage() {
  const { authFetch } = useAuth();
  const [params,setParams] = useSearchParams();
  const caseId = params.get('case') || '';
  const step = Math.max(0,STEP_KEYS.indexOf(params.get('step') || 'profile'));
  const [profile,setProfile] = useState(EMPTY);
  const [sources,setSources] = useState([]);
  const [analysisLimits,setAnalysisLimits] = useState(null);
  const [analysis,setAnalysis] = useState(null);
  const [review,setReview] = useState(null);
  const [accepted,setAccepted] = useState([]);
  const [note,setNote] = useState('');
  const [url,setUrl] = useState('');
  const [category,setCategory] = useState('supplier_documentation');
  const [busy,setBusy] = useState('');
  const [loading,setLoading] = useState(Boolean(caseId));
  const [loadError,setLoadError] = useState(false);
  const [loadAttempt,setLoadAttempt] = useState(0);
  const activeCase = useRef(caseId);
  activeCase.current = caseId;
  const loadSequence = useRef(0);
  const operationSequence = useRef(0);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const request = useCallback(async (path,options) => {
    const operation = operationSequence.current;
    const requestCase = activeCase.current;
    const response = await authFetch(path,options);
    const body = await response.json().catch(() => null);
    if (activeCase.current !== requestCase || operationSequence.current !== operation) {
      const cancelled = new Error('Sagen blev ændret, mens forespørgslen kørte.');
      cancelled.name = 'AbortError';
      throw cancelled;
    }
    if (!response.ok) {
      const detail = typeof body?.detail === 'string' ? body.detail : '';
      throw new Error(/ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT/.test(detail)
        ? 'Forbindelsen til løsningen er midlertidigt afbrudt. Prøv at hente oplysningerne igen.'
        : detail || 'Oplysningerne kunne ikke gemmes eller hentes. Kontrollér felterne og prøv igen.');
    }
    return body;
  },[authFetch]);
  const base = `/api/v3/cases/${encodeURIComponent(caseId)}`;
  const load = useCallback(async (signal) => {
    if(activeCase.current !== caseId || signal?.aborted) return false;
    const sequence = ++loadSequence.current;
    const options = signal ? {signal} : undefined;
    const [data,material] = await Promise.all([request(`${base}/procurement`,options),request(`${base}/source-material`,options)]);
    if (signal?.aborted || activeCase.current !== caseId || sequence !== loadSequence.current) return false;
    setProfile(data.profile); setSources(material.items); setAnalysisLimits(material.analysis_limits || null); setAnalysis(data.analysis); setReview(data.review);
    if (data.review && data.analysis && data.review.analysis_id === data.analysis.id) { setAccepted(data.review.accepted_fact_ids); setNote(data.review.note); }
    else { setAccepted([]); setNote(''); }
    return true;
  },[base,caseId,request]);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    ++operationSequence.current; setBusy('');
    setProfile(EMPTY); setSources([]); setAnalysisLimits(null); setAnalysis(null); setReview(null);
    setAccepted([]); setNote(''); setUrl(''); setMessage(''); setError(''); setLoadError(false);
    if (!caseId) { setLoading(false); return () => { controller.abort(); ++loadSequence.current; ++operationSequence.current; }; }
    setLoading(true);
    load(controller.signal).catch(e => { if(live && !controller.signal.aborted) { setError(e.message); setLoadError(true); } }).finally(() => { if(live) setLoading(false); });
    return () => { live=false; controller.abort(); ++loadSequence.current; ++operationSequence.current; };
  },[caseId,load,loadAttempt]);
  const go = (index,id=caseId) => { setParams({...(id ? {case:id} : {}),step:STEP_KEYS[index]}); setError(''); setMessage(''); };
  const run = async (label,work) => { const operation=++operationSequence.current; setBusy(label); setError(''); setMessage(''); try { await work(); } catch(e) { if(operation===operationSequence.current && e.name!=='AbortError') setError(e instanceof TypeError ? 'Forbindelsen blev afbrudt. Prøv igen.' : e.message); } finally { if(operation===operationSequence.current) setBusy(''); } };
  const json = data => ({headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const update = (name,value) => setProfile(p => ({...p,[name]:value}));
  const saveProfile = event => { event.preventDefault(); run('Gemmer AI-løsning…',async () => {
    const payload = Object.fromEntries(Object.keys(EMPTY).map(key => [key,profile[key]]));
    const data = await request(caseId ? `${base}/procurement` : '/api/v3/procurements',{method:caseId ? 'PATCH':'POST',...json({...payload,...(caseId ? {revision:profile.revision} : {})})});
    setProfile(data.profile); go(1,caseId || data.case_id);
  }); };
  const upload = event => { const files=Array.from(event.target.files || []); event.target.value=''; if(!files.length) return; run('Gemmer og læser materialet…',async () => {
    let saved=0;
    try { for(const file of files) { const body=new FormData(); body.append('file',file); body.append('category',category); await request(`${base}/source-material`,{method:'POST',body}); saved+=1; } }
    finally { if(saved) await load(); }
    setMessage(`${files.length} dokument${files.length===1?'':'er'} er gemt på sagen.`);
  }); };
  const download = async (path,filename) => {
    const response=await authFetch(path); if(!response.ok) throw new Error('Dokumentet kunne ikke hentes.');
    const objectUrl=URL.createObjectURL(await response.blob()); const anchor=document.createElement('a'); anchor.href=objectUrl; anchor.download=filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(objectUrl),1000);
  };
  const sourceRef = ref => {
    const source=analysis?.sources?.find(item=>item.id===ref.source_id);
    return <div key={`${ref.source_id}-${ref.quote}`}><small>{source?.title || 'Kilde'} · {source?.locator || 'Tekstuddrag'}</small><blockquote>{ref.quote}</blockquote></div>;
  };
  const checks = analysis?.review?.checks || [];
  const flaggedChecks = new Set(checks.filter(check=>check.requires_review).map(check=>check.id));
  const flagged = new Set([...flaggedChecks].filter(id=>id.startsWith('fact:')).map(id=>id.slice(5)));
  const currentReview = review && review.analysis_id===analysis?.id && !analysis?.outdated;
  const capacityAvailable = analysisLimits && ['max_documents','max_total_text_chars','max_document_text_chars'].every(key=>Number.isFinite(analysisLimits[key])&&analysisLimits[key]>0);
  const batchingEnabled = analysisLimits?.batching_enabled === true;
  const caseCapacityAvailable = analysisLimits && ['max_case_documents','max_case_text_chars','max_case_excerpts','max_batches'].every(key=>positiveCount(analysisLimits[key]));
  return <Page>
    <Eyebrow>AI-løsninger · anskaffelse og ændret anvendelse</Eyebrow>
    <h1>{profile.system_name || 'Opret en AI-løsning'}</h1>
    {!loading && !loadError && profile.organisation && <Lead><strong>Sagens organisation:</strong> {profile.organisation}</Lead>}
    <Lead>Saml kommunens behov og leverandørens dokumentation. Gennemgå kildeunderbyggede oplysninger, og forbered konsekvensanalysen og dialogen med jura.</Lead>
    {caseId && <Link to={`/sager/${caseId}`}>Åbn den samlede sag →</Link>}
    <Steps aria-label="Arbejdsgang for AI-løsninger"><>{STEP_NAMES.map((name,index)=><Step key={name} $active={step===index} aria-current={step===index?'step':undefined} disabled={Boolean(busy)||(!caseId&&index>0)||(!analysis&&index>1)||(!currentReview&&index>2)} onClick={()=>go(index)}>{index+1}. {name}</Step>)}</></Steps>
    {error && <Notice $error role="alert">{error}</Notice>}
    {(busy || message) && <Notice role="status">{busy || message}</Notice>}
    {loading ? <p role="status">Henter løsningens oplysninger…</p> : loadError ? <Actions><Button onClick={()=>setLoadAttempt(value=>value+1)}>Hent oplysninger igen</Button></Actions> : <>
      {step===0 && <form onSubmit={saveProfile}>
        <h2>Hvilken AI-løsning skal vurderes?</h2><p>Det kan være en selvstændig AI-løsning eller en IT-løsning med AI. Beskriv den konkrete AI-funktion og dens anvendelse i kommunen. Leverandørmaterialet tilføjes i næste trin.</p>
        <Grid>
          <div><label htmlFor="system-name">Løsningens navn</label><input id="system-name" required minLength={2} maxLength={255} value={profile.system_name} onChange={e=>update('system_name',e.target.value)} placeholder="Fx en referatassistent eller AI i et journalsystem" /></div>
          <div><label htmlFor="supplier-name">Leverandør</label><input id="supplier-name" maxLength={500} value={profile.supplier_name} onChange={e=>update('supplier_name',e.target.value)} /></div>
          <div><label htmlFor="organisation">Kommune eller organisation</label><input id="organisation" required minLength={2} value={profile.organisation} onChange={e=>update('organisation',e.target.value)} /></div>
          <DepartmentField value={profile.department} onChange={update} />
          <div><label htmlFor="system-owner">Ansvarlig for sagen</label><input id="system-owner" required minLength={2} value={profile.owner} onChange={e=>update('owner',e.target.value)} /></div>
          <div><label htmlFor="procurement-stage">Anledning</label><select id="procurement-stage" value={profile.procurement_stage} onChange={e=>update('procurement_stage',e.target.value)}><option value="new_purchase">Ny anskaffelse</option><option value="renewal">Kontraktfornyelse</option><option value="change">Ændret anvendelse</option></select></div>
        </Grid>
        <label htmlFor="intended-use">Kommunens påtænkte anvendelse</label><textarea id="intended-use" required minLength={20} maxLength={10000} value={profile.intended_use} onChange={e=>update('intended_use',e.target.value)} placeholder="Hvad skal AI-funktionen gøre, hvem skal bruge den, hvilke oplysninger behandler den, og hvordan gennemgår medarbejdere dens output?" />
        <Grid><div><label htmlFor="journal-reference">Journalreference (valgfri)</label><input id="journal-reference" maxLength={100} value={profile.journal_reference} onChange={e=>update('journal_reference',e.target.value)} /></div></Grid>
        <Actions><Button disabled={Boolean(busy)}>Gem og tilføj materiale →</Button></Actions>
      </form>}
      {step===1 && <>
        <h2>Saml leverandørmaterialet</h2><p>Tilføj præsentationer, databehandleraftale, sikkerhedsdokumentation og links. Materialet gemmes som versionsbestemte kilder på denne sag.</p>
        {batchingEnabled ? <>
          <p>Større dokumentpakker opdeles automatisk og samles til én analyse. Hver del behandles med kildehenvisninger, og JEV kontrollerer det samlede resultats kildegrundlag.</p>
          {(capacityAvailable || caseCapacityAvailable) && <details><summary>Kapacitet for automatisk analyse</summary>
            {caseCapacityAvailable && <p>Én samlet analyse kan behandle op til {count(analysisLimits.max_case_documents)} dokumenter og hjemmesider, {count(analysisLimits.max_case_text_chars)} tegn og {count(analysisLimits.max_case_excerpts)} kildeuddrag, fordelt på højst {count(analysisLimits.max_batches)} dele.</p>}
            {capacityAvailable && <p><small>Hver del kan omfatte op til {count(analysisLimits.max_documents)} dokumenter og {count(analysisLimits.max_total_text_chars)} tegn, højst {count(analysisLimits.max_document_text_chars)} tegn pr. kildeuddrag.</small></p>}
          </details>}
        </> : capacityAvailable && <p><small>Analysen kan omfatte op til {count(analysisLimits.max_documents)} dokumenter og {count(analysisLimits.max_total_text_chars)} tegn i alt, højst {count(analysisLimits.max_document_text_chars)} tegn pr. dokument.</small></p>}
        <MaterialCoverage sources={sources} onSelectCategory={value=>{setCategory(value);document.getElementById('material-category')?.focus();}} />
        <Grid>
          <Section><h3>Upload dokumenter</h3><label htmlFor="material-category">Dokumenttype</label><select id="material-category" value={category} onChange={e=>setCategory(e.target.value)}>{CATEGORIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><label htmlFor="material-files" style={{marginTop:18}}>Vælg filer</label><input id="material-files" type="file" multiple accept=".pptx,.pdf,.docx,.txt" disabled={Boolean(busy)} onChange={upload} /><small>PowerPoint (PPTX), PDF, Word (DOCX) eller tekst. Højst 5 MB pr. fil. Billeder og scannede sider kræver tekstgenkendelse før upload.</small></Section>
          <Section><h3>Tilføj en hjemmeside</h3><form onSubmit={e=>{e.preventDefault();run('Henter hjemmesiden…',async()=>{await request(`${base}/source-material/url`,{method:'POST',...json({url,category})});setUrl('');await load();setMessage('Hjemmesidens indhold er gemt som kilde.');});}}><label htmlFor="material-url">Offentligt leverandørlink</label><input id="material-url" type="url" required value={url} placeholder="https://leverandoer.dk/ai-loesning" onChange={e=>setUrl(e.target.value)} /><p><small>Vi gemmer et tekstudtræk med adresse og tidspunkt. Sider bag login kan uploades som dokument.</small></p><Button $secondary disabled={Boolean(busy)}>Tilføj hjemmeside</Button></form></Section>
        </Grid>
        <h3>Materiale på sagen · {sources.length}</h3>
        {sources.length>0&&<details><summary>Søg i sagens dokumenter og kildeuddrag</summary><EvidenceNavigator sources={sources} compact /></details>}
        {!sources.length && <Notice>Start med en produktbeskrivelse og den databehandleraftale, der skal gælde for jeres anvendelse.</Notice>}
        {sources.map(source=><Section key={source.id}><h3>{source.title}</h3><p><small>{date(source.uploaded_at)} · {source.excerpts.length} tekstuddrag · Ikke fagligt godkendt</small></p>{source.source_url && <p><a href={source.source_url} target="_blank" rel="noreferrer">{source.source_url}</a></p>}{source.warnings.map((warning,i)=><Notice key={i}>{warning}</Notice>)}<details><summary>Se tekstgrundlag</summary>{source.excerpts.slice(0,8).map(excerpt=><div key={excerpt.id}><small>{excerpt.locator}</small><blockquote>{excerpt.text}</blockquote></div>)}{source.excerpts.length>8&&<p>Viser de første 8 uddrag. Hent dokumentet for at læse hele materialet.</p>}</details><Button $secondary disabled={Boolean(busy)} onClick={()=>run('Henter dokument…',()=>download(source.download_url,source.original_filename))}>Hent kilde</Button></Section>)}
        <Actions><Button disabled={Boolean(busy)||!sources.some(source=>source.excerpts.length)} onClick={()=>run(batchingEnabled ? 'AI gennemgår materialet, samler eventuelle delanalyser og kører JEV-kontrol…' : 'AI gennemgår materialet, og JEV kontrollerer kildegrundlaget…',async()=>{const data=await request(`${base}/procurement/analyze`,{method:'POST'});setAnalysis(data);setReview(null);setAccepted([]);go(2);})}>Analysér leverandørmateriale →</Button>{analysis&&<Button $secondary disabled={Boolean(busy)} onClick={()=>go(2)}>Se seneste analyse</Button>}</Actions>
        <p style={{marginTop:14}}><small>AI udleder forslag fra materialet. JEV markerer udsagn, der kan mangle belæg; den faglige og juridiske vurdering ligger hos kommunen.</small></p>
      </>}
      {step===2 && analysis && <>
        <h2>Gennemgå oplysninger og kilder</h2><Lead>{analysis.summary}</Lead>
        <AnalysisBatchSummary batching={analysis.batching} />
        {flaggedChecks.has('summary')&&<Notice>JEV har markeret sammenfatningen til faglig gennemgang. Kontrollér den mod leverandørmaterialet og kommunens anvendelse.</Notice>}
        <p><small>Analyse fra {date(analysis.created_at)} · {analysis.facts.length} kildeunderbyggede forslag</small></p>
        <details><summary>Om analysen og kildekontrollen</summary>
          <dl><dt>Model</dt><dd>{analysis.model || 'Ikke oplyst'}</dd><dt>Kørsel</dt><dd>{providerLabel(analysis.generation_provider)}</dd><dt>Kildekontrol</dt><dd>{analysis.review?.model || 'Ikke oplyst'} · {checks.length} kontrolpunkter, heraf {flaggedChecks.size} markeret til gennemgang</dd></dl>
          <p><small>JEV vurderer udsagnenes støtte i de medsendte kilder. Det er ikke en juridisk godkendelse eller en garanti for, at leverandørens oplysninger er korrekte. Kommunen skal gennemgå grundlaget og dokumentere sin vurdering.</small></p>
        </details>
        {analysis.outdated&&<Notice $error>Grundlaget er ændret siden analysen. Gå til leverandørmaterialet og analysér det aktuelle grundlag, før du fortsætter.</Notice>}
        <Notice>Markér kun oplysninger, der gælder for kommunens konkrete anvendelse. Leverandørudsagn er ikke dokumentation for, at en sikkerhedsforanstaltning er implementeret hos jer.</Notice>
        {analysis.facts.map(fact=><Fact key={fact.id}><label><input type="checkbox" checked={accepted.includes(fact.id)} disabled={Boolean(busy)||analysis.outdated} onChange={e=>setAccepted(ids=>e.target.checked?[...ids,fact.id]:ids.filter(id=>id!==fact.id))} /><span>{FACT_LABELS[fact.field] || fact.label}<br /><span style={{fontWeight:400}}>{showValue(fact.field,fact.value)}</span></span></label>{flagged.has(fact.id)&&<Notice>Kildegrundlaget er markeret af JEV. Beskriv din afklaring i notatet, hvis oplysningen anvendes.</Notice>}<details><summary>Se kildebelæg</summary>{fact.source_refs.map(sourceRef)}</details></Fact>)}
        {analysis.conflicts.length>0&&<Section><h3>Modstridende oplysninger</h3>{analysis.conflicts.map(conflict=><div key={conflict.id}><p>{conflict.description}</p>{flaggedChecks.has(`conflict:${conflict.id}`)&&<Notice>JEV har markeret denne beskrivelse af modstridende oplysninger til gennemgang. Kontrollér begge kilder, og dokumentér afklaringen.</Notice>}{conflict.source_refs.map(sourceRef)}</div>)}</Section>}
        <ClarificationList caseId={caseId} analysisId={analysis.id} questions={analysis.questions} sources={sources} />
        <Section><label htmlFor="review-note">Notat til den videre gennemgang</label><textarea id="review-note" value={note} maxLength={10000} onChange={e=>setNote(e.target.value)} placeholder="Beskriv afklaringer, forbehold og spørgsmål, som jura og systemejeren skal følge op på." /><small>Din gennemgang gemmes med oplysningerne og den anvendte analyse. Det er ikke en juridisk godkendelse.</small></Section>
        <Actions><Button disabled={Boolean(busy)||analysis.outdated} onClick={()=>run('Gemmer gennemgangen…',async()=>{const data=await request(`${base}/procurement/review`,{method:'POST',...json({analysis_id:analysis.id,accepted_fact_ids:accepted,note})});setReview(data);go(3);})}>Gem gennemgang og fortsæt →</Button></Actions>
      </>}
      {step===3 && currentReview && <>
        <h2>Et fælles grundlag for vurdering og jura</h2><p>Din gennemgang er gemt. {review.accepted_fact_ids.length} oplysninger kan overføres til konsekvensanalysen sammen med kommunens formål. Uafklarede felter skal fortsat udfyldes.</p>
        <Section><h3>Konsekvensanalyse og risikovurdering</h3><p>Fortsæt med hjemmel, personoplysninger og de sikkerhedsforanstaltninger, der faktisk er etableret. Vurderinger og rapporter gemmes på sagen.</p><Actions><Button as={Link} to={`/vurdering?case=${encodeURIComponent(caseId)}&procurement_review=${encodeURIComponent(review.id)}`}>Fortsæt til konsekvensanalyse →</Button></Actions></Section>
        <Section><h3>Forbered den juridiske gennemgang</h3><p>Hent et samlet Word-notat med anvendelse, kilder, udvalgte oplysninger, JEV-markeringer og åbne spørgsmål.</p><Actions><Button $secondary disabled={Boolean(busy)} onClick={()=>run('Henter juridisk dialoggrundlag…',()=>download(`${base}/procurement/reviews/${review.id}/export.docx`,`${profile.system_name} – juridisk dialoggrundlag.docx`))}>Hent dialoggrundlag · Word</Button><Button $secondary disabled={Boolean(busy)} onClick={()=>run('Gemmer opgave til jura…',async()=>{await request(`${base}/actions`,{method:'POST',...json({title:`Juridisk gennemgang af ${profile.system_name}`.slice(0,255),description:`Gennemgang: ${review.id}\n${review.note}\n\n${analysis.questions.map(q=>q.question).join('\n')}`,category:'follow_up',priority:'high',owner:'Jura'})});setMessage('Juraopgaven er gemt under sagens tiltag.');})}>Opret opgave til jura</Button></Actions></Section>
        <Actions><Link to={`/sager/${caseId}`}>Se dokumenter, tiltag og vurderinger på sagen →</Link></Actions>
      </>}
      {((step===2&&!analysis)||(step===3&&!currentReview))&&<Notice>Gennemgå det aktuelle leverandørmateriale, før dette trin kan åbnes.<Actions><Button onClick={()=>go(1)}>Til leverandørmateriale</Button></Actions></Notice>}
    </>}
  </Page>;
}
