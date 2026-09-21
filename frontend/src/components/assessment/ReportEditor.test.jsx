import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import ReportEditor from './ReportEditor';

jest.mock('../../contexts/AuthContext',()=>({useAuth:jest.fn()}));
jest.mock('./EvidenceNavigator',()=>({__esModule:true,sourceLabel:source=>source.title || source.id,default:({onSelect})=><button disabled={!onSelect} onClick={()=>onSelect('document:1')}>Brug den viste kilde</button>}));
const base={id:'base',case_db_id:'case',version:1,executive_summary:'Tidligere sammenfatning.',scope:'Den oprindelige afgrænsning.',summary_source_ids:[],sections:[{id:'1.1',title:'Formål',text:'Kommunens formål.',source:'provided_input',source_ids:[]},{id:'1.2',title:'Manglende grundlag',text:'Hjemmel skal afklares.',source:'missing_information'}],risks:[{id:'3.1',area:'Adgang',scenario:'Uvedkommende adgang.',measures:'Begræns adgang.',rationale:'En begrundelse.',consequences:'',source_ids:[],residual_risk:'high'}],ai_generation:{sources:[{id:'document:1',title:'Databehandleraftale',text:'Kommunen afgrænser adgangen.'}]}};
const response=(data,ok=true)=>Promise.resolve({ok,json:async()=>data});
let fetcher;
beforeEach(()=>{sessionStorage.clear();fetcher=jest.fn(()=>response({base_id:'base',latest_id:'base',items:[{id:'base',version:1,created_at:'2026-09-20T10:00:00Z'}]}));useAuth.mockReturnValue({authFetch:fetcher});});
afterEach(()=>jest.restoreAllMocks());
function LocationProbe(){const location=useLocation();return <output data-testid="editor-location">{location.pathname}{location.search}{location.hash}</output>;}
const mount=(props={})=>render(<ThemeProvider theme={lightTheme}><MemoryRouter><ReportEditor assessment={base} onSaved={jest.fn()} onClose={jest.fn()} {...props}/><LocationProbe/></MemoryRouter></ThemeProvider>);
const editSummary=()=>{fireEvent.change(screen.getByLabelText('Sammenfatning'),{target:{value:'Den fagligt præciserede sammenfatning.'}});fireEvent.change(screen.getByLabelText('Hvad er ændret, og hvorfor?'),{target:{value:'Præciseret efter faglig gennemgang.'}});};

test('gemmer kun eksplicit tekstændring som ny version og sender aldrig scorer',async()=>{
  const onSaved=jest.fn();mount({onSaved});await screen.findByText('Version 1');expect(fetcher).toHaveBeenCalledTimes(1);
  editSummary();fireEvent.click(screen.getByRole('button',{name:'Brug den viste kilde'}));
  fetcher.mockImplementationOnce(()=>response({...base,id:'revision',version:2}));fireEvent.click(screen.getByRole('button',{name:'Gem som ny rapportversion'}));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({id:'revision'})));
  const [url,options]=fetcher.mock.calls.find(([,options])=>options?.method==='POST');
  expect(url).toBe('/api/dpia/assessments/base/revisions');
  const payload=JSON.parse(options.body);expect(payload.changes).toEqual([{kind:'summary',target_id:'summary',field:'executive_summary',text:'Den fagligt præciserede sammenfatning.',source_ids:['document:1']}]);
  expect(payload).not.toHaveProperty('risk_level');expect(payload).not.toHaveProperty('status');expect(payload.request_id).toMatch(/^[a-f\d-]{36}$/i);
});

test('beskytter låste mangler og en forældet rapportversion',async()=>{
  fetcher.mockResolvedValueOnce({ok:true,json:async()=>({latest_id:'newer',items:[]})});mount();
  expect(await screen.findByRole('link',{name:'Åbn den seneste version'})).toHaveAttribute('href','/vurdering?assessment_id=newer&case=case');
  expect(screen.getByLabelText('Sammenfatning')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Vælg afsnit eller risiko'),{target:{value:'section:1.2'}});
  expect(screen.getByText(/Afsnittet viser manglende oplysninger/)).toBeInTheDocument();expect(screen.queryByLabelText('Afsnittets tekst')).not.toBeInTheDocument();
});

test('bevarer fælles kildehenvisninger når sammenfatning og afgrænsning redigeres',async()=>{
  const onSaved=jest.fn();mount({onSaved});await screen.findByText('Version 1');editSummary();
  fireEvent.click(screen.getByRole('button',{name:'Brug den viste kilde'}));
  fireEvent.change(screen.getByLabelText('Vælg afsnit eller risiko'),{target:{value:'scope:scope'}});
  fireEvent.change(screen.getByLabelText('Afgrænsning'),{target:{value:'Præciseret afgrænsning for den kommunale behandling.'}});
  fetcher.mockImplementationOnce(()=>response({...base,id:'revision',version:2}));fireEvent.click(screen.getByRole('button',{name:'Gem som ny rapportversion'}));
  await waitFor(()=>expect(onSaved).toHaveBeenCalled());
  const payload=JSON.parse(fetcher.mock.calls.find(([,o])=>o?.method==='POST')[1].body);
  expect(payload.changes).toHaveLength(2);expect(payload.changes.every(change=>change.source_ids.includes('document:1'))).toBe(true);
});

test('bevarer ændringer og samme request-id efter en uklar netværksfejl',async()=>{
  const onSaved=jest.fn();mount({onSaved});await screen.findByText('Version 1');editSummary();
  fetcher.mockRejectedValueOnce(new TypeError('Network'));fireEvent.click(screen.getByRole('button',{name:'Gem som ny rapportversion'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('rettelser er bevaret');expect(screen.getByLabelText('Sammenfatning')).toHaveValue('Den fagligt præciserede sammenfatning.');
  fetcher.mockImplementationOnce(()=>response({...base,id:'revision'}));fireEvent.click(screen.getByRole('button',{name:'Gem som ny rapportversion'}));
  await waitFor(()=>expect(fetcher.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(2));
  const posts=fetcher.mock.calls.filter(([,o])=>o?.method==='POST').map(([,o])=>JSON.parse(o.body));expect(posts[0].request_id).toBe(posts[1].request_id);
  await waitFor(()=>expect(onSaved).toHaveBeenCalled());
});

test('taber ikke ugemte rettelser ved et utilsigtet luk',async()=>{
  const onClose=jest.fn();mount({onClose});await screen.findByText('Version 1');editSummary();fireEvent.click(screen.getByRole('button',{name:'Luk editor'}));
  expect(onClose).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Fortsæt redigering'}));expect(screen.getByLabelText('Sammenfatning')).toHaveValue('Den fagligt præciserede sammenfatning.');
});

test('gendanner kladde, noter, afsnit og fælles kilder efter genåbning',async()=>{
  const first=mount();await screen.findByText('Version 1');editSummary();
  fireEvent.click(screen.getByRole('button',{name:'Brug den viste kilde'}));
  fireEvent.change(screen.getByLabelText('Vælg afsnit eller risiko'),{target:{value:'scope:scope'}});
  fireEvent.change(screen.getByLabelText('Afgrænsning'),{target:{value:'En kladde til den præciserede afgrænsning.'}});
  first.unmount();mount();await screen.findByText('Version 1');
  expect(screen.getByLabelText('Vælg afsnit eller risiko')).toHaveValue('scope:scope');
  expect(screen.getByLabelText('Afgrænsning')).toHaveValue('En kladde til den præciserede afgrænsning.');
  expect(screen.getByLabelText('Hvad er ændret, og hvorfor?')).toHaveValue('Præciseret efter faglig gennemgang.');
  expect(screen.getByRole('button',{name:'Fjern kilde Databehandleraftale'})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Vælg afsnit eller risiko'),{target:{value:'summary:summary'}});
  expect(screen.getByLabelText('Sammenfatning')).toHaveValue('Den fagligt præciserede sammenfatning.');
  expect(fetcher.mock.calls.some(([,options])=>options?.method==='POST')).toBe(false);
});

test('kladden tilhører kun den aktuelle rapportversion',async()=>{
  const first=mount();await screen.findByText('Version 1');editSummary();first.unmount();
  const second=mount({assessment:{...base,id:'another'}});
  await screen.findByText('Version 1');
  expect(screen.getByLabelText('Sammenfatning')).toHaveValue(base.executive_summary);
  expect(screen.getByLabelText('Hvad er ændret, og hvorfor?')).toHaveValue('');
  second.unmount();mount();await screen.findByText('Version 1');
  expect(screen.getByLabelText('Sammenfatning')).toHaveValue('Den fagligt præciserede sammenfatning.');
});

test('eksplicit forkast fjerner kladden og genåbner originalteksten',async()=>{
  const onClose=jest.fn();const first=mount({onClose});await screen.findByText('Version 1');editSummary();
  expect(sessionStorage.getItem('shield-report-draft:v1:base')).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Luk editor'}));fireEvent.click(screen.getByRole('button',{name:'Forkast rettelser og luk'}));
  expect(onClose).toHaveBeenCalledTimes(1);expect(sessionStorage.getItem('shield-report-draft:v1:base')).toBeNull();
  first.unmount();mount();await screen.findByText('Version 1');expect(screen.getByLabelText('Sammenfatning')).toHaveValue(base.executive_summary);
});

test('en vellykket gemning fjerner kladden inklusive ændringsnotatet',async()=>{
  const onSaved=jest.fn();const first=mount({onSaved});await screen.findByText('Version 1');editSummary();
  fetcher.mockImplementationOnce(()=>response({...base,id:'revision',version:2}));
  fireEvent.click(screen.getByRole('button',{name:'Gem som ny rapportversion'}));
  await waitFor(()=>expect(onSaved).toHaveBeenCalled());
  expect(sessionStorage.getItem('shield-report-draft:v1:base')).toBeNull();
  first.unmount();mount();await screen.findByText('Version 1');expect(screen.getByLabelText('Hvad er ændret, og hvorfor?')).toHaveValue('');
});

test('advarer kun ved reelt ugemte rettelser, også et ændringsnotat alene',async()=>{
  mount();await screen.findByText('Version 1');
  const clean=new Event('beforeunload',{cancelable:true});window.dispatchEvent(clean);expect(clean.defaultPrevented).toBe(false);
  fireEvent.change(screen.getByLabelText('Hvad er ændret, og hvorfor?'),{target:{value:'En ugemt faglig observation.'}});
  const dirty=new Event('beforeunload',{cancelable:true});window.dispatchEvent(dirty);expect(dirty.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Luk editor'}));expect(screen.getByRole('button',{name:'Forkast rettelser og luk'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Fortsæt redigering'}));
  fireEvent.change(screen.getByLabelText('Hvad er ændret, og hvorfor?'),{target:{value:''}});
  const reverted=new Event('beforeunload',{cancelable:true});window.dispatchEvent(reverted);expect(reverted.defaultPrevented).toBe(false);
  expect(sessionStorage.getItem('shield-report-draft:v1:base')).toBeNull();
});

test('navigation viser en indbygget dialog og afbrydelse bevarer kladden',async()=>{
  mount();await screen.findByText('Version 1');editSummary();
  const confirm=jest.spyOn(window,'confirm');
  const anchor=document.createElement('a');anchor.href='/sager';document.body.appendChild(anchor);
  try {
    expect(fireEvent.click(anchor)).toBe(false);
    expect(screen.getByRole('dialog',{name:'Forlad rapportudkastet?'})).toBeInTheDocument();
    expect(screen.getByTestId('editor-location')).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('button',{name:'Fortsæt redigering'})).toHaveFocus();
    fireEvent.click(screen.getByRole('button',{name:'Fortsæt redigering'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Sammenfatning')).toHaveValue('Den fagligt præciserede sammenfatning.');
    expect(confirm).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('shield-report-draft:v1:base')).not.toBeNull();
  } finally {anchor.remove();}
});

test('bekræftet intern navigation åbner destinationen og bevarer kladden',async()=>{
  mount();await screen.findByText('Version 1');editSummary();
  const anchor=document.createElement('a');anchor.href='/sager?status=open#opgaver';document.body.appendChild(anchor);
  try {
    fireEvent.click(anchor);
    fireEvent.click(screen.getByRole('button',{name:'Forlad editor og bevar kladde'}));
    expect(screen.getByTestId('editor-location')).toHaveTextContent('/sager?status=open#opgaver');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem('shield-report-draft:v1:base')).note).toBe('Præciseret efter faglig gennemgang.');
  } finally {anchor.remove();}
});

test('defekt browserkladde ignoreres uden at ødelægge editoren',async()=>{
  sessionStorage.setItem('shield-report-draft:v1:base',JSON.stringify({version:1,assessment_id:'base',selected:'summary:summary',note:'',edits:{'summary:summary':{fields:{},source_ids:[]}}}));
  mount();await screen.findByText('Version 1');
  expect(screen.getByLabelText('Sammenfatning')).toHaveValue(base.executive_summary);
  expect(screen.getByRole('button',{name:'Gem som ny rapportversion'})).toBeDisabled();
});
