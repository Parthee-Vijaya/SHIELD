import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useAuth } from '../../contexts/AuthContext';

const Wrap = styled.section`
  margin: 28px 0; min-width: 0; overflow-wrap: anywhere;
  h3 { margin-bottom: 8px; } p { margin-bottom: 12px; }
  details { border-top: 1px solid ${p => p.theme.colors.border}; padding: 14px 0; }
  summary { cursor: pointer; line-height: 1.5; }
  label { display: block; font-size: .88rem; font-weight: 600; margin: 12px 0 6px; }
  input, textarea, select { width: 100%; min-width: 0; padding: 10px; font: inherit; color: ${p => p.theme.colors.text}; background: ${p => p.theme.colors.surface}; border: 1px solid ${p => p.theme.colors.border}; }
  textarea { min-height: 100px; resize: vertical; }
`;
const Fields = styled.div`display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; max-width: 720px; > * {min-width:0;} @media(max-width:600px) {grid-template-columns:1fr; gap:0;}`;
const Button = styled.button`
  margin: 14px 8px 8px 0; padding: 10px 15px; min-height: 44px; border: 1px solid ${p => p.theme.colors.border};
  font: inherit; font-size: .88rem; color: ${p => p.theme.colors.text}; background: transparent;
  &:hover {background: ${p => p.theme.colors.surfaceAlt};} &:disabled {opacity:.5; cursor:default;}
`;
const Note = styled.p`font-size: .86rem; color: ${p => p.theme.colors.textMuted};`;
const Badge = styled.span`display: inline-block; margin: 0 10px 0 0; font-size:.78rem; font-weight:600; color:${p => p.theme.colors.textMuted};`;
const Alert = styled.p`padding:12px; background:${p => p.theme.colors.surfaceAlt}; border-left:3px solid ${p => p.theme.colors.danger};`;
const STATUSES = { open:'Åben', in_progress:'Under afklaring', completed:'Afklaret', dismissed:'Ikke relevant' };

function TaskEditor({ question, item, busy, defaults, create, save }) {
  const id = `clarification-${question.id}`;
  const [owner,setOwner] = useState(item?.owner || defaults.owner);
  const [dueDate,setDueDate] = useState(item?.due_date || defaults.dueDate);
  const [answer,setAnswer] = useState(item?.answer || '');
  const [status,setStatus] = useState(item?.status || 'open');
  const lastSynced = useRef(item ? `${item.id}:${item.updated_at}` : '');
  // Apply a newly loaded revision before the fields become interactive. A passive
  // effect could overwrite the first user change after the response arrives.
  useLayoutEffect(() => {
    if (!item) return;
    const revision = `${item.id}:${item.updated_at}`;
    if (lastSynced.current === revision) return;
    lastSynced.current = revision;
    setOwner(item.owner || ''); setDueDate(item.due_date || '');
    setAnswer(item.answer || ''); setStatus(item.status);
  },[item]);
  const needsAnswer = ['completed','dismissed'].includes(status);
  return <details>
    <summary><Badge>{item ? STATUSES[item.status] : 'Ikke oprettet'}{question.priority === 'high' ? ' · Høj prioritet' : ''}</Badge>{question.question}</summary>
    {question.topic && <Note>{question.topic}</Note>}
    <Fields>
      <div><label htmlFor={`${id}-owner`}>Ansvarlig for afklaringen</label><input id={`${id}-owner`} maxLength={128} value={owner} onChange={event=>setOwner(event.target.value)} placeholder="Fx systemejer eller jura" disabled={busy}/></div>
      <div><label htmlFor={`${id}-due`}>Frist for afklaringen</label><input id={`${id}-due`} type="date" value={dueDate} onChange={event=>setDueDate(event.target.value)} disabled={busy}/></div>
    </Fields>
    {item ? <>
      <label htmlFor={`${id}-answer`}>Svar og dokumentation</label>
      <textarea id={`${id}-answer`} value={answer} maxLength={20000} onChange={event=>setAnswer(event.target.value)} disabled={busy} placeholder="Beskriv afklaringen og henvis til dokument, side eller kontaktperson."/>
      <label htmlFor={`${id}-status`}>Status på afklaringen</label>
      <select id={`${id}-status`} value={status} onChange={event=>setStatus(event.target.value)} disabled={busy}>{Object.entries(STATUSES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      {needsAnswer && answer.trim().length < 20 && <Note>Skriv mindst 20 tegn i svaret eller begrundelsen, før afklaringen afsluttes.</Note>}
      <Button type="button" disabled={busy || (needsAnswer && answer.trim().length < 20)} onClick={()=>save(item,{owner,due_date:dueDate || null,answer,status})}>Gem afklaring</Button>
      <Note>Svaret er sagsdokumentation. Det ændrer ikke automatisk analysen og er ikke en juridisk godkendelse.</Note>
    </> : <Button type="button" disabled={busy} onClick={()=>create([question.id],owner,dueDate)}>Opret opgave</Button>}
  </details>;
}

export default function ClarificationList({ caseId, analysisId, questions = [], sources = [] }) {
  const { authFetch } = useAuth();
  const [items,setItems] = useState([]);
  const [owner,setOwner] = useState('');
  const [dueDate,setDueDate] = useState('');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [loadFailed,setLoadFailed] = useState(false);
  const [message,setMessage] = useState('');
  const active = useRef('');
  const sequence = useRef(0);
  const context = `${caseId}:${analysisId}`;
  active.current = context;
  const base = `/api/v3/cases/${encodeURIComponent(caseId)}/clarifications`;
  const request = useCallback(async (path,options) => {
    const response = await authFetch(path,options);
    const body = await response.json().catch(()=>null);
    if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Afklaringslisten kunne ikke hentes eller gemmes. Prøv igen.');
    return body;
  },[authFetch]);
  const load = useCallback(async () => {
    const key = context;
    const call = ++sequence.current;
    setLoading(true); setError(''); setLoadFailed(false);
    try {
      const body = await request(`${base}?analysis_id=${encodeURIComponent(analysisId)}`);
      if (active.current === key && sequence.current === call) setItems(body.items || []);
    } catch (failure) {
      if (active.current === key && sequence.current === call) { setError(failure instanceof TypeError ? 'Forbindelsen blev afbrudt. Prøv igen.' : failure.message); setLoadFailed(true); }
    } finally { if (active.current === key && sequence.current === call) setLoading(false); }
  },[analysisId,base,context,request]);
  useEffect(() => {
    setItems([]); setOwner(''); setDueDate(''); setMessage(''); setBusy(false);
    if (caseId && analysisId) load(); else setLoading(false);
    return () => { ++sequence.current; };
  },[caseId,analysisId,load]);
  const mutate = async (path,method,payload,success) => {
    const key = context; const call = ++sequence.current;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if (active.current !== key || sequence.current !== call) return;
      if (result.items) setItems(result.items);
      else setItems(previous=>previous.map(item=>item.id===result.id ? result : item));
      setMessage(success);
    } catch (failure) {
      if (active.current === key && sequence.current === call) setError(failure instanceof TypeError ? 'Forbindelsen blev afbrudt. Prøv igen.' : failure.message);
    } finally { if (active.current === key && sequence.current === call) setBusy(false); }
  };
  const create = (ids,assignedOwner=owner,assignedDue=dueDate) => mutate(base,'POST',{
    analysis_id:analysisId,...(ids ? {question_ids:ids} : {}),owner:assignedOwner || null,due_date:assignedDue || null,
  },ids ? 'Afklaringsopgaven er gemt på sagen.' : 'Afklaringslisten er gemt på sagen.');
  const save = (item,changes) => mutate(`${base}/${encodeURIComponent(item.id)}`,'PATCH',{
    expected_updated_at:item.updated_at,...changes,
  },'Svaret og status er gemt på sagen.');
  const byQuestion = Object.fromEntries(items.map(item=>[item.question_id,item]));
  const remaining = questions.filter(question=>!byQuestion[question.id]).length;
  const disabled = loading || busy || loadFailed;
  return <Wrap aria-label="Afklaringsliste">
    <h3>Afklaringsliste</h3>
    <Note>Gør analysens spørgsmål til opgaver med ansvarlig, frist og dokumenterede svar. Opgaverne vises også under Foranstaltninger på sagen.</Note>
    {loading && <p role="status">Henter afklaringer…</p>}
    {error && <Alert role="alert">{error} <Button type="button" disabled={busy} onClick={load}>Hent afklaringer igen</Button></Alert>}
    {message && <p role="status">{message}</p>}
    {!questions.length ? <p>Analysen indeholder ingen afklaringsspørgsmål.</p> : <>
      {remaining > 0 && <details>
        <summary>Opret opgaver samlet ({remaining} mangler)</summary>
        <Fields>
          <div><label htmlFor="clarifications-owner">Fælles ansvarlig</label><input id="clarifications-owner" value={owner} maxLength={128} onChange={event=>setOwner(event.target.value)} disabled={disabled} placeholder="Fx systemejer"/></div>
          <div><label htmlFor="clarifications-date">Fælles frist</label><input id="clarifications-date" type="date" value={dueDate} onChange={event=>setDueDate(event.target.value)} disabled={disabled}/></div>
        </Fields>
        <Button type="button" disabled={disabled} onClick={()=>create()}>Opret afklaringsliste</Button>
        <Note>Eksisterende opgaver og svar bevares.</Note>
      </details>}
      {questions.map(question=><TaskEditor key={`${context}:${question.id}`} question={question} item={byQuestion[question.id]} busy={disabled} defaults={{owner,dueDate}} create={create} save={save}/>)}
      {sources.length > 0 && <Note>Dokumentér svaret med en konkret henvisning til sagens materiale eller et nyt bilag.</Note>}
    </>}
  </Wrap>;
}
