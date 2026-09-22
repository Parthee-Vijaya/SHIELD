import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../theme';
import NotFoundPage from './NotFoundPage';

test('an unknown link shows an explanation and a working route back to the start page', () => {
  render(<ThemeProvider theme={lightTheme}><MemoryRouter initialEntries={['/ukendt-side?returnTo=https://external.invalid']}><Routes>
    <Route path="/" element={<h1>Dit arbejdsrum</h1>} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></MemoryRouter></ThemeProvider>);
  expect(screen.getByRole('heading', { name: 'Vi kunne ikke finde siden' })).toBeInTheDocument();
  const home = screen.getByRole('link', { name: 'Gå til startsiden' });
  expect(home).toHaveAttribute('href', '/');
  fireEvent.click(home);
  expect(screen.getByRole('heading', { name: 'Dit arbejdsrum' })).toBeInTheDocument();
});
