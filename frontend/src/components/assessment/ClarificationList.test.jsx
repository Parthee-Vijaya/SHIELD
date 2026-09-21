import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import ClarificationList from './ClarificationList';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));

const questions = [{ id:'dpa',question:'Foreligger der en databehandleraftale?',topic:'Aftalegrundlag',priority:'high' }];
const task = {id:'task-1',question_id:'dpa',analysis_id:'analysis-a',status:'open',owner:'Jura',due_date:'2026-10-15',answer:'',updated_at:'2026-09-21T12:00:00Z'};
const reply = (body,ok=true) => Promise.resolve({ok,json:async()=>body});
const view = (caseId='case-a',analysisId='analysis-a') => <ThemeProvider theme={lightTheme}><ClarificationList caseId={caseId} analysisId={analysisId} questions={questions} sources={[]}/></ThemeProvider>;
let authFetch;

beforeEach(()=>{ authFetch=jest.fn(); useAuth.mockReturnValue({authFetch}); });

test('viewing questions only loads tasks, explicit creation submits server-bound identifiers', async()=>{
  authFetch.mockImplementation((path,options)=>options?.method==='POST' ? reply({items:[task],count:1}) : reply({items:[],count:0}));
  render(view());
  await waitFor(()=>expect(screen.getByRole('button',{name:'Opret opgave'})).toBeEnabled());
  expect(authFetch).toHaveBeenCalledTimes(1);
  expect(authFetch.mock.calls[0][0]).toBe('/api/v3/cases/case-a/clarifications?analysis_id=analysis-a');
  fireEvent.change(screen.getByLabelText('Ansvarlig for afklaringen'),{target:{value:'Jura'}});
  fireEvent.change(screen.getByLabelText('Frist for afklaringen'),{target:{value:'2026-10-15'}});
  fireEvent.click(screen.getByRole('button',{name:'Opret opgave'}));
  expect(await screen.findByText('Afklaringsopgaven er gemt på sagen.')).toBeInTheDocument();
  const request = authFetch.mock.calls.find(([,options])=>options?.method==='POST');
  expect(JSON.parse(request[1].body)).toEqual({analysis_id:'analysis-a',question_ids:['dpa'],owner:'Jura',due_date:'2026-10-15'});
  expect(screen.getByLabelText('Ansvarlig for afklaringen')).toHaveValue('Jura');
});

test('bulk creation is explicit and preserves existing answers returned by server', async()=>{
  authFetch.mockImplementation((path,options)=>options?.method==='POST' ? reply({items:[{...task,answer:'Aftalen skal indhentes hos leverandøren.'}],count:1}) : reply({items:[],count:0}));
  render(view());
  await waitFor(()=>expect(screen.getByRole('button',{name:'Opret afklaringsliste'})).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Fælles ansvarlig'),{target:{value:'Systemejer'}});
  fireEvent.click(screen.getByRole('button',{name:'Opret afklaringsliste'}));
  await screen.findByText('Afklaringslisten er gemt på sagen.');
  const sent=JSON.parse(authFetch.mock.calls.find(([,options])=>options?.method==='POST')[1].body);
  expect(sent).toEqual({analysis_id:'analysis-a',owner:'Systemejer',due_date:null});
  expect(screen.getByLabelText('Svar og dokumentation')).toHaveValue('Aftalen skal indhentes hos leverandøren.');
});

test('closing requires a substantive answer and sends the persisted revision', async()=>{
  authFetch.mockImplementation((path,options)=>options?.method==='PATCH' ? reply({...task,status:'completed',answer:'Aftalen ligger i dokumentbanken som bilag 2.',updated_at:'new-version'}) : reply({items:[task],count:1}));
  render(view());
  await screen.findByLabelText('Svar og dokumentation');
  fireEvent.change(screen.getByLabelText('Status på afklaringen'),{target:{value:'completed'}});
  expect(screen.getByRole('button',{name:'Gem afklaring'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Svar og dokumentation'),{target:{value:'Aftalen ligger i dokumentbanken som bilag 2.'}});
  fireEvent.click(screen.getByRole('button',{name:'Gem afklaring'}));
  await screen.findByText('Svaret og status er gemt på sagen.');
  const submitted = authFetch.mock.calls.find(([,options])=>options?.method==='PATCH');
  expect(submitted[0]).toBe('/api/v3/cases/case-a/clarifications/task-1');
  expect(JSON.parse(submitted[1].body)).toMatchObject({status:'completed',expected_updated_at:task.updated_at,answer:'Aftalen ligger i dokumentbanken som bilag 2.'});
  expect(screen.getByText(/Det ændrer ikke automatisk analysen/)).toBeInTheDocument();
});

test('revision conflict keeps the unsaved answer visible and offers reload', async()=>{
  authFetch.mockImplementation((path,options)=>options?.method==='PATCH' ? reply({detail:'Afklaringen er ændret af en anden bruger. Hent den igen.'},false) : reply({items:[task],count:1}));
  render(view());
  await screen.findByLabelText('Svar og dokumentation');
  fireEvent.change(screen.getByLabelText('Svar og dokumentation'),{target:{value:'Mit endnu ikke gemte svar.'}});
  fireEvent.click(screen.getByRole('button',{name:'Gem afklaring'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('ændret af en anden bruger');
  expect(screen.getByLabelText('Svar og dokumentation')).toHaveValue('Mit endnu ikke gemte svar.');
  expect(screen.getByRole('button',{name:'Hent afklaringer igen'})).toBeEnabled();
  expect(screen.queryByText('Svaret og status er gemt på sagen.')).not.toBeInTheDocument();
});

test('a delayed mutation on an old case cannot replace the new case tasks', async()=>{
  let resolveCreate;
  authFetch.mockImplementation((path,options)=>{
    if(options?.method==='POST') return new Promise(resolve=>{resolveCreate=resolve;});
    return reply({items:[],count:0});
  });
  const {rerender}=render(view());
  await waitFor(()=>expect(screen.getByRole('button',{name:'Opret opgave'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Opret opgave'}));
  rerender(view('case-b','analysis-b'));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Opret opgave'})).toBeEnabled());
  await act(async()=>resolveCreate({ok:true,json:async()=>({items:[task]})}));
  expect(screen.queryByLabelText('Svar og dokumentation')).not.toBeInTheDocument();
  expect(screen.queryByText('Afklaringsopgaven er gemt på sagen.')).not.toBeInTheDocument();
});

test('creating another task preserves an unsaved answer on an unchanged existing task', async()=>{
  const another = {id:'hosting',question:'Hvor hostes oplysningerne?',priority:'normal'};
  authFetch.mockImplementation((path,options)=>options?.method==='POST'
    ? reply({items:[{...task},{...task,id:'task-2',question_id:'hosting'}]})
    : reply({items:[task]}));
  render(<ThemeProvider theme={lightTheme}><ClarificationList caseId="case-a" analysisId="analysis-a" questions={[...questions,another]}/></ThemeProvider>);
  await screen.findByLabelText('Svar og dokumentation');
  fireEvent.change(screen.getByLabelText('Svar og dokumentation'),{target:{value:'Et svar der endnu ikke er gemt.'}});
  fireEvent.click(screen.getByRole('button',{name:'Opret opgave'}));
  await screen.findByText('Afklaringsopgaven er gemt på sagen.');
  expect(screen.getAllByLabelText('Svar og dokumentation')[0]).toHaveValue('Et svar der endnu ikke er gemt.');
});
