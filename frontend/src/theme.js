/** S.H.I.E.L.D. — Kalundborg editorial civic design system. */
import { layoutTokens, typographyTokens } from './theme/layout';

const commonThemeTokens = {
  layout: layoutTokens,
  typography: typographyTokens,
  fonts: {
    main: '"Geist Variable", Arial, sans-serif',
    body: '"Geist Variable", Arial, sans-serif',
    display: '"Geist Variable", Arial, sans-serif',
    sans: '"Geist Variable", Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: '"Geist Mono Variable", "SF Mono", Consolas, monospace',
  },
  borderRadius: '0px',
  borderRadiusLarge: '0px',
  shadows: {
    sm: '0 1px 2px rgba(37, 37, 37, 0.04)',
    md: '0 8px 20px rgba(37, 37, 37, 0.07)',
    lg: '0 22px 56px rgba(37, 37, 37, 0.14)',
    xl: '0 30px 72px rgba(37, 37, 37, 0.18)',
    glass: '0 8px 26px rgba(37, 37, 37, 0.08)',
    glow: '0 0 0 3px rgba(188, 77, 48, 0.12)',
    focus: '0 0 0 3px rgba(188, 77, 48, 0.18)',
  },
  animations: {
    transition: '0.18s ease-out',
    transitionFast: '0.1s ease-out',
    transitionSlow: '0.28s ease-out',
    bounce: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

export const lightTheme = {
  ...commonThemeTokens,
  mode: 'light',
  colors: {
    // Kalundborg warm/cool civic palette.
    primary: '#bc4d30',
    primaryDark: '#9b4028',
    primaryLight: '#c94416',
    primarySoft: '#f8edea',
    primaryShallow: '#fbf5f3',
    primaryBg: '#f8edea',
    secondary: '#006f71',

    bronze: '#bc4d30',
    bronzeDark: '#9b4028',
    bronzeLight: '#d47b61',
    bronzeSoft: '#f8edea',

    // Semantic
    accent: '#b08a4a',
    success: '#246042',
    successLight: '#2f7954',
    successSoft: '#deece3',
    warning: '#875f0c',
    warningSoft: '#f5ecd2',
    danger: '#9b302b',
    dangerDark: '#7f2420',
    dangerLight: '#c35048',
    dangerSoft: '#f4e0dd',
    info: '#006f71',
    infoLight: '#2c8c8e',

    // Legacy alias (Kalundborg teglrød kun til ekstrem-CTA / NO-GO)
    teglrod: '#c94416',

    dark: '#252525',
    light: '#f5f5f1',
    white: '#fffefb',

    // Surface — Northern Modern off-white
    background: '#f5f5f1',
    surface: '#fffefb',
    surfaceAlt: '#eeeee9',
    paper: '#f5f5f1',
    paperSoft: '#eeeee9',
    card: '#fffefb',

    // Text
    text: '#252525',
    textMuted: '#535e70',
    textFaded: '#737985',
    ink: '#252525',
    inkSoft: '#535e70',
    inkFaded: '#737985',

    // Lines
    border: '#c9cbc7',
    borderSoft: '#dfdfd9',
    line: '#c9cbc7',
    lineSoft: '#dfdfd9',
    inputBackground: '#fffefb',

    // Gray (preserved for legacy components)
    gray: {
      50: '#f5f5f1',
      100: '#eeeee9',
      200: '#dfdfd9',
      300: '#c9cbc7',
      400: '#9a9fa6',
      500: '#737985',
      600: '#535e70',
      700: '#3b414b',
      800: '#252525',
      900: '#161616',
    },

    // Kalundborg-spec (legacy alias — bevares til NO-GO + Kalundborg-logo)
    kalundborg: {
      teglrod: '#bc4d30',
      teglrodDark: '#9b4028',
      teglrodLight: '#c94416',
      buttonSecondary: '#006f71',
      textDark: '#252525',
      bronze: '#bc4d30',
      platinum: '#e5e4e2',
    },

    // Gradients (sjælden brug — Northern Modern er low-gradient)
    gradients: {
      primary: 'linear-gradient(135deg, #9b4028 0%, #bc4d30 100%)',
      secondary: 'linear-gradient(135deg, #005f61 0%, #006f71 100%)',
      hero: 'linear-gradient(135deg, #f5f5f1 0%, #f8edea 100%)',
      card: 'linear-gradient(145deg, #fffefb 0%, #f5f5f1 100%)',
      glass: 'linear-gradient(145deg, rgba(255,254,251,0.94) 0%, rgba(245,245,241,0.88) 100%)',
      danger: 'linear-gradient(135deg, #7f2420 0%, #9b302b 100%)',
      gold: 'linear-gradient(135deg, #9b4028 0%, #bc4d30 100%)',
    },
  },

  glass: {
    background: 'rgba(255, 254, 251, 0.92)',
    border: '1px solid #c9cbc7',
    backdropFilter: 'blur(8px)',
    borderRadius: '0px',
  },

  layout: {
    nav: {
      background: 'rgba(255, 254, 251, 0.96)',
      border: '#c9cbc7',
      text: '#252525',
      badgeBackground: '#f8edea',
    },
    sidebar: {
      background: '#fffefb',
      backgroundSolid: '#fffefb',
      border: '#c9cbc7',
      text: '#252525',
      muted: '#737985',
      hoverBackground: '#eeeee9',
      hoverText: '#252525',
      activeBackground: '#f8edea',
      activeBorder: '#bc4d30',
      activeText: '#9b4028',
      badgeBackground: '#eeeee9',
    },
    card: {
      background: '#fffefb',
      border: '#c9cbc7',
    },
    ticker: {
      background: '#d9e9ea',
      text: '#005f61',
      badgeBackground: '#f8edea',
      badgeText: '#9b4028',
    },
  },
};

export const darkTheme = {
  ...commonThemeTokens,
  mode: 'dark',
  colors: {
    // Kalundborg terracotta and teal, lifted for dark surfaces.
    primary: '#bc4d30',
    primaryDark: '#9b4028',
    primaryLight: '#edaa96',
    primarySoft: 'rgba(224, 128, 100, 0.17)',
    primaryShallow: 'rgba(224, 128, 100, 0.08)',
    primaryBg: 'rgba(224, 128, 100, 0.12)',
    secondary: '#55b4b6',

    // Bronze (lighter)
    bronze: '#d4a866',
    bronzeDark: '#b08a4a',
    bronzeLight: '#e0bc7c',
    bronzeSoft: 'rgba(212, 168, 102, 0.16)',

    // Semantic
    accent: '#d4a866',
    success: '#7eaf78',
    successLight: '#9ac495',
    successSoft: 'rgba(126, 175, 120, 0.14)',
    warning: '#d4a866',
    warningSoft: 'rgba(212, 168, 102, 0.16)',
    danger: '#d65c4d',
    dangerDark: '#b54339',
    dangerLight: '#e47d70',
    dangerSoft: 'rgba(214, 92, 77, 0.14)',
    info: '#55b4b6',
    infoLight: '#82cdcf',

    teglrod: '#e85a28',

    dark: '#0a0c10',
    light: '#14181f',
    white: '#f0eee9',

    // Surface — dark cool warm
    background: '#14181f',
    surface: '#1c2129',
    surfaceAlt: '#252a32',
    paper: '#14181f',
    paperSoft: '#1c2129',
    card: '#1c2129',

    // Text
    text: '#f0eee9',
    textMuted: '#a8aaae',
    textFaded: '#6a6d72',
    ink: '#f0eee9',
    inkSoft: '#a8aaae',
    inkFaded: '#6a6d72',

    // Lines
    border: '#2e333c',
    borderSoft: '#252a32',
    line: '#2e333c',
    lineSoft: '#252a32',
    inputBackground: '#1c2129',

    gray: {
      50: '#14181f',
      100: '#1c2129',
      200: '#252a32',
      300: '#2e333c',
      400: '#6a6d72',
      500: '#a8aaae',
      600: '#c8cacd',
      700: '#e0e0e0',
      800: '#f0eee9',
      900: '#ffffff',
    },

    kalundborg: {
      teglrod: '#e08064',
      teglrodDark: '#bc4d30',
      teglrodLight: '#edaa96',
      buttonSecondary: '#55b4b6',
      textDark: '#f0eee9',
      bronze: '#d4a866',
      platinum: '#faf5ff',
    },

    gradients: {
      primary: 'linear-gradient(135deg, #bc4d30 0%, #e08064 100%)',
      secondary: 'linear-gradient(135deg, #287f81 0%, #55b4b6 100%)',
      hero: 'linear-gradient(135deg, #14181f 0%, #1c2129 100%)',
      card: 'linear-gradient(145deg, #1c2129 0%, #14181f 100%)',
      glass: 'linear-gradient(145deg, rgba(28,33,41,0.85) 0%, rgba(20,24,31,0.75) 100%)',
      danger: 'linear-gradient(135deg, #a52822 0%, #d65c4d 100%)',
      gold: 'linear-gradient(135deg, #b08a4a 0%, #d4a866 100%)',
    },
  },

  glass: {
    background: 'rgba(20, 24, 31, 0.92)',
    border: '1px solid #2e333c',
    backdropFilter: 'blur(8px)',
    borderRadius: '0px',
  },

  layout: {
    nav: {
      background: 'rgba(20, 24, 31, 0.92)',
      border: '#2e333c',
      text: '#f0eee9',
      badgeBackground: 'rgba(224, 128, 100, 0.17)',
    },
    sidebar: {
      background: '#14181f',
      backgroundSolid: '#14181f',
      border: '#2e333c',
      text: '#f0eee9',
      muted: '#6a6d72',
      hoverBackground: '#1c2129',
      hoverText: '#ffffff',
      activeBackground: 'rgba(224, 128, 100, 0.14)',
      activeBorder: '#e08064',
      activeText: '#edaa96',
      badgeBackground: 'rgba(255, 255, 255, 0.06)',
    },
    card: {
      background: '#1c2129',
      border: '#2e333c',
    },
    ticker: {
      background: 'rgba(85, 180, 182, 0.14)',
      text: '#82cdcf',
      badgeBackground: 'rgba(212, 168, 102, 0.20)',
      badgeText: '#d4a866',
    },
  },
};

// Legacy juridical color aliases (preserved for components that still reference)
lightTheme.colors.juridical = {
  navy: '#0d2e54',
  gold: '#b08a4a',
  darkGold: '#8e6e35',
  charcoal: '#14181f',
  lightNavy: '#1c4a7d',
  deepNavy: '#082040',
  midNavy: '#15396a',
  lightGold: '#c9a360',
  bronze: '#b08a4a',
  platinum: '#e5e4e2',
};

darkTheme.colors.juridical = {
  navy: '#5a8ec4',
  gold: '#d4a866',
  darkGold: '#b08a4a',
  charcoal: '#1c2129',
  lightNavy: '#7ca7d6',
  deepNavy: '#0d2e54',
  midNavy: '#3d6da3',
  lightGold: '#e0bc7c',
  bronze: '#d4a866',
  platinum: '#faf5ff',
};

const themes = { lightTheme, darkTheme };
export default themes;
