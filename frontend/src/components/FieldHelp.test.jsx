import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../theme';
import FieldHelp from './FieldHelp';

const mount = () => render(<ThemeProvider theme={lightTheme}><label htmlFor="purpose">Formål</label><input id="purpose" aria-describedby="purpose-help" /><FieldHelp label="Formål" id="purpose-help">Beskriv opgaven, fx udkast til referat.</FieldHelp></ThemeProvider>);

test('hjælpen er knyttet til feltet og kan åbnes med fokus og lukkes med Escape', () => {
  mount();
  const button = screen.getByRole('button', { name: 'Hjælp til Formål' });
  expect(screen.getByRole('textbox', { name: 'Formål' })).toHaveAccessibleDescription('Beskriv opgaven, fx udkast til referat.');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.focus(button);
  expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('tooltip')).toBeVisible();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('touchtryk åbner også efter fokus og et nyt tryk lukker', () => {
  mount();
  const button = screen.getByRole('button', { name: 'Hjælp til Formål' });
  fireEvent.focus(button);
  fireEvent.click(button);
  expect(screen.getByRole('tooltip')).toBeVisible();
  fireEvent.click(button);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('hover kan fortsætte over hjælpeteksten uden at den forsvinder', () => {
  jest.useFakeTimers();
  mount();
  const button = screen.getByRole('button', { name: 'Hjælp til Formål' });
  fireEvent.mouseEnter(button);
  const popup = screen.getByRole('tooltip');
  fireEvent.mouseLeave(button);
  fireEvent.mouseEnter(popup);
  act(() => jest.advanceTimersByTime(200));
  expect(popup).toBeVisible();
  fireEvent.mouseLeave(popup);
  act(() => jest.advanceTimersByTime(200));
  expect(popup).not.toBeVisible();
  jest.useRealTimers();
});

test('klik udenfor lukker den fastgjorte hjælp', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Hjælp til Formål' }));
  expect(screen.getByRole('tooltip')).toBeVisible();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('placeringen holdes inden for en 360px skærm ved højre og nederste kant', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 640 });
  const rect = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function bounds() {
    return this.tagName === 'BUTTON' ? { left: 325, right: 353, top: 585, bottom: 613, width: 28, height: 28 } : { left: 0, right: 330, top: 0, bottom: 120, width: 330, height: 120 };
  });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Hjælp til Formål' }));
  const popup = screen.getByRole('tooltip');
  expect(Number.parseFloat(popup.style.left)).toBe(18);
  expect(Number.parseFloat(popup.style.left) + 330).toBeLessThanOrEqual(348);
  expect(Number.parseFloat(popup.style.top) + 120).toBeLessThan(640);
  rect.mockRestore();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
});
