import { ALL_NAVIGATION, PRIMARY_NAVIGATION, TOOL_NAVIGATION } from './navigation';

test('municipal intake is primary while manual assessments remain directly available', () => {
  expect(PRIMARY_NAVIGATION).toContainEqual(expect.objectContaining({ label: 'Ny AI-løsning', path: '/anskaffelse' }));
  expect(PRIMARY_NAVIGATION.some(item => item.path === '/vurdering')).toBe(false);
  expect(TOOL_NAVIGATION).toContainEqual(expect.objectContaining({ label: 'Manuel konsekvensanalyse', path: '/vurdering' }));
  expect(new Set(ALL_NAVIGATION.map(item => item.id)).size).toBe(ALL_NAVIGATION.length);
});
