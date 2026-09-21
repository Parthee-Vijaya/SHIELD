import { modelLabel, modelNotes } from './modelPresentation';

test('viser den gemte model uden at gætte en anden modelversion', () => {
  expect(modelLabel('gpt-5.6-sol')).toBe('GPT-5.6 Sol');
  expect(modelLabel('gpt-6-astra')).toBe('GPT-6 Astra');
  expect(modelLabel('openai/gpt-5.5')).toBe('GPT-5.5');
  expect(modelLabel('another/provider-model')).toBe('another/provider-model');
  expect(modelLabel(null)).toBe('Ikke registreret');
});

test('omskriver kun kendte platformnoter og bevarer substantielle forbehold', () => {
  const notes = [
    'Udkast udarbejdet i Codex med gpt-5.6-sol; JEV-kontrol via AI Gateway.',
    'Model og kørsels-ID er angivet af den lokale operatør; denne import starter ikke Codex.',
    'Slettefristen på 30 dage er ikke dokumenteret.',
    'Leverandøren bruger Codex til udvikling; adgangen skal afklares.',
  ];
  expect(modelNotes(notes, 'gpt-5.6-sol')).toEqual([
    'Udarbejdet med GPT-5.6 Sol. Kontrolleret med JEV.',
    'Modeloplysningen er angivet ved importen og er ikke automatisk verificeret.',
    notes[2], notes[3],
  ]);
  expect(notes[0]).toContain('Codex');
});
