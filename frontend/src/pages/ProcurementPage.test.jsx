import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import ProcurementPage from './ProcurementPage';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));

const profile = { system_name:'Pladsanvisning', supplier_name:'Fiktiv leverandør', organisation:'Testkommune', department:'Børn og Familie', owner:'Systemejer', intended_use:'Understøttelse af pladsanvisning i kommunens dagtilbud.', procurement_stage:'new_purchase', journal_reference:'', revision:1 };
const source = { id:'source-1', title:'Leverandørens præsentation', uploaded_at:'2026-09-20T10:00:00Z', original_filename:'præsentation.pptx', download_url:'/source-download', warnings:[], excerpts:[{id:'excerpt-1',locator:'Slide 2',text:'Løsningen leveres som SaaS fra EU.'}] };
const fact = (id,field,value) => ({id,field,value,label:field,source_refs:[{source_id:'excerpt-1',quote:'Løsningen leveres som SaaS fra EU.'}]});
const analysis = { id:'analysis-1', created_at:'2026-09-20T10:00:00Z', summary:'Forslag til gennemgang.', outdated:false, facts:[fact('f1','solution_type','saas'),fact('f2','hosting_region','eu_eea'),fact('f3','special_categories',false),fact('f4','data_subjects',['other']),fact('f5','personal_data_categories',['other'])], sources:[{id:'excerpt-1',title:source.title,locator:'Slide 2'}], questions:[{id:'q1',question:'Hvilke underdatabehandlere anvendes?',priority:'high'}], conflicts:[], review:{checks:[{id:'fact:f2',requires_review:true}]} };
const analysisLimits = {batching_enabled:true,max_documents:25,max_total_text_chars:500000,max_document_text_chars:200000,max_batches:20,max_case_documents:100,max_case_text_chars:5000000,max_case_excerpts:10000};
const reply = (body,ok=true) => Promise.resolve({ok,json:async()=>body});
let authFetch;

function NavigationProbe() {
  const navigate=useNavigate();
  const location=useLocation();
  return <><output data-testid="location">{location.pathname}{location.search}</output><button onClick={()=>navigate('/anskaffelse?case=case-b&step=profile')}>Skift sag i testen</button><button onClick={()=>navigate('/anskaffelse')}>Ny sag i testen</button></>;
}
function mount(url='/anskaffelse?case=case-a&step=profile') {
  return render(<ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={[url]}><ProcurementPage/><NavigationProbe/></MemoryRouter></ThemeProvider>);
}
function mockCase({currentAnalysis=null,review=null,materials=[],analysisLimits=null}={}) {
  authFetch.mockImplementation((path,options)=> {
    if (!options?.method && path.endsWith('/procurement')) return reply({profile,analysis:currentAnalysis,review});
    if (!options?.method && path.endsWith('/source-material')) return reply({items:materials,analysis_limits:analysisLimits});
    if (!options?.method && path.includes('/clarifications?')) return reply({items:[]});
    throw new Error(`Unexpected request ${path}`);
  });
}
beforeEach(()=>{
  authFetch=jest.fn();
  useAuth.mockReturnValue({authFetch});
});

test('creates a municipal procurement and loads its empty material state without a null-review crash', async()=>{
  authFetch.mockImplementation((path,options)=>{
    if(path==='/api/v3/procurements' && options.method==='POST') return reply({case_id:'case-created',profile});
    if(path.endsWith('/procurement')) return reply({profile,analysis:null,review:null});
    if(path.endsWith('/source-material')) return reply({items:[]});
    throw new Error(`Unexpected request ${path}`);
  });
  mount('/anskaffelse');
  expect(authFetch).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Løsningens navn')).toBeRequired();
  expect(screen.getByLabelText('Kommunens påtænkte anvendelse')).toHaveAttribute('minlength','20');
  fireEvent.change(screen.getByLabelText('Løsningens navn'),{target:{value:profile.system_name}});
  fireEvent.change(screen.getByLabelText('Ansvarlig for sagen'),{target:{value:profile.owner}});
  fireEvent.change(screen.getByLabelText('Kommunens påtænkte anvendelse'),{target:{value:profile.intended_use}});
  fireEvent.click(screen.getByRole('button',{name:'Gem og tilføj materiale →'}));
  expect(await screen.findByRole('heading',{name:'Saml leverandørmaterialet'})).toBeInTheDocument();
  const create=authFetch.mock.calls.find(([path])=>path==='/api/v3/procurements');
  expect(JSON.parse(create[1].body)).toMatchObject({system_name:profile.system_name,owner:profile.owner,intended_use:profile.intended_use,procurement_stage:'new_purchase'});
  expect(screen.getByTestId('location')).toHaveTextContent('case=case-created&step=materials');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Analysér leverandørmateriale →'})).toBeDisabled();
});

test.each(['profile', 'materials', 'facts', 'review'])('shows the case organisation throughout %s without displaying the default municipality while loading', async step=>{
  mockCase({currentAnalysis:analysis,review:{id:'review-1',analysis_id:analysis.id,accepted_fact_ids:[],note:''}});
  mount(`/anskaffelse?case=case-a&step=${step}`);
  expect(screen.queryByText('Sagens organisation:')).not.toBeInTheDocument();
  const label=await screen.findByText('Sagens organisation:');
  expect(label.closest('p')).toHaveTextContent('Sagens organisation: Testkommune');
  expect(label.closest('p')).not.toHaveTextContent('Kalundborg');
});

test('uses the server analysis capacity and Danish number formatting', async()=>{
  mockCase({analysisLimits:{max_documents:30,max_total_text_chars:600000,max_document_text_chars:250000}});
  mount('/anskaffelse?case=case-a&step=materials');
  expect(await screen.findByText('Analysen kan omfatte op til 30 dokumenter og 600.000 tegn i alt, højst 250.000 tegn pr. dokument.')).toBeInTheDocument();
  expect(screen.queryByText(/Større dokumentpakker opdeles automatisk/)).not.toBeInTheDocument();
});

test('explains automatic batching with separate overall and per-part limits', async()=>{
  mockCase({analysisLimits});
  mount('/anskaffelse?case=case-a&step=materials');
  expect(await screen.findByText(/Større dokumentpakker opdeles automatisk og samles til én analyse/)).toBeInTheDocument();
  const capacity = screen.getByText('Kapacitet for automatisk analyse').closest('details');
  expect(capacity).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('Kapacitet for automatisk analyse'));
  expect(screen.getByText('Én samlet analyse kan behandle op til 100 dokumenter og hjemmesider, 5.000.000 tegn og 10.000 kildeuddrag, fordelt på højst 20 dele.')).toBeVisible();
  expect(screen.getByText('Hver del kan omfatte op til 25 dokumenter og 500.000 tegn, højst 200.000 tegn pr. kildeuddrag.')).toBeVisible();
});

test('shows the batching workflow while waiting without inventing completed steps', async()=>{
  mockCase({analysisLimits,materials:[source]});
  mount('/anskaffelse?case=case-a&step=materials');
  await screen.findByRole('heading',{name:'Saml leverandørmaterialet'});
  authFetch.mockImplementation(()=>new Promise(()=>{}));
  fireEvent.click(screen.getByRole('button',{name:'Analysér leverandørmateriale →'}));
  expect(screen.getByText('AI gennemgår materialet, samler eventuelle delanalyser og kører JEV-kontrol…')).toHaveAttribute('role','status');
  expect(screen.queryByText(/delanalyser samlet til én analyse/)).not.toBeInTheDocument();
});

test('shows completed recorded batches on the saved analysis without calling AI again', async()=>{
  mockCase({currentAnalysis:{...analysis,batching:{strategy:'map-reduce-v1',batch_count:3,source_count:1200,source_text_chars:620000}}});
  mount('/anskaffelse?case=case-a&step=facts');
  expect(await screen.findByText('3 delanalyser samlet til én analyse')).toBeInTheDocument();
  expect(screen.getByText(/1.200 kildeuddrag er fordelt på delanalyserne/)).toHaveTextContent('620.000 tegn');
  expect(authFetch.mock.calls.filter(([,options])=>options?.method==='POST')).toHaveLength(0);
});

test('displays field-specific Danish fact labels and requires explicit checkbox choices', async()=>{
  mockCase({currentAnalysis:analysis,materials:[source]});
  mount('/anskaffelse?case=case-a&step=facts');
  await screen.findByRole('heading',{name:'Gennemgå oplysninger og kilder'});
  expect(screen.queryByText(/delanalyser samlet til én analyse/)).not.toBeInTheDocument();
  expect(screen.getByText('Cloud/SaaS-løsning')).toBeInTheDocument();
  expect(screen.getByText('EU/EØS')).toBeInTheDocument();
  expect(screen.getByText('Andre registrerede')).toBeInTheDocument();
  expect(screen.getByText('Andre personoplysninger')).toBeInTheDocument();
  expect(screen.getAllByRole('checkbox').every(input=>!input.checked)).toBe(true);
  expect(screen.getByText(/Kildegrundlaget er markeret af JEV/)).toBeInTheDocument();
  const review={id:'review-1',analysis_id:analysis.id,accepted_fact_ids:['f1'],note:'Gennemgås med jura.'};
  authFetch.mockImplementation((path,options)=>path.endsWith('/procurement/review') ? reply(review) : Promise.reject(new Error('Unexpected request')));
  fireEvent.click(screen.getByRole('checkbox',{name:/Løsningstype Cloud\/SaaS/}));
  fireEvent.change(screen.getByLabelText('Notat til den videre gennemgang'),{target:{value:review.note}});
  fireEvent.click(screen.getByRole('button',{name:'Gem gennemgang og fortsæt →'}));
  expect(await screen.findByRole('heading',{name:'Et fælles grundlag for vurdering og jura'})).toBeInTheDocument();
  const submitted=authFetch.mock.calls.find(([path])=>path.endsWith('/procurement/review'));
  expect(JSON.parse(submitted[1].body)).toEqual({analysis_id:'analysis-1',accepted_fact_ids:['f1'],note:review.note});
  expect(screen.getByRole('link',{name:'Fortsæt til konsekvensanalyse →'})).toHaveAttribute('href','/vurdering?case=case-a&procurement_review=review-1');
});

test('outdated analysis cannot be accepted or continued through a saved review', async()=>{
  mockCase({currentAnalysis:{...analysis,outdated:true},review:{id:'review-old',analysis_id:'analysis-1',accepted_fact_ids:['f1'],note:''}});
  mount('/anskaffelse?case=case-a&step=facts');
  await screen.findByRole('heading',{name:'Gennemgå oplysninger og kilder'});
  expect(screen.getAllByRole('checkbox').every(input=>input.disabled)).toBe(true);
  expect(screen.getByRole('button',{name:'Gem gennemgang og fortsæt →'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'4. Vurdering og jura'})).toBeDisabled();
});

test('upload uses the databehandleraftale enum and refreshes sources before analysis', async()=>{
  let material=[];
  authFetch.mockImplementation((path,options)=>{
    if(path.endsWith('/source-material') && options?.method==='POST') {material=[source]; return reply(source);}
    if(path.endsWith('/procurement')) return reply({profile,analysis:null,review:null});
    if(path.endsWith('/source-material')) return reply({items:material});
    throw new Error('Unexpected request');
  });
  mount('/anskaffelse?case=case-a&step=materials');
  await screen.findByRole('heading',{name:'Saml leverandørmaterialet'});
  fireEvent.change(screen.getByLabelText('Dokumenttype'),{target:{value:'data_processing_agreement'}});
  const file=new File(['aftaleindhold'],'aftale.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  fireEvent.change(screen.getByLabelText('Vælg filer'),{target:{files:[file]}});
  expect(await screen.findByText('1 dokument er gemt på sagen.')).toBeInTheDocument();
  const upload=authFetch.mock.calls.find(([,options])=>options?.body instanceof FormData);
  expect(upload[1].body.get('category')).toBe('data_processing_agreement');
  expect(upload[1].body.get('file').name).toBe('aftale.docx');
  expect(screen.getByRole('heading',{name:source.title})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Analysér leverandørmateriale →'})).toBeEnabled();
});

test('successful earlier uploads remain visible when a later file fails', async()=>{
  let saved=0;
  authFetch.mockImplementation((path,options)=>{
    if(path.endsWith('/source-material') && options?.method==='POST') {saved+=1; return saved===1 ? reply(source) : reply({detail:'Filen er for stor.'},false);}
    if(path.endsWith('/procurement')) return reply({profile,analysis:null,review:null});
    if(path.endsWith('/source-material')) return reply({items:saved ? [source] : []});
    throw new Error('Unexpected request');
  });
  mount('/anskaffelse?case=case-a&step=materials');
  await screen.findByRole('heading',{name:'Saml leverandørmaterialet'});
  fireEvent.change(screen.getByLabelText('Vælg filer'),{target:{files:[new File(['a'],'første.pptx'),new File(['b'],'anden.pptx')]}});
  expect(await screen.findByRole('alert')).toHaveTextContent('Filen er for stor.');
  expect(screen.getByRole('heading',{name:source.title})).toBeInTheDocument();
  expect(screen.queryByText('2 dokumenter er gemt på sagen.')).not.toBeInTheDocument();
});

test('website import keeps the public URL and server failures leave it editable', async()=>{
  mockCase();
  mount('/anskaffelse?case=case-a&step=materials');
  await screen.findByRole('heading',{name:'Saml leverandørmaterialet'});
  authFetch.mockImplementation(()=>reply({detail:'Hjemmesiden kunne ikke hentes.'},false));
  fireEvent.change(screen.getByLabelText('Offentligt leverandørlink'),{target:{value:'https://example.com/fagsystem'}});
  fireEvent.click(screen.getByRole('button',{name:'Tilføj hjemmeside'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Hjemmesiden kunne ikke hentes.');
  expect(screen.getByLabelText('Offentligt leverandørlink')).toHaveValue('https://example.com/fagsystem');
  const call=authFetch.mock.calls.find(([path])=>path.endsWith('/source-material/url'));
  expect(JSON.parse(call[1].body)).toEqual({url:'https://example.com/fagsystem',category:'supplier_documentation'});
});

test('switching cases aborts previous loads and late responses never overwrite the new case', async()=>{
  const pending=[];
  authFetch.mockImplementation((path,options)=>{
    if(path.includes('/case-a/')) return new Promise(resolve=>pending.push({path,options,resolve}));
    if(path.endsWith('/procurement')) return reply({profile:{...profile,system_name:'Nyt omsorgssystem'},analysis:null,review:null});
    return reply({items:[]});
  });
  mount();
  expect(pending).toHaveLength(2);
  fireEvent.click(screen.getByRole('button',{name:'Skift sag i testen'}));
  await screen.findByRole('heading',{level:1,name:'Nyt omsorgssystem'});
  expect(pending.every(item=>item.options.signal.aborted)).toBe(true);
  await act(async()=>{pending.forEach(item=>item.resolve({ok:true,json:async()=>item.path.endsWith('/procurement') ? {profile,analysis,review:{analysis_id:analysis.id,accepted_fact_ids:['f1'],note:'Tidligere sag'}} : {items:[source]}}));});
  expect(screen.getByRole('heading',{level:1,name:'Nyt omsorgssystem'})).toBeInTheDocument();
  expect(screen.getByLabelText('Løsningens navn')).toHaveValue('Nyt omsorgssystem');
  expect(screen.queryByText('Tidligere sag')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ny sag i testen'}));
  expect(await screen.findByLabelText('Løsningens navn')).toHaveValue('');
});

test('failed case load does not expose stale editable data and supports retry', async()=>{
  mockCase();
  mount();
  await screen.findByRole('heading',{level:1,name:profile.system_name});
  authFetch.mockImplementation(()=>reply({detail:'Sagen kunne ikke hentes.'},false));
  fireEvent.click(screen.getByRole('button',{name:'Skift sag i testen'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sagen kunne ikke hentes.');
  expect(screen.queryByText('Sagens organisation:')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Løsningens navn')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading',{level:1,name:profile.system_name})).not.toBeInTheDocument();
  mockCase();
  fireEvent.click(screen.getByRole('button',{name:'Hent oplysninger igen'}));
  expect(await screen.findByLabelText('Løsningens navn')).toHaveValue(profile.system_name);
});


test('late analysis from the previous case cannot navigate back or set stale facts', async()=>{
  let resolveAnalysis;
  authFetch.mockImplementation((path,options)=>{
    if(path.endsWith('/procurement/analyze')) return new Promise(resolve=>{resolveAnalysis=resolve;});
    if(path.endsWith('/procurement')) return reply({profile:{...profile,system_name:path.includes('/case-b/')?'Ny AI-løsning':'Oprindelig sag'},analysis:null,review:null});
    return reply({items:[source]});
  });
  mount('/anskaffelse?case=case-a&step=materials');
  await screen.findByRole('heading',{name:'Saml leverandørmaterialet'});
  fireEvent.click(screen.getByRole('button',{name:'Analysér leverandørmateriale →'}));
  fireEvent.click(screen.getByRole('button',{name:'Skift sag i testen'}));
  await screen.findByRole('heading',{level:1,name:'Ny AI-løsning'});
  await act(async()=>{resolveAnalysis({ok:true,json:async()=>analysis});});
  expect(screen.getByTestId('location')).toHaveTextContent('case=case-b&step=profile');
  expect(screen.getByRole('heading',{level:1,name:'Ny AI-løsning'})).toBeInTheDocument();
  expect(screen.queryByText('Forslag til gennemgang.')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});


test('summary and conflict flags are visible alongside actual generation provenance', async()=>{
  const checkedAnalysis={...analysis,model:'gpt-5.6-sol',generation_provider:'codex-local-test',
    conflicts:[{id:'c1',description:'Opbevaringsfristen beskrives forskelligt.',source_refs:analysis.facts[0].source_refs}],
    review:{model:'typesafe-ai/jev',checks:[{id:'summary',requires_review:true},{id:'fact:f1',requires_review:false},{id:'conflict:c1',requires_review:true}]}};
  mockCase({currentAnalysis:checkedAnalysis});
  mount('/anskaffelse?case=case-a&step=facts');
  await screen.findByRole('heading',{name:'Gennemgå oplysninger og kilder'});
  expect(screen.getByText(/JEV har markeret sammenfatningen/)).toBeInTheDocument();
  expect(screen.getByText(/JEV har markeret denne beskrivelse af modstridende oplysninger/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Om analysen og kildekontrollen'));
  expect(screen.getByText('gpt-5.6-sol')).toBeVisible();
  expect(screen.getByText('Codex · lokal kørsel')).toBeVisible();
  expect(screen.getByText(/typesafe-ai\/jev · 3 kontrolpunkter, heraf 2 markeret/)).toBeVisible();
  expect(screen.getByText(/Det er ikke en juridisk godkendelse eller en garanti/)).toBeVisible();
  expect(screen.queryByText('codex-local-test')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Gem gennemgang og fortsæt →'})).toBeEnabled();
});
