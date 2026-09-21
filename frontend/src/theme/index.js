/**
 * Theme Configuration
 * Exports complete theme objects for light and dark modes
 */

import {
  commonThemeTokens,
  lightThemeColors,
  darkThemeColors,
  lightLayoutTokens,
  darkLayoutTokens,
  lightGlass,
  darkGlass,
} from './tokens';

export const lightTheme = {
  ...commonThemeTokens,
  mode: 'light',
  colors: lightThemeColors,
  layout: lightLayoutTokens,
  glass: lightGlass,
};

export const darkTheme = {
  ...commonThemeTokens,
  mode: 'dark',
  colors: darkThemeColors,
  layout: darkLayoutTokens,
  glass: darkGlass,
};

// Export tokens for direct access if needed
export * from './tokens';
