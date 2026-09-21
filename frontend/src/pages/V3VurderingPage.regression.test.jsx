import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ThemeProvider } from 'styled-components';
import axios from 'axios';
import { lightTheme } from '../theme';
import V3VurderingPage from './V3VurderingPage';

jest.mock('axios');

test('document screening retains the selected case in multipart submission',async()=>{
  axios.get.mockResolvedValue({data:{flagged_rule_ids:[]}});
  axios.post.mockImplementation(()=>new Promise(()=>{}));
  const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  render(<ThemeProvider theme={lightTheme}><QueryClientProvider client={client}><MemoryRouter initialEntries={['/juridisk-screening?case=case-123']}><V3VurderingPage/></MemoryRouter></QueryClientProvider></ThemeProvider>);
  const file=new File(['Source text'],'grundlag.pdf',{type:'application/pdf'});
  fireEvent.change(screen.getByLabelText('Dokument til juridisk screening'),{target:{files:[file]}});
  await waitFor(()=>expect(axios.post).toHaveBeenCalled());
  const [path,body]=axios.post.mock.calls[0];
  expect(path).toBe('/api/v3/document/analyze');
  expect(body.get('case_db_id')).toBe('case-123');
  expect(body.get('file')).toBe(file);
  expect(body.get('note')).toContain('grundlag.pdf');
  client.clear();
});
