import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../../contexts/AuthContext';
import EvidenceNavigator, { sourceLabel } from './EvidenceNavigator';

const Editor = styled.section`
  margin: 24px 0; padding: clamp(18px,3vw,30px); border: 1px solid ${p=>p.theme.colors.border}; background: ${p=>p.theme.colors.surface}; color: ${p=>p.theme.colors.text}; min-width:0;
  h2 { margin:0 0 12px; font-size:1.6rem; } h3 { margin:0 0 10px; font-size:1.05rem; }
  p { margin: 0 0 14px; line-height:1.6; } small { color: ${p=>p.theme.colors.textMuted}; line-height:1.5; }
  label { display:block; margin: 16px 0 7px; font-size:.85rem; font-weight:650; }
  input,textarea,select { width:100%; min-width:0; max-width:100%; padding:11px 12px; border:1px solid ${p=>p.theme.colors.border}; background:${p=>p.theme.colors.inputBackground}; color:${p=>p.theme.colors.text}; font:inherit; font-size:.88rem; }
  textarea { min-height:145px; resize:vertical; line-height:1.65; }
  button { font:inherit; font-size:.85rem; color:${p=>p.theme.colors.primary}; padding:10px 14px; border:1px solid ${p=>p.theme.colors.border}; min-height:44px; }
  button:disabled { opacity:.5; cursor:default; } button:focus-visible { outline:3px solid ${p=>p.theme.colors.primary}; outline-offset:2px; }
  .primary { color:#fff; background:${p=>p.theme.colors.primary}; border-color:${p=>p.theme.colors.primary}; }
  .actions { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:18px; }
  .workspace { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); gap:26px; margin:22px 0; } .workspace > * { min-width:0; }
  .notice { padding:14px 18px; margin:18px 0; border-left:3px solid ${p=>p.theme.colors.primary}; background:${p=>p.theme.colors.surfaceAlt}; font-size:.88rem; }
  [role=alert] { border-color:${p=>p.theme.colors.danger}; }
  .previous { margin:10px 0 18px; } .previous p { white-space:pre-wrap; color:${p=>p.theme.colors.textMuted}; font-size:.86rem; }
  summary { cursor:pointer; font-size:.86rem; font-weight:600; margin-bottom:10px; }
  .selected { list-style:none; margin:12px 0; padding:0; } .selected li { display:flex; align-items:center; justify-content:space-between; gap:12px; border-top:1px solid ${p=>p.theme.colors.border}; padding:9px 0; font-size:.8rem; overflow-wrap:anywhere; }
  .selected button { border:0; flex-shrink:0; }
  .history { margin-top:22px; border-top:1px solid ${p=>p.theme.colors.border}; padding-top:18px; }
  .history ol { padding-left:22px; } .history li { margin:12px 0; font-size:.88rem; overflow-wrap:anywhere; }
  .leave-overlay { position:fixed; inset:0; z-index:2000; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; padding:20px; }
  .leave-dialog { width:100%; max-width:540px; max-height:90vh; overflow:auto; padding:26px; background:${p=>p.theme.colors.surface}; color:${p=>p.theme.colors.text}; border:1px solid ${p=>p.theme.colors.border}; }
  @media(max-width:900px) { .workspace { grid-template-columns:1fr; } }
`;
const asList = value => Array.isArray(value) ? value : [];
const FIELD_NAMES = { text:'Afsnittets tekst', executive_summary:'Sammenfatning', scope:'Afgrænsning', scenario:'Risikoscenarie', consequences:'Konsekvenser for de registrerede', measures:'Foranstaltninger', rationale:'Begrundelse' };
const requestId = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return(c==='x'?n:(n&3)|8).toString(16);});
const targetKey = target => `${target.kind}:${target.id}`;
const dateLabel = value => value ? new Date(value).toLocaleString('da-DK') : '';
const draftKey = id => `shield-report-draft:v1:${id}`;
const readDraft = assessment => {
  const id=assessment.id;
  try {
    const raw=sessionStorage.getItem(draftKey(id));
    if(!raw)return null;
    const value=JSON.parse(raw);
    if(value?.version!==1 || value.assessment_id!==id || typeof value.note!=='string' || value.note.length>2000 || typeof value.selected!=='string' || !value.edits || typeof value.edits!=='object' || Array.isArray(value.edits))return null;
    const allowed=new Map([
      ['summary:summary',['executive_summary']],['scope:scope',['scope']],
      ...asList(assessment.sections).map(item=>[`section:${item.id}`,['text']]),
      ...asList(assessment.risks).map(item=>[`risk:${item.id}`,['scenario','consequences','measures','rationale']]),
    ]);
    const valid=Object.entries(value.edits).every(([key,edit])=>allowed.has(key) && edit && typeof edit.fields==='object' && !Array.isArray(edit.fields) && edit.fields && allowed.get(key).every(field=>typeof edit.fields[field]==='string'&&edit.fields[field].length<=20000) && Object.keys(edit.fields).every(field=>allowed.get(key).includes(field)) && Array.isArray(edit.source_ids) && edit.source_ids.every(sourceId=>typeof sourceId==='string'&&sourceId.length<500));
    if(!valid)return null;
    if(!allowed.has(value.selected))value.selected='summary:summary';
    if(value.pending && (typeof value.pending.signature!=='string' || !/^[a-f\d-]{36}$/i.test(value.pending.id)))value.pending=null;
    return value;
  } catch { return null; }
};
const removeDraft = id => { try { sessionStorage.removeItem(draftKey(id)); } catch { /* The editor still protects active unsaved changes. */ } };

export default function ReportEditor({ assessment, onSaved, onClose }) {
  const {authFetch}=useAuth();
  const navigate=useNavigate();
  const loadedDraft=useRef(null);
  if(!loadedDraft.current || loadedDraft.current.id!==assessment.id)loadedDraft.current={id:assessment.id,value:readDraft(assessment)};
  const restored=loadedDraft.current.value;
  const [draftId,setDraftId]=useState(assessment.id);
  const [selected,setSelected]=useState(restored?.selected || 'summary:summary');
  const [edits,setEdits]=useState(restored?.edits || {});
  const [note,setNote]=useState(restored?.note || '');
  const [storageError,setStorageError]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [history,setHistory]=useState(null);
  const [historyError,setHistoryError]=useState('');
  const [historyAttempt,setHistoryAttempt]=useState(0);
  const [closing,setClosing]=useState(false);
  const [pendingURL,setPendingURL]=useState(null);
  const leaveDialog=useRef(null);
  const skipBeforeUnload=useRef(false);
  const activeId=useRef(assessment.id);
  activeId.current=assessment.id;
  const pending=useRef(restored?.pending || null);
  const sources=asList(assessment.ai_generation?.sources);
  const targets=useMemo(()=>[
    {kind:'summary',id:'summary',label:'Sammenfatning',fields:{executive_summary:assessment.executive_summary || ''},source_ids:asList(assessment.summary_source_ids)},
    {kind:'scope',id:'scope',label:'Afgrænsning',fields:{scope:assessment.scope || ''},source_ids:asList(assessment.summary_source_ids)},
    ...asList(assessment.sections).map(section=>({kind:'section',id:section.id,label:`${section.id} · ${section.title}`,fields:{text:section.text || ''},source_ids:asList(section.source_ids),locked:['missing_information','not_applicable'].includes(section.source) || ['missing_information','not_applicable'].includes(section.review_status)})),
    ...asList(assessment.risks).map(risk=>({kind:'risk',id:risk.id,label:`Risiko ${risk.id} · ${risk.area || risk.title || 'Risikovurdering'}`,fields:Object.fromEntries(['scenario','consequences','measures','rationale'].map(field=>[field,typeof risk[field]==='string'?risk[field]:''])),source_ids:asList(risk.source_ids)})),
  ],[assessment]);
  const target=targets.find(item=>targetKey(item)===selected) || targets[0];
  const draft=edits[targetKey(target)] || {fields:target.fields,source_ids:target.source_ids};
  const sharedSourceIds=edits['summary:summary']?.source_ids || edits['scope:scope']?.source_ids;
  const current=['summary','scope'].includes(target.kind)&&sharedSourceIds ? {...draft,source_ids:sharedSourceIds} : draft;
  const latestId=history?.latest_id;
  const stale=latestId && latestId!==assessment.id;
  const changes=useMemo(()=>targets.flatMap(item=>{
    const edited=edits[targetKey(item)]; if(!edited || item.locked) return [];
    const changedSources=JSON.stringify([...edited.source_ids].sort())!==JSON.stringify([...item.source_ids].sort());
    const sourceField=Object.keys(item.fields).find(field=>edited.fields[field]?.trim());
    return Object.keys(item.fields).filter(field=>edited.fields[field]!==item.fields[field] || (changedSources&&field===sourceField)).map(field=>({kind:item.kind,target_id:item.id,field,text:edited.fields[field],source_ids:edited.source_ids}));
  }),[edits,targets]);

  const dirty=changes.length>0 || note.trim().length>0;
  useEffect(()=>{
    setDraftId(assessment.id);setEdits(restored?.edits || {});setNote(restored?.note || '');setError('');setStorageError('');setSaving(false);setClosing(false);setPendingURL(null);skipBeforeUnload.current=false;setSelected(restored?.selected || 'summary:summary');pending.current=restored?.pending || null;
  },[assessment.id,restored]);
  useEffect(()=>{
    if(draftId!==assessment.id)return;
    try {
      if(dirty)sessionStorage.setItem(draftKey(assessment.id),JSON.stringify({version:1,assessment_id:assessment.id,edits,note,selected,pending:pending.current}));
      else sessionStorage.removeItem(draftKey(assessment.id));
      setStorageError('');
    } catch { setStorageError('Browseren kunne ikke bevare kladden. Hold editoren åben, indtil rettelserne er gemt som en rapportversion.'); }
  },[assessment.id,draftId,dirty,edits,note,selected,saving]);
  useEffect(()=>{
    if(!dirty)return;
    const beforeUnload=event=>{if(skipBeforeUnload.current)return;event.preventDefault();event.returnValue='';};
    const beforeNavigate=event=>{
      if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
      const anchor=event.target instanceof Element ? event.target.closest('a[href]') : null;
      if(!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target!=='_self'))return;
      let url;
      try { url=new URL(anchor.href,window.location.href); } catch { return; }
      if(!['http:','https:'].includes(url.protocol))return;
      if(url.origin===window.location.origin && url.pathname===window.location.pathname && url.search===window.location.search)return;
      event.preventDefault();event.stopPropagation();setClosing(false);setPendingURL(url.href);
    };
    window.addEventListener('beforeunload',beforeUnload);
    document.addEventListener('click',beforeNavigate,true);
    return()=>{window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('click',beforeNavigate,true);};
  },[dirty]);
  useEffect(()=>{
    if(!pendingURL)return;
    const previous=document.activeElement;
    leaveDialog.current?.querySelector('button')?.focus();
    return()=>{if(previous?.isConnected)previous.focus();};
  },[pendingURL]);
  useEffect(()=>()=>{activeId.current=null;},[]);
  useEffect(()=>{
    const controller=new AbortController();const id=assessment.id;
    setHistory(null);setHistoryError('');
    authFetch(`/api/dpia/assessments/${encodeURIComponent(id)}/revisions`,{signal:controller.signal})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error('Versionshistorikken kunne ikke hentes.');if(!controller.signal.aborted&&activeId.current===id)setHistory(data);})
      .catch(e=>{if(!controller.signal.aborted&&activeId.current===id)setHistoryError(e.message);});
    return()=>controller.abort();
  },[assessment.id,authFetch,historyAttempt]);

  const update=(field,value)=>{setEdits(previous=>({...previous,[targetKey(target)]:{...current,fields:{...current.fields,[field]:value}}}));pending.current=null;};
  const setSources=ids=>{setEdits(previous=>{
    const next={...previous,[targetKey(target)]:{...current,source_ids:ids}};
    if(['summary','scope'].includes(target.kind)) {
      const other=targets.find(item=>item.kind===(target.kind==='summary'?'scope':'summary'));
      if(next[targetKey(other)])next[targetKey(other)]={...next[targetKey(other)],source_ids:ids};
    }
    return next;
  });pending.current=null;};
  const chooseSource=id=>{if(target.locked||current.source_ids.includes(id))return;setSources([...current.source_ids,id]);};
  const removeSource=id=>setSources(current.source_ids.filter(value=>value!==id));
  const save=async()=>{
    if(saving||stale||!history)return;
    if(!changes.length){setError('Ret mindst ét afsnit eller dets kildehenvisninger.');return;}
    if(note.trim().length<10){setError('Beskriv ændringen med mindst 10 tegn.');return;}
    if(changes.some(change=>!change.text.trim())){setError('Et redigeret tekstfelt må ikke være tomt.');return;}
    const payload={changes,note:note.trim()}; const signature=JSON.stringify(payload);
    if(pending.current?.signature!==signature)pending.current={signature,id:requestId()};
    const id=assessment.id; setSaving(true);setError('');
    try {
      const response=await authFetch(`/api/dpia/assessments/${encodeURIComponent(id)}/revisions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,request_id:pending.current.id})});
      const data=await response.json().catch(()=>null);
      if(activeId.current!==id)return;
      if(!response.ok)throw new Error(typeof data?.detail==='string'?data.detail:'Ændringerne kunne ikke gemmes. Dine rettelser er stadig i editoren.');
      if(!data?.id)throw new Error('Serveren returnerede ikke en gemt rapportversion.');
      removeDraft(id);pending.current=null;setEdits({});setNote('');onSaved(data);
    } catch(e){if(activeId.current===id)setError(e instanceof TypeError?'Forbindelsen blev afbrudt. Dine rettelser er bevaret her; prøv at gemme igen.':e.message);}
    finally {if(activeId.current===id)setSaving(false);}
  };
  const discard=()=>{removeDraft(assessment.id);pending.current=null;setEdits({});setNote('');setClosing(false);onClose();};
  const leave=()=>{
    if(!pendingURL)return;
    const url=new URL(pendingURL);setPendingURL(null);
    if(url.origin===window.location.origin)navigate(`${url.pathname}${url.search}${url.hash}`);
    else {
      skipBeforeUnload.current=true;
      try {window.location.assign(url.href);} catch {skipBeforeUnload.current=false;setError('Siden kunne ikke åbnes. Din kladde er bevaret.');}
      window.setTimeout(()=>{skipBeforeUnload.current=false;},1000);
    }
  };
  const dialogKeys=event=>{
    if(event.key==='Escape'){event.preventDefault();setPendingURL(null);}
    if(event.key==='Tab'){
      const buttons=leaveDialog.current?.querySelectorAll('button');
      if(!buttons?.length)return;
      const first=buttons[0],last=buttons[buttons.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  };
  return <Editor aria-label="Redigér rapportudkast">
    {pendingURL&&<div className="leave-overlay"><div className="leave-dialog" ref={leaveDialog} role="dialog" aria-modal="true" aria-labelledby="report-leave-title" aria-describedby="report-leave-description" onKeyDown={dialogKeys}><h2 id="report-leave-title">Forlad rapportudkastet?</h2><p id="report-leave-description">{storageError ? 'Browseren kunne ikke bevare dine ugemte rettelser. Bliv i editoren, hvis du vil gemme dem som en rapportversion.' : 'Dine ugemte rettelser bevares som en kladde i denne browserfane. Genåbn den samme rapportversion for at fortsætte.'}</p><div className="actions"><button type="button" onClick={()=>setPendingURL(null)}>Fortsæt redigering</button><button type="button" className="primary" onClick={leave}>{storageError?'Forlad editor uden at gemme':'Forlad editor og bevar kladde'}</button></div></div></div>}
    <h2>Redigér rapportudkast</h2><p>Skriv og dokumentér ét afsnit ad gangen med kilderne ved siden af. Når du gemmer, oprettes en ny version på sagen.</p>
    <div className="notice">Her ændrer du rapportens tekst. Risikoscorer, krav og godkendelser ændres gennem vurderingsgrundlaget og sagens normale arbejdsgang. En redigeret tekst skal gennemgås fagligt; tidligere JEV-kontrol gælder ikke automatisk den nye formulering.</div>
    {stale&&<div className="notice" role="alert">Der findes en nyere version. <Link to={`/vurdering?assessment_id=${encodeURIComponent(latestId)}&case=${encodeURIComponent(assessment.case_db_id || '')}`}>Åbn den seneste version</Link> før du redigerer.</div>}
    {error&&<div className="notice" role="alert">{error}</div>}
    {storageError&&<div className="notice" role="alert">{storageError}</div>}
    {dirty&&!storageError&&<p><small>Din ugemte kladde bevares i denne browserfane, så du kan genåbne den samme rapportversion.</small></p>}
    {historyError&&<div className="notice" role="alert">{historyError} <button type="button" onClick={()=>setHistoryAttempt(x=>x+1)}>Prøv igen</button></div>}
    <label htmlFor="report-editor-target">Vælg afsnit eller risiko</label><select id="report-editor-target" value={targetKey(target)} onChange={event=>setSelected(event.target.value)} disabled={saving}>{targets.map(item=><option key={targetKey(item)} value={targetKey(item)}>{item.label}{item.locked?' · kræver ændret grundlag':''}{edits[targetKey(item)]?' · rettet':''}</option>)}</select>
    <div className="workspace">
      <div>
        <h3>{target.label}</h3>
        {target.locked?<div className="notice">Afsnittet viser manglende oplysninger eller er ikke relevant ud fra grundlaget. Opdatér vurderingens oplysninger og udarbejd en ny vurdering for at ændre dette.</div>:<>
          {Object.entries(target.fields).map(([field,original])=><div key={field}><label htmlFor={`report-text-${field}`}>{FIELD_NAMES[field]}</label><textarea id={`report-text-${field}`} value={current.fields[field]} maxLength={20000} disabled={saving||Boolean(stale)} onChange={event=>update(field,event.target.value)} /><details className="previous"><summary>Tekst i version {assessment.version || 1}</summary><p>{original || 'Feltet er ikke udfyldt i denne version.'}</p></details></div>)}
          <h3>Kilder til dette afsnit</h3>{current.source_ids.length?<ul className="selected">{current.source_ids.map(id=>{const source=sources.find(item=>item.id===id) || {id};const label=[sourceLabel(source),source.locator].filter(Boolean).join(' · ');return <li key={id}><span>{label}</span><button type="button" disabled={saving||Boolean(stale)} onClick={()=>removeSource(id)} aria-label={`Fjern kilde ${label}`}>Fjern</button></li>;})}</ul>:<p><small>Ingen dokumentkilder valgt. Beskriv grundlaget for din faglige formulering i ændringsnotatet.</small></p>}
        </>}
      </div>
      <EvidenceNavigator sources={sources} selectedSourceIds={current.source_ids} onSelect={saving||stale||target.locked?undefined:chooseSource} compact context="report" />
    </div>
    <label htmlFor="report-editor-note">Hvad er ændret, og hvorfor?</label><textarea id="report-editor-note" value={note} minLength={10} maxLength={2000} disabled={saving||Boolean(stale)} onChange={event=>{setNote(event.target.value);pending.current=null;}} placeholder="Fx præciseret adgangsbegrænsning efter dokumenteret afklaring med systemejeren." />
    <div className="actions"><button className="primary" type="button" disabled={saving||Boolean(stale)||!history||!changes.length} onClick={save}>{saving?'Gemmer ny version…':'Gem som ny rapportversion'}</button><button type="button" disabled={saving} onClick={()=>dirty?setClosing(true):onClose()}>Luk editor</button><small>{new Set(changes.map(change=>`${change.kind}:${change.target_id}`)).size} afsnit med ændringer</small></div>
    {closing&&<div className="notice" role="alert">Du har rettelser, der endnu ikke er gemt.<div className="actions"><button type="button" onClick={()=>setClosing(false)}>Fortsæt redigering</button><button type="button" onClick={discard}>Forkast rettelser og luk</button></div></div>}
    <details className="history"><summary>Versionshistorik på sagen</summary>{!history&&!historyError?<p role="status">Henter historik…</p>:<ol>{asList(history?.items).map(item=><li key={item.id}><Link to={`/vurdering?assessment_id=${encodeURIComponent(item.id)}&case=${encodeURIComponent(assessment.case_db_id || '')}`}>Version {item.version}</Link> · {dateLabel(item.created_at)}{item.editorial_revision?.note&&<p>{item.editorial_revision.note}</p>}</li>)}</ol>}</details>
  </Editor>;
}
