import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme';
import StructuredReportText, { reportBlocks } from './StructuredReportText';

const mount = (text, props = {}) => render(<ThemeProvider theme={lightTheme}><StructuredReportText text={text} {...props} /></ThemeProvider>);

test('historiske statusetiketter bliver overskrifter uden at opfinde en godkendelse', () => {
  mount('Dokumenteret\nAftalen beskriver kommunens instrukser.\nSkal afklares\nHosting er ikke dokumenteret.\nFør godkendelse:\nSletning skal kontrolleres.');
  for (const title of ['Dokumenteret', 'Skal afklares', 'Før godkendelse']) {
    expect(screen.getByRole('heading', { name: title, level: 4 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: title, level: 4 })).toHaveAttribute('data-status-heading', 'true');
  }
  expect(screen.getByText('Aftalen beskriver kommunens instrukser.')).toBeInTheDocument();
  expect(screen.getByText('Hosting er ikke dokumenteret.')).toBeInTheDocument();
  expect(screen.getByText('Sletning skal kontrolleres.')).toBeInTheDocument();
  expect(screen.queryByText('Godkendt')).not.toBeInTheDocument();
});

test('markdown bevarer overskrifters hierarki og fremhæver eksisterende tekst sikkert', () => {
  mount('## Databehandleraftale\nAftalen er **ikke godkendt**.\n### Personoplysninger\n__Følsomme oplysninger__ kan forekomme.\n#### Sletning\nSlettefrister mangler.', { headingLevel: 3 });
  expect(screen.getByRole('heading', { name: 'Databehandleraftale', level: 3 })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Personoplysninger', level: 4 })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Sletning', level: 5 })).toBeInTheDocument();
  expect(screen.getByText('ikke godkendt').tagName).toBe('STRONG');
  expect(screen.getByText('Følsomme oplysninger').tagName).toBe('STRONG');
});

test('eksisterende emneoverskrifter og etiketter i afsnit får struktur uden nye udsagn', () => {
  mount('**Hosting og dataplacering**\nSkal afklares: Leverandørens region er ikke angivet.\nSikkerhed\nDokumenteret er ikke det samme som godkendt.\nEt ukendt kort afsnit');
  expect(screen.getByRole('heading', { name: 'Hosting og dataplacering' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Sikkerhed' })).toBeInTheDocument();
  const label = screen.getByText('Skal afklares:');
  expect(label.tagName).toBe('STRONG');
  expect(screen.getByText(/Leverandørens region er ikke angivet/)).toHaveTextContent('Skal afklares: Leverandørens region er ikke angivet.');
  expect(screen.getByText('Dokumenteret er ikke det samme som godkendt.').tagName).toBe('P');
  expect(screen.getByText('Et ukendt kort afsnit').tagName).toBe('P');
});

test('nummererede og indrykkede lister bevarer tal, rækkefølge og alle forbehold', () => {
  mount('3. Kontrollér **aftalen**.\n   - Hosting er uafklaret.\n     Dokumentationen skal omfatte backup.\n   - Kontrollér sletning.\n7. Indhent faglig godkendelse.\n- En anbefaling er ikke en beslutning.');
  const ordered = screen.getAllByRole('list').find(list => list.tagName === 'OL');
  expect(ordered).toHaveAttribute('start', '3');
  const numberedItems = within(ordered).getAllByRole('listitem').filter(item => item.hasAttribute('value'));
  expect(numberedItems[0]).toHaveAttribute('value', '3');
  expect(numberedItems[1]).toHaveAttribute('value', '7');
  const nested = within(numberedItems[0]).getByRole('list');
  expect(within(nested).getAllByRole('listitem')).toHaveLength(2);
  expect(within(nested).getByText('Dokumentationen skal omfatte backup.')).toBeInTheDocument();
  expect(screen.getByText('En anbefaling er ikke en beslutning.')).toBeInTheDocument();
});

test('kildecitater med HTML og links forbliver tekst og kan ikke eksekveres', () => {
  const payload = '<img src=x onerror="alert(1)">\n<script>alert(2)</script>\n[jura](javascript:alert(3))\n**<button>Godkend</button>**';
  mount(payload);
  for (const role of ['img', 'button', 'link']) expect(screen.queryByRole(role)).not.toBeInTheDocument();
  expect(screen.getByText('<script>alert(2)</script>').tagName).toBe('P');
  expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
  expect(screen.getByText('[jura](javascript:alert(3))')).toBeInTheDocument();
  expect(screen.getByText('<button>Godkend</button>')).toBeInTheDocument();
});

test('ukomplet formatering, kode og identifikatorer ændres ikke til fremhævede udsagn', () => {
  mount('Uafsluttet **tekst\nKilde: vendor__data__id\nBogstaveligt \\**ikke fed**\n`**rå kilde**`');
  expect(screen.getByText('Uafsluttet **tekst')).toBeInTheDocument();
  expect(screen.getByText('Kilde: vendor__data__id')).toBeInTheDocument();
  expect(screen.getByText('Bogstaveligt \\**ikke fed**')).toBeInTheDocument();
  expect(screen.getByText('**rå kilde**').tagName).toBe('CODE');
});

test('lange afsnit deles uden at miste sætninger eller ændre deres rækkefølge', () => {
  const text = Array.from({ length: 10 }, (_, index) => `Forbehold nummer ${index + 1} skal fortsat undersøges og dokumenteres i denne vurdering.`).join(' ');
  const blocks = reportBlocks(text);
  expect(blocks.length).toBeGreaterThan(1);
  expect(blocks.map(block => block.text).join(' ')).toBe(text);
});

test('lange fremhævelser splittes ikke midt i markeringen', () => {
  const statement = 'Alle disse forbehold skal bevares ved den faglige gennemgang. '.repeat(10).trim();
  mount(`**${statement}**`);
  expect(screen.getByText(statement).tagName).toBe('STRONG');
});
