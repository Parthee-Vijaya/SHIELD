import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import MaterialCoverage from './MaterialCoverage';

const view = props => <ThemeProvider theme={lightTheme}><MaterialCoverage {...props} /></ThemeProvider>;
const row = name => screen.getByText(name).closest('li');

test('viser præcist materialet på den aktuelle sag uden at godkende indhold eller udlede lovlighed', () => {
  const sources = Object.freeze([
    Object.freeze({ id: 'dpa-v1', category: 'data_processing_agreement', document_status: 'draft' }),
    Object.freeze({ id: 'supplier-v1', category: 'supplier_documentation' }),
    Object.freeze({ id: 'supplier-v2', category: 'supplier_documentation' }),
    Object.freeze({ id: 'other-v1', category: 'other', title: 'En reklamepræsentation' }),
  ]);
  const before = JSON.stringify(sources);
  render(view({ sources }));
  expect(within(row('Databehandleraftale')).getByText('1 fil vedlagt')).toBeInTheDocument();
  expect(within(row('Leverandørmateriale')).getByText('2 filer vedlagt')).toBeInTheDocument();
  expect(within(row('Sikkerhedsdokumentation')).getByText('Ikke vedlagt · behovet skal afklares')).toBeInTheDocument();
  expect(row('Kommunens behandlingsbeskrivelse')).toHaveTextContent('Afklares i sagen');
  expect(row('Kommunens behandlingsbeskrivelse')).toHaveTextContent('1 fil er kategoriseret som øvrigt materiale; indholdet skal gennemgås.');
  expect(screen.getByText(/Vedlagt materiale er ikke det samme som fagligt godkendt/)).toBeInTheDocument();
  expect(JSON.stringify(sources)).toBe(before);
});

test('kategori vælges kun efter en eksplicit handling, og skift af sag viser nye antal', () => {
  const onSelectCategory = jest.fn();
  const { rerender } = render(view({ sources: [{ id: 'doc-a', category: 'data_processing_agreement' }], onSelectCategory }));
  expect(onSelectCategory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Tilføj sikkerhedsdokumentation' }));
  expect(onSelectCategory).toHaveBeenCalledWith('security_documentation');
  fireEvent.click(screen.getByRole('button', { name: 'Tilføj materiale om kommunens behandling' }));
  expect(onSelectCategory).toHaveBeenLastCalledWith('other');
  rerender(view({ sources: [], onSelectCategory }));
  expect(within(row('Databehandleraftale')).getByText(/Ikke vedlagt/)).toBeInTheDocument();
  expect(screen.queryByText('1 fil vedlagt')).not.toBeInTheDocument();
});

test('tæller en dokumentversion én gang og håndterer tomt eller mangelfuldt grundlag', () => {
  const { rerender } = render(view({ sources: [null, { id: 'same-version', category: 'data_processing_agreement' }, { id: 'same-version', category: 'data_processing_agreement' }] }));
  expect(within(row('Databehandleraftale')).getByText('1 fil vedlagt')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  rerender(view({ sources: null }));
  expect(screen.getAllByText('Ikke vedlagt · behovet skal afklares')).toHaveLength(4);
});


test('municipal needs remain distinct from vendor material and do not imply implemented controls', () => {
  const onSelectCategory=jest.fn();
  render(view({sources:[{id:'need-1',category:'needs_description'}],onSelectCategory}));
  expect(row('Kommunens behovsbeskrivelse')).toHaveTextContent('1 fil vedlagt');
  expect(row('Leverandørmateriale')).toHaveTextContent('Ikke vedlagt');
  fireEvent.click(screen.getByRole('button',{name:'Tilføj kommunens behovsbeskrivelse'}));
  expect(onSelectCategory).toHaveBeenCalledWith('needs_description');
});
