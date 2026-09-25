import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../theme';
import BRAND from '../config/brand';
import { PRIMARY_NAVIGATION, TOOL_NAVIGATION_GROUPS } from '../config/navigation';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { useAuth } from '../contexts/AuthContext';
import { useTutorial } from '../contexts/TutorialContext';
import PortalHeader from './PortalHeader';

jest.mock('../contexts/UserPreferencesContext', () => ({ useUserPreferences: jest.fn() }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../contexts/TutorialContext', () => ({ useTutorial: jest.fn() }));

let auth;
let tutorial;
let updatePreference;
let openCommandPalette;
const mount = () => render(<ThemeProvider theme={lightTheme}><MemoryRouter><PortalHeader onOpenCommandPalette={openCommandPalette} /></MemoryRouter></ThemeProvider>);
const openProfile = () => {
  const trigger = screen.getByRole('button', { name: 'Åbn profilmenu for Parthee' });
  fireEvent.click(trigger);
  return trigger;
};

beforeEach(() => {
  auth = { user: { name: 'Parthee' }, isAuthenticated: true, isDevelopmentIdentity: true, logout: jest.fn(), login: jest.fn() };
  tutorial = { canStart: true, saving: false, restart: jest.fn() };
  updatePreference = jest.fn();
  openCommandPalette = jest.fn();
  useAuth.mockImplementation(() => auth);
  useTutorial.mockImplementation(() => tutorial);
  useUserPreferences.mockReturnValue({ preferences: { theme: 'light' }, updatePreference });
});

test('the compact brand links home and the profile trigger owns utility actions', () => {
  mount();
  expect(screen.getByRole('link', { name: `${BRAND.organisation} – SHIELD ${BRAND.version} – gå til startsiden` })).toHaveAttribute('href', '/');
  expect(screen.getByText(BRAND.version)).toBeInTheDocument();
  const trigger = screen.getByRole('button', { name: 'Åbn profilmenu for Parthee' });
  expect(trigger).toHaveTextContent('Parthee');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'Afslut session' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Åbn hurtig navigation' })).not.toBeInTheDocument();
  expect(screen.queryByText('Flere')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Profil og værktøjer' })).not.toBeInTheDocument();
  const nav = within(screen.getByRole('navigation', { name: 'Primær navigation' }));
  PRIMARY_NAVIGATION.forEach(item => expect(nav.getByRole('link', { name: item.label })).toHaveAttribute('href', item.path));
});

test('profile retains every grouped tool destination and closes after navigation', () => {
  mount();
  const trigger = openProfile();
  const menu = within(screen.getByRole('region', { name: 'Profil og værktøjer' }));
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  TOOL_NAVIGATION_GROUPS.forEach(group => {
    const section = within(menu.getByRole('region', { name: group.label }));
    group.items.forEach(item => expect(section.getByRole('link', { name: `${item.label} ${item.description}` })).toHaveAttribute('href', item.path));
  });
  expect(menu.queryByRole('link', { name: /^EU AI Act-vejviser/ })).not.toBeInTheDocument();
  fireEvent.click(menu.getByRole('link', { name: /Konsekvensanalyse og risici/ }));
  expect(screen.queryByRole('region', { name: 'Profil og værktøjer' })).not.toBeInTheDocument();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('Escape closes the profile and returns focus; outside pointer dismisses without navigation', () => {
  mount();
  const trigger = openProfile();
  const menu = within(screen.getByRole('region', { name: 'Profil og værktøjer' }));
  menu.getByRole('button', { name: 'Skift til mørkt tema' }).focus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('region', { name: 'Profil og værktøjer' })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('region', { name: 'Profil og værktøjer' })).not.toBeInTheDocument();
  expect(openCommandPalette).not.toHaveBeenCalled();
});

test('keyboard opens on the first action and tabbing out closes the disclosure', () => {
  mount();
  const trigger = screen.getByRole('button', { name: 'Åbn profilmenu for Parthee' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const search = screen.getByRole('button', { name: 'Åbn hurtig navigation' });
  expect(search).toHaveFocus();
  fireEvent.blur(search, { relatedTarget: within(screen.getByRole('navigation', { name: 'Primær navigation' })).getByRole('link', { name: 'Startside' }) });
  expect(screen.queryByRole('region', { name: 'Profil og værktøjer' })).not.toBeInTheDocument();
});

test('search opens the existing command palette and restores its return-focus target', () => {
  mount();
  const trigger = openProfile();
  const menu = within(screen.getByRole('region', { name: 'Profil og værktøjer' }));
  fireEvent.click(menu.getByRole('button', { name: 'Åbn hurtig navigation' }));
  expect(openCommandPalette).toHaveBeenCalledTimes(1);
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('region', { name: 'Profil og værktøjer' })).not.toBeInTheDocument();
});

test('the shared command shortcut dismisses the profile without swallowing the event', () => {
  mount();
  const trigger = openProfile();
  const menu = within(screen.getByRole('region', { name: 'Profil og værktøjer' }));
  menu.getByRole('button', { name: 'Skift til mørkt tema' }).focus();
  const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true });
  fireEvent(document, event);
  expect(event.defaultPrevented).toBe(false);
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('region', { name: 'Profil og værktøjer' })).not.toBeInTheDocument();
});

test.each([['light', 'Skift til mørkt tema', 'dark'], ['dark', 'Skift til lyst tema', 'light']])('theme action preserves the existing preference in %s mode', (current, label, next) => {
  useUserPreferences.mockReturnValue({ preferences: { theme: current }, updatePreference });
  mount();
  openProfile();
  const menu = within(screen.getByRole('region', { name: 'Profil og værktøjer' }));
  fireEvent.click(menu.getByRole('button', { name: label }));
  expect(updatePreference).toHaveBeenCalledWith('theme', next);
  expect(screen.getByRole('region', { name: 'Profil og værktøjer' })).toBeInTheDocument();
});

test('guide uses the existing restart action and returns focus to the profile trigger', () => {
  mount();
  const trigger = openProfile();
  const menu = within(screen.getByRole('region', { name: 'Profil og værktøjer' }));
  fireEvent.click(menu.getByRole('button', { name: 'Start introduktionsguide' }));
  expect(tutorial.restart).toHaveBeenCalledTimes(1);
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole('region', { name: 'Profil og værktøjer' })).not.toBeInTheDocument();
});

test('guide is unavailable while saving and hidden when the session cannot start it', () => {
  tutorial.saving = true;
  const view = mount();
  openProfile();
  const menu = within(screen.getByRole('region', { name: 'Profil og værktøjer' }));
  expect(menu.getByRole('button', { name: 'Åbner guide…' })).toBeDisabled();
  expect(tutorial.restart).not.toHaveBeenCalled();
  view.unmount();
  tutorial.canStart = false;
  mount();
  openProfile();
  expect(screen.queryByRole('button', { name: /guide/ })).not.toBeInTheDocument();
});

test.each([[true, true, 'Afslut session', 'Lokal session'], [true, false, 'Log ud', 'Logget ind · Kalundborg Kommune'], [false, false, 'Log ind', 'Ikke logget ind']])('preserves session action for authenticated=%s development=%s', (authenticated, development, label, status) => {
  auth.isAuthenticated = authenticated;
  auth.isDevelopmentIdentity = development;
  mount();
  openProfile();
  const menu = within(screen.getByRole('region', { name: 'Profil og værktøjer' }));
  expect(menu.getByText(status)).toBeInTheDocument();
  fireEvent.click(menu.getByRole('button', { name: label }));
  expect(authenticated ? auth.logout : auth.login).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('region', { name: 'Profil og værktøjer' })).not.toBeInTheDocument();
});

test('mobile navigation retains primary destinations and all utilities remain in one shared profile', () => {
  mount();
  fireEvent.click(screen.getByLabelText('Åbn navigation'));
  const mobile = within(screen.getByLabelText('Mobilnavigation'));
  PRIMARY_NAVIGATION.forEach(item => expect(mobile.getByRole('link', { name: item.label, hidden: true })).toHaveAttribute('href', item.path));
  expect(mobile.queryByRole('button', { name: 'Afslut session' })).not.toBeInTheDocument();
  openProfile();
  expect(screen.queryByLabelText('Mobilnavigation')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Afslut session' })).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Åbn navigation'));
  expect(screen.queryByRole('region', { name: 'Profil og værktøjer' })).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByLabelText('Mobilnavigation')).getByRole('link', { name: 'Ny AI-løsning', hidden: true }));
  expect(screen.queryByLabelText('Mobilnavigation')).not.toBeInTheDocument();
});

test('mobile navigation closes on Escape with focus returned and on outside pointer', () => {
  mount();
  const trigger = screen.getByLabelText('Åbn navigation');
  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(trigger).toHaveFocus();
  expect(screen.queryByLabelText('Mobilnavigation')).not.toBeInTheDocument();
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByLabelText('Mobilnavigation')).not.toBeInTheDocument();
});
