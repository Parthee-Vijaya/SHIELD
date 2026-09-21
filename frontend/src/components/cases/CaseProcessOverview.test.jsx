import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import CaseProcessOverview from './CaseProcessOverview';

const workCases = [
  { id: 'minutes', case_id: 'K-2026-101', title: 'Mødeassistent til projektmøder', status: 'kladde', assigned_to: 'Anna', last_aggregate_status: null },
  { id: 'support', case_id: 'K-2026-102', title: 'Borgervejledning med AI', status: 'remediation', assigned_to: 'Bo', last_aggregate_status: 'BETINGET-GO' },
  { id: 'documents', case_id: 'K-2026-103', title: 'AI til dokumentgennemgang', status: 'vurderet', last_aggregate_status: 'NO-GO' },
  { id: 'approved', case_id: 'K-2026-104', title: 'Kvalitetssikring af referater', status: 'godkendt', last_aggregate_status: 'GO' },
];

const exampleCases = [
  { id: 'example-a', case_id: 'EKSEMPEL-2026-001', title: 'EKSEMPEL · Krisp til interne møder', status: 'vurderet', notes: 'Fiktivt kommunalt møde med offentlig databehandleraftale og historisk SOC 3-rapport.' },
  { id: 'example-b', case_id: 'EKSEMPEL-2026-002', title: 'EKSEMPEL – Tekstassistent', status: 'remediation', notes: 'Syntetiske oplysninger til gennemgang af åbne afklaringer.' },
];

function makeHandlers() {
  return {
    onDragStart: jest.fn(),
    onDragOver: jest.fn(),
    onDragLeave: jest.fn(),
    onDrop: jest.fn(),
  };
}

function view(props = {}) {
  return (
    <ThemeProvider theme={lightTheme}>
      <MemoryRouter>
        <CaseProcessOverview
          key={props.examplesOnly ? 'examples' : 'work'}
          cases={workCases}
          examplesOnly={false}
          isLoading={false}
          dragOverColumn={null}
          {...props}
        />
      </MemoryRouter>
    </ThemeProvider>
  );
}

test('status og søgning afgrænser den samme sagsliste uden at flytte sager', () => {
  const handlers = makeHandlers();
  render(view(handlers));

  expect(screen.getByRole('button', { name: 'Alle trin: 4 sager' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(screen.getByRole('list', { name: 'Kommunens arbejdssager' })).getAllByRole('link')).toHaveLength(4);

  fireEvent.change(screen.getByLabelText('Søg i sager'), { target: { value: 'AI' } });
  fireEvent.click(screen.getByRole('button', { name: 'Afklaring: 1 sager' }));

  const list = screen.getByRole('list', { name: 'Kommunens arbejdssager' });
  expect(within(list).getAllByRole('link')).toHaveLength(1);
  expect(within(list).getByRole('link', { name: /Borgervejledning med AI/ })).toHaveAttribute('href', '/sager/support');
  expect(screen.getByRole('button', { name: 'Afklaring: 1 sager' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Alle trin: 4 sager' })).toHaveAttribute('aria-pressed', 'false');
  Object.values(handlers).forEach(handler => expect(handler).not.toHaveBeenCalled());
});

test('ingen match kan nulstilles uden at miste sager eller valgt scope', () => {
  render(view(makeHandlers()));
  fireEvent.click(screen.getByRole('button', { name: 'Kladde: 1 sager' }));
  fireEvent.change(screen.getByLabelText('Søg i sager'), { target: { value: 'ukendt løsning xyz' } });

  expect(screen.queryByRole('link', { name: /Mødeassistent til projektmøder/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Nulstil filtre' }));

  expect(screen.getByLabelText('Søg i sager')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Alle trin: 4 sager' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(screen.getByRole('list', { name: 'Kommunens arbejdssager' })).getAllByRole('link')).toHaveLength(4);
});

test('scope-nøglen nulstiller søgning og status ved skift til eksempelsager', () => {
  const handlers = makeHandlers();
  const { rerender } = render(view(handlers));
  fireEvent.click(screen.getByRole('button', { name: 'Kladde: 1 sager' }));
  fireEvent.change(screen.getByLabelText('Søg i sager'), { target: { value: 'Mødeassistent' } });

  rerender(view({ ...handlers, cases: exampleCases, examplesOnly: true }));

  expect(screen.getByLabelText('Søg i sager')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Alle trin: 2 sager' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(screen.getByRole('list', { name: 'Fiktive eksempelsager' })).getAllByRole('link')).toHaveLength(2);
  expect(screen.queryByRole('link', { name: /Mødeassistent til projektmøder/ })).not.toBeInTheDocument();
});

test('eksempelsager bevarer direkte links, fiktive kildebeskrivelser og ingen procestavle', () => {
  render(view({ ...makeHandlers(), cases: exampleCases, examplesOnly: true }));

  expect(screen.getByRole('link', { name: 'Krisp til interne møder →' })).toHaveAttribute('href', '/sager/example-a?from=examples');
  expect(screen.getByRole('link', { name: 'Tekstassistent →' })).toHaveAttribute('href', '/sager/example-b?from=examples');
  const note = screen.getByText(exampleCases[0].notes);
  const details = note.closest('details');
  expect(details).not.toBeNull();
  expect(details.querySelector('summary')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Procestavle' })).not.toBeInTheDocument();
});

test('procestavlen sender træk og slip videre med sagens ID og målstatus', () => {
  const handlers = makeHandlers();
  render(view(handlers));
  expect(screen.queryByLabelText('Sager fordelt efter status')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Procestavle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kladde: 1 sager' }));
  const board = screen.getByLabelText('Sager fordelt efter status');
  expect(within(board).getAllByRole('region')).toHaveLength(6);
  expect(within(board).queryByRole('link', { name: /Borgervejledning med AI/ })).not.toBeInTheDocument();
  const draggable = within(board).getByRole('link', { name: /Mødeassistent til projektmøder/ }).closest('[draggable="true"]');
  expect(draggable).not.toBeNull();
  const dataTransfer = { setData: jest.fn(), getData: jest.fn(() => 'minutes'), effectAllowed: 'move', dropEffect: 'move' };
  const target = within(board).getByRole('region', { name: 'Afklaring' });
  fireEvent.dragStart(draggable, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });

  expect(handlers.onDragStart).toHaveBeenCalledWith(expect.anything(), 'minutes');
  expect(handlers.onDragOver).toHaveBeenCalledWith(expect.anything(), 'remediation');
  expect(handlers.onDrop).toHaveBeenCalledWith(expect.anything(), 'remediation');

  fireEvent.click(screen.getByRole('button', { name: 'Sagsliste' }));
  expect(screen.queryByLabelText('Sager fordelt efter status')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Alle trin: 4 sager' }));
  expect(within(screen.getByRole('list', { name: 'Kommunens arbejdssager' })).getAllByRole('link')).toHaveLength(4);
});
