import React, { useState } from 'react';
import axios from 'axios';
import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import { Field } from './WorkflowUi';

async function fetchCases() {
  const response = await axios.get('/api/v3/cases?limit=200');
  return Array.isArray(response.data?.items) ? response.data.items : [];
}

export default function AssessmentCaseSelect({ id, value, onChange }) {
  const query = useQuery('assessment-case-options', fetchCases, { staleTime: 30000, retry: false });
  const [manual, setManual] = useState(false);
  const cases = query.data || [];
  const selected = cases.find(item => item.id === value || item.case_id === value);
  const selection = manual ? '__manual__' : selected?.id || value;
  return <Field>
    <label htmlFor={id}>Sag</label>
    <select id={id} value={selection} aria-describedby={`${id}-help`} onChange={event => {
      if (event.target.value === '__manual__') { setManual(true); return; }
      setManual(false); onChange(event.target.value);
    }}>
      <option value="">{query.isLoading ? 'Henter sager…' : 'Vælg en eksisterende sag…'}</option>
      {value && !selected && !manual && <option value={value}>Valgt sag fra link eller tidligere indtastning</option>}
      {cases.map(item => <option key={item.id} value={item.id}>{item.title || item.system_name || item.case_id || 'Sag'}{item.case_id ? ` · ${item.case_id}` : ''}</option>)}
      <option value="__manual__">Anden sagsreference – indtast selv</option>
    </select>
    {manual && <><label htmlFor={`${id}-manual`}>Eksisterende sagsreference</label><input id={`${id}-manual`} value={value} onChange={event => onChange(event.target.value)} aria-describedby={`${id}-help`} placeholder="Kommunalt sagsnummer eller intern reference" /></>}
    <small id={`${id}-help`}>Vurderingen gemmes på den valgte sag. Listen viser op til 200 sager. Du kan også bruge en eksisterende sagsreference.</small>
    {query.isError && <small role="status">Sagslisten kunne ikke hentes. Du kan indtaste en eksisterende sagsreference eller åbne vurderingen fra sagen.</small>}
    {!query.isLoading && !query.isError && cases.length === 0 && <small>Der er ingen sager i listen. <Link to="/anskaffelse">Opret en AI-løsning og sag først.</Link></small>}
  </Field>;
}
