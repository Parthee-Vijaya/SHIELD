import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../theme';
import PortalHeader from './PortalHeader';
const mockLogout = jest.fn();

jest.mock('../contexts/UserPreferencesContext', () => ({useUserPreferences: () => ({preferences:{theme:'light'},updatePreference:jest.fn()})}));
jest.mock('../contexts/AuthContext', () => ({useAuth: () => ({user:{name:'Parthee'},isAuthenticated:true,isDevelopmentIdentity:true,logout:mockLogout})}));
jest.mock('../contexts/TutorialContext', () => ({useTutorial: () => ({canStart:false})}));
const mount=()=>render(<ThemeProvider theme={lightTheme}><MemoryRouter><PortalHeader/></MemoryRouter></ThemeProvider>);

test('More distinguishes case assessments from supplementary guidance and closes after navigation',()=>{
  mount();
  const summary=screen.getByText('Flere');
  fireEvent.click(summary);
  const panel=within(summary.closest('details'));
  expect(panel.getByRole('region',{name:'Vurderinger'})).toBeVisible();
  expect(panel.getByRole('region',{name:'Kilder og viden'})).toBeVisible();
  expect(panel.getByRole('link',{name:/AI Act-vurdering/})).toHaveAttribute('href','/ai-act-vurdering');
  expect(panel.queryByRole('link',{name:/^EU AI Act-vejviser/})).not.toBeInTheDocument();
  expect(panel.getByRole('link',{name:/Juridisk arbejdsrum/})).toHaveAttribute('href','/research');
  expect(panel.getByRole('link',{name:/Viden og vejledning/})).toHaveAttribute('href','/videnbase');
  fireEvent.click(panel.getByRole('link',{name:/Konsekvensanalyse og risici/}));
  expect(summary.closest('details')).not.toHaveAttribute('open');
});

test('More dismisses on Escape and outside pointer without navigating',()=>{
  mount();
  const summary=screen.getByText('Flere');
  fireEvent.click(summary);
  fireEvent.keyDown(document,{key:'Escape'});
  expect(summary.closest('details')).not.toHaveAttribute('open');
  expect(summary).toHaveFocus();
  fireEvent.click(summary);
  fireEvent.pointerDown(document.body);
  expect(summary.closest('details')).not.toHaveAttribute('open');
});

test('mobile navigation uses the same grouped destinations and closes after selection',()=>{
  mount();
  fireEvent.click(screen.getByLabelText('Åbn navigation'));
  const mobile=within(document.getElementById('portal-mobile-navigation'));
  expect(mobile.getByLabelText('Hjælp og administration')).toBeInTheDocument();
  fireEvent.click(mobile.getByText('Juridisk arbejdsrum'));
  expect(document.getElementById('portal-mobile-navigation')).not.toBeInTheDocument();
});


test('the named local session can be ended from the header', () => {
  mount();
  expect(screen.getByLabelText('Lokal session som Parthee')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Afslut session' }));
  expect(mockLogout).toHaveBeenCalledTimes(1);
});

test('mobile navigation exposes the user name and can end the session', () => {
  mockLogout.mockClear();
  mount();
  fireEvent.click(screen.getByLabelText('Åbn navigation'));
  const mobile = within(screen.getByLabelText('Mobilnavigation'));
  expect(mobile.getByText('Parthee · Lokal session')).toBeInTheDocument();
  fireEvent.click(mobile.getByText('Afslut session'));
  expect(mockLogout).toHaveBeenCalledTimes(1);
});
