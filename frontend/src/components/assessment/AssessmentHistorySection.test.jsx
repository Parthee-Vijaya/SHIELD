import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import AssessmentHistorySection from './AssessmentHistorySection';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
const saved={ id:'v3',project_name:'Kommunal mødeassistent',version:3,category:'dpia',category_label:'Konsekvensanalyse og risikovurdering',case_db_id:'case-1',case_id:'K-1',created_at:'2026-09-20T10:00:00',initiated_at:'2026-09-20T09:00:00Z',owner:'Rapportansvarlig',created_by:'Sagsbehandler',status:'requires_action',status_label:'Kræver handling',href:'/vurdering?assessment_id=v3&case=case-1'};
const group={id:'dpia:case:case-1',category:'dpia',category_label:saved.category_label,latest:saved,version_count:3,older_versions:[{...saved,id:'v2',version:2,href:'/vurdering?assessment_id=v2&case=case-1'},{...saved,id:'v1',version:1,href:'/vurdering?assessment_id=v1&case=case-1'}]};
function mount(authFetch){
 useAuth.mockReturnValue({authFetch,user:{oid:'history-test'}});
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<ThemeProvider theme={lightTheme}><QueryClientProvider client={client}><MemoryRouter><AssessmentHistorySection/></MemoryRouter></QueryClientProvider></ThemeProvider>);
 return client;
}
const response=items=>({ok:true,json:async()=>({count:items.length,version_count:items.reduce((n,g)=>n+g.version_count,0),items})});

test('seneste version står først med ejer og separate start/gemmetid; ældre kan foldes ud og åbnes præcist',async()=>{
 const client=mount(jest.fn(async()=>response([group])));
 const latest=await screen.findByRole('article',{name:'Kommunal mødeassistent · Version 3'});
 expect(within(latest).getByText('Rapportansvarlig')).toBeInTheDocument();
 expect(within(latest).getByText('Igangsat')).toBeInTheDocument();
 expect(within(latest).getByText('Version gemt')).toBeInTheDocument();
 expect(within(latest).getByText('Sagsbehandler')).toBeInTheDocument();
 expect(within(latest).getByRole('link',{name:'Kommunal mødeassistent'})).toHaveAttribute('href','/vurdering?assessment_id=v3&case=case-1');
 expect(screen.getByRole('article',{name:'Kommunal mødeassistent · Version 1'})).not.toBeVisible();
 fireEvent.click(screen.getByText(/Tidligere versioner \(2\)/));
 expect(screen.getByRole('article',{name:'Kommunal mødeassistent · Version 1'})).toBeVisible();
 expect(within(screen.getByRole('article',{name:'Kommunal mødeassistent · Version 1'})).getByRole('link',{name:'Kommunal mødeassistent'})).toHaveAttribute('href','/vurdering?assessment_id=v1&case=case-1');
 client.clear();
});

test('ukendt version og start/ejer bliver ikke opdigtet, aktuel sagsansvarlig mærkes særskilt',async()=>{
 const item={id:'old',category:'legal_screening',category_label:'Juridisk screening',created_at:null,project_name:null,case_owner:'Nuværende sagsansvarlig',href:'/historik/old'};
 const client=mount(jest.fn(async()=>response([{id:'legacy',latest:item,version_count:1,older_versions:[]}])));
 expect(await screen.findByText(/Seneste version · Version ikke registreret/)).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Løsningsnavn ikke registreret'})).toHaveAttribute('href','/historik/old');
 expect(screen.getByText('Sagsansvarlig (aktuel)')).toBeInTheDocument();
 expect(screen.getAllByText('Ikke registreret')).toHaveLength(3);
 expect(screen.queryByText(/Version 1$/)).not.toBeInTheDocument();
 client.clear();
});

test('pagination gælder vurderingsspor, og kategori/status skifter til første side',async()=>{
 const authFetch=jest.fn(async url=>({ok:true,json:async()=>({count:9,version_count:11,items:[url.includes('offset=8')?{...group,id:'next',latest:{...saved,project_name:'Anden løsning'},older_versions:[]}:group]})}));
 const client=mount(authFetch);
 await screen.findByRole('article',{name:'Kommunal mødeassistent · Version 3'});
 fireEvent.click(screen.getByRole('button',{name:'Næste'}));
 await screen.findByRole('article',{name:'Anden løsning · Version 3'});
 expect(authFetch).toHaveBeenLastCalledWith('/api/v3/assessment-history?limit=8&offset=8');
 fireEvent.change(screen.getByLabelText('Vurderingstype'),{target:{value:'ai_act'}});
 await screen.findByRole('article',{name:'Kommunal mødeassistent · Version 3'});
 expect(authFetch).toHaveBeenLastCalledWith('/api/v3/assessment-history?limit=8&offset=0&category=ai_act');
 expect(screen.getByRole('button',{name:'Forrige'})).toBeDisabled();
 client.clear();
});
