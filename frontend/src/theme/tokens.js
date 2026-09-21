/**
 * Design System Tokens
 * Central definition of all design tokens for Judge Dredd platform
 */

export const commonThemeTokens = {
  // Typography
  fonts: {
    main: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    mono: 'Monaco, Courier New, monospace',
  },
  fontSizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
  },
  fontWeights: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeights: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },

  // Spacing
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
    '3xl': '4rem',
  },

  // Border radius
  borderRadius: '12px',
  borderRadiusLarge: '16px',
  borderRadiusSmall: '8px',
  borderRadiusFull: '9999px',

  // Shadows
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04)',
    glass: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
    glow: '0 0 24px rgba(201, 68, 22, 0.35)',
    focus: '0 0 0 3px rgba(201, 68, 22, 0.18)',
  },

  // Animations
  animations: {
    transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transitionFast: '0.15s cubic-bezier(0.4, 0, 0.2, 1)',
    transitionSlow: '0.5s cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  },

  // Breakpoints
  breakpoints: {
    xs: '320px',
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },

  // Z-index
  zIndex: {
    base: 1,
    dropdown: 100,
    sticky: 200,
    fixed: 300,
    modalBackdrop: 400,
    modal: 500,
    popover: 600,
    tooltip: 700,
  },
};

// Brand colors (consistent across themes)
export const brandColors = {
  primary: '#A03612',
  primaryDark: '#7d2b0e',
  primaryLight: '#C94416',
  primaryRgb: '160, 54, 18',
};

// Light theme colors
export const lightThemeColors = {
  ...brandColors,

  // Semantic colors
  success: '#2f855a',
  successLight: '#48bb78',
  warning: '#d69e2e',
  warningLight: '#f6ad55',
  danger: '#c53030',
  dangerLight: '#f56565',
  info: '#2b6cb0',
  infoLight: '#4299e1',

  // Neutral colors
  white: '#ffffff',
  black: '#000000',

  // Background & Surface
  background: '#f4f7fb',
  surface: '#ffffff',
  surfaceAlt: '#f1f5f9',

  // Status palettes
  status: {
    healthy: { background: '#d1fae5', border: '#059669', text: '#03543f' },
    degraded: { background: '#fef3c7', border: '#d97706', text: '#92400e' },
    down: { background: '#fee2e2', border: '#dc2626', text: '#991b1b' },
    idle: { background: '#f8fafc', border: '#cbd5e1', text: '#475569' },
  },

  // Text colors
  text: '#1a202c',
  textMuted: '#64748b',
  textInverse: '#ffffff',

  // Border colors
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  borderDark: '#cbd5e1',

  // Input
  inputBackground: '#ffffff',
  inputBorder: '#e2e8f0',

  // Gray scale
  gray: {
    50: '#f7fafc',
    100: '#edf2f7',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#a0aec0',
    500: '#718096',
    600: '#4a5568',
    700: '#2d3748',
    800: '#1a202c',
    900: '#171923',
  },

  // Juridical colors
  juridical: {
    navy: '#1a365d',
    gold: '#b8860b',
    darkGold: '#9a7209',
    charcoal: '#2d3748',
    lightNavy: '#2c5282',
    deepNavy: '#0f2238',
    midNavy: '#1a4480',
    lightGold: '#d4af37',
    bronze: '#cd7f32',
    platinum: '#e5e4e2',
  },

  // Gradients
  gradients: {
    primary: 'linear-gradient(135deg, #7d2b0e 0%, #A03612 50%, #C94416 100%)',
    gold: 'linear-gradient(135deg, #b8860b 0%, #d4af37 50%, #f6e05e 100%)',
    hero: 'linear-gradient(135deg, #7d2b0e 0%, #A03612 25%, #C94416 75%, #E85A28 100%)',
    card: 'linear-gradient(145deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 100%)',
    glass: 'linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
    danger: 'linear-gradient(135deg, #c53030 0%, #e53e3e 50%, #f56565 100%)',
  },
};

// Dark theme colors
export const darkThemeColors = {
  ...brandColors,

  // Semantic colors
  success: '#22c55e',
  successLight: '#4ade80',
  warning: '#fbbf24',
  warningLight: '#fcd34d',
  danger: '#f87171',
  dangerLight: '#fca5a5',
  info: '#60a5fa',
  infoLight: '#93c5fd',

  // Neutral colors
  white: '#f8fafc',
  black: '#0b1220',

  // Background & Surface
  background: '#0b1220',
  surface: '#111827',
  surfaceAlt: '#1e293b',

  // Status palettes
  status: {
    healthy: { background: 'rgba(16, 185, 129, 0.15)', border: '#34d399', text: '#a7f3d0' },
    degraded: { background: 'rgba(234, 179, 8, 0.12)', border: '#facc15', text: '#fde68a' },
    down: { background: 'rgba(248, 113, 113, 0.15)', border: '#f87171', text: '#fecaca' },
    idle: { background: 'rgba(148, 163, 184, 0.12)', border: '#475569', text: '#cbd5f5' },
  },

  // Text colors
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textInverse: '#1a202c',

  // Border colors
  border: '#1f2937',
  borderLight: '#27364a',
  borderDark: '#0f172a',

  // Input
  inputBackground: '#1e293b',
  inputBorder: '#334155',

  // Gray scale
  gray: {
    50: '#0b1220',
    100: '#111827',
    200: '#1e293b',
    300: '#27364a',
    400: '#334155',
    500: '#475569',
    600: '#64748b',
    700: '#94a3b8',
    800: '#cbd5f5',
    900: '#e2e8ff',
  },

  // Juridical colors
  juridical: {
    navy: '#7aa2ff',
    gold: '#fbbf24',
    darkGold: '#f59e0b',
    charcoal: '#1f2937',
    lightNavy: '#60a5fa',
    deepNavy: '#172554',
    midNavy: '#1d4ed8',
    lightGold: '#facc15',
    bronze: '#f97316',
    platinum: '#faf5ff',
  },

  // Gradients
  gradients: {
    primary: 'linear-gradient(135deg, #7d2b0e 0%, #A03612 50%, #C94416 100%)',
    gold: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #facc15 100%)',
    hero: 'linear-gradient(135deg, #0b1220 0%, #1e293b 40%, #A03612 100%)',
    card: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(148, 163, 209, 0.05) 100%)',
    glass: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
    danger: 'linear-gradient(135deg, #ef4444 0%, #f97316 50%, #facc15 100%)',
  },
};

// Layout-specific tokens
export const lightLayoutTokens = {
  nav: {
    background: 'rgba(255, 255, 255, 0.92)',
    border: '#e2e8f0',
    text: '#1f2937',
    badgeBackground: 'rgba(26, 54, 93, 0.08)',
  },
  sidebar: {
    background: 'linear-gradient(180deg, rgba(160,54,18,0.95) 0%, rgba(125,43,14,0.92) 100%)',
    border: 'rgba(160, 54, 18, 0.15)',
    text: '#f8fafc',
    muted: '#fed7aa',
    hoverBackground: 'rgba(160, 54, 18, 0.15)',
    hoverText: '#ffffff',
    activeBackground: 'linear-gradient(135deg, rgba(160,54,18,0.28) 0%, rgba(125,43,14,0.38) 100%)',
    activeBorder: '#A03612',
    activeText: '#ffffff',
    badgeBackground: 'rgba(255,255,255,0.12)',
  },
  card: {
    background: '#ffffff',
    border: '#e2e8f0',
  },
  ticker: {
    background: '#ffffff',
    text: '#252525',
    badgeBackground: 'rgba(201, 68, 22, 0.12)',
    badgeText: '#C94416',
  },
};

export const darkLayoutTokens = {
  nav: {
    background: 'rgba(17, 24, 39, 0.92)',
    border: '#1f2937',
    text: '#f8fafc',
    badgeBackground: 'rgba(124, 189, 255, 0.15)',
  },
  sidebar: {
    background: 'linear-gradient(180deg, rgba(160,54,18,0.85) 0%, rgba(125,43,14,0.88) 100%)',
    border: 'rgba(160, 54, 18, 0.25)',
    text: '#f8fafc',
    muted: '#fed7aa',
    hoverBackground: 'rgba(160, 54, 18, 0.20)',
    hoverText: '#ffffff',
    activeBackground: 'linear-gradient(135deg, rgba(160,54,18,0.35) 0%, rgba(125,43,14,0.45) 100%)',
    activeBorder: '#A03612',
    activeText: '#ffffff',
    badgeBackground: 'rgba(255, 255, 255, 0.12)',
  },
  card: {
    background: '#111827',
    border: '#1f2937',
  },
  ticker: {
    background: '#ffffff',
    text: '#252525',
    badgeBackground: 'rgba(201, 68, 22, 0.12)',
    badgeText: '#C94416',
  },
};

// Glass morphism
export const lightGlass = {
  background: 'rgba(255, 255, 255, 0.65)',
  border: '1px solid rgba(255, 255, 255, 0.35)',
  backdropFilter: 'blur(20px)',
  borderRadius: '16px',
};

export const darkGlass = {
  background: 'rgba(17, 24, 39, 0.65)',
  border: '1px solid rgba(148, 163, 184, 0.15)',
  backdropFilter: 'blur(20px)',
  borderRadius: '16px',
};
