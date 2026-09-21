import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../theme';
import ToolWorkspace from './ToolWorkspace';
import { TOOL_NAVIGATION } from '../config/navigation';

const Question = () => {
  const [value, setValue] = useState('');
  return <input aria-label="Spørgsmål" value={value} onChange={event => setValue(event.target.value)} />;
};

function mount(path) {
  return render(<ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={[path]}>
    <Routes><Route element={<ToolWorkspace title="Juridisk arbejdsrum" views={[
      { path: '/research', label: 'Find kilder', element: <Question /> },
      { path: '/lov-assistent', label: 'Spørg til lovgivning', element: <h1>Lovsvar</h1> },
    ]} />}><Route path="/research" element={<></>} /><Route path="/lov-assistent" element={<></>} /></Route></Routes>
  </MemoryRouter></ThemeProvider>);
}

test('merged views preserve an unfinished question and the case context', () => {
  mount('/research?case=municipal-case&preview=old');
  fireEvent.change(screen.getByLabelText('Spørgsmål'), { target: { value: 'Mit spørgsmål om sletning' } });
  const law = screen.getByRole('link', { name: 'Spørg til lovgivning' });
  expect(law).toHaveAttribute('href', '/lov-assistent?case=municipal-case');
  fireEvent.click(law);
  expect(screen.getByRole('heading', { name: 'Lovsvar' })).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Find kilder' }));
  expect(screen.getByRole('textbox')).toHaveValue('Mit spørgsmål om sletning');
  expect(screen.queryByRole('heading', { name: 'Lovsvar' })).not.toBeInTheDocument();
});

test('legacy direct links enter the matching view of the merged workspace', () => {
  mount('/lov-assistent');
  expect(screen.getByRole('heading', { name: 'Lovsvar' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Spørg til lovgivning' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('More has one entry per merged workspace instead of duplicate tools', () => {
  expect(TOOL_NAVIGATION).toHaveLength(12);
  expect(TOOL_NAVIGATION.filter(item => ['/research', '/lov-assistent'].includes(item.path))).toHaveLength(1);
  expect(TOOL_NAVIGATION.filter(item => ['/videnbase', '/ressourcer'].includes(item.path))).toHaveLength(1);
  expect(TOOL_NAVIGATION.filter(item => ['/ai-act-vurdering', '/eu-checker'].includes(item.path))).toHaveLength(1);
});
