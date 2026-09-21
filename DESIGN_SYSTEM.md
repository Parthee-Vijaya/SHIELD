# Judge Dredd Design System
**Kalundborg Kommune - AI Compliance Platform**

Version: 1.12.0
Sidst opdateret: 9. oktober 2025

---

## 📋 Indholdsfortegnelse

1. [Brand Identity](#brand-identity)
2. [Farvepalette](#farvepalette)
3. [Typografi](#typografi)
4. [Spacing & Layout](#spacing--layout)
5. [Komponenter](#komponenter)
6. [Animationer & Transitions](#animationer--transitions)
7. [Ikoner & Assets](#ikoner--assets)
8. [Dark Mode](#dark-mode)
9. [Responsive Design](#responsive-design)
10. [Accessibility](#accessibility)

---

## 🎨 Brand Identity

### Logo
**Fil**: `kalundborg-logo.svg`
**Placering**: `/frontend/public/kalundborg-logo.svg`

**Logo beskrivelse**:
- Kalundborg Kommune's officielle logo
- Teglrød primærfarve (#C94416)
- Indeholder kommunevåben med arkitektoniske elementer
- Tekst: "KALUNDBORG KOMMUNE"

**Logo usage**:
```jsx
// React import
<img src="/kalundborg-logo.svg" alt="Kalundborg Kommune" />

// Navbar usage
<Logo src="/kalundborg-logo.svg" alt="Kalundborg Kommune" />
```

**Logo sizing**:
- Desktop navbar: `max-width: 150px`
- Mobile navbar: `max-width: 120px`
- Footer: `width: 40px, height: 40px`

### Brand Name
**Project Name**: Judge Dredd
**Tagline**: "AI Compliance Control Platform"
**Full title**: "Project Judge Dredd - Compliance Control"

---

## 🎨 Farvepalette

### Primary Colors (Kalundborg Kommune)

```css
/* Teglrød (Brick Red) - Hovedfarve */
--kalundborg-primary: #C94416;
--kalundborg-primary-dark: #A03612;
--kalundborg-primary-light: #E85A28;
--kalundborg-secondary: #BC4D30;

/* RGB format for opacity */
--kalundborg-primary-rgb: 201, 68, 22;
```

**Hvor bruges teglrød?**:
- Primary buttons og CTAs
- Links og hover states
- Active navigation items
- Brand accents
- Focus states og outlines
- Gradients og hero sections

### Semantic Colors

#### Light Mode
```css
/* Semantic colors */
--success: #2f855a;
--warning: #d69e2e;
--danger: #c53030;
--accent: #b8860b; /* Gold accent */

/* Text colors */
--text-primary: #252525; /* Kalundborg text dark */
--text-muted: #64748b;

/* Surface colors */
--background: #f4f7fb;
--surface: #ffffff;
--surface-alt: #f1f5f9;
--border: #e2e8f0;
--input-background: #ffffff;
```

#### Dark Mode
```css
/* Semantic colors */
--success: #22c55e;
--warning: #fbbf24;
--danger: #f87171;
--accent: #fbbf24; /* Gold accent */

/* Text colors */
--text-primary: #e2e8f0;
--text-muted: #94a3b8;

/* Surface colors */
--background: #0b1220;
--surface: #111827;
--surface-alt: #1e293b;
--border: #1f2937;
--input-background: #1e293b;
```

### Grayscale

```css
/* Light mode grays */
gray-50: #f7fafc;
gray-100: #edf2f7;
gray-200: #e2e8f0;
gray-300: #cbd5e1;
gray-400: #a0aec0;
gray-500: #718096;
gray-600: #4a5568;
gray-700: #2d3748;
gray-800: #252525; /* Aligned with Kalundborg dark */
gray-900: #171923;
```

### Gradients

```css
/* Primary gradient - Kalundborg teglrød */
background: linear-gradient(135deg, #C94416 0%, #E85A28 50%, #F07040 100%);

/* Secondary gradient */
background: linear-gradient(135deg, #BC4D30 0%, #C94416 50%, #E85A28 100%);

/* Hero gradient */
background: linear-gradient(135deg, #A03612 0%, #C94416 25%, #E85A28 75%, #F07040 100%);

/* Danger gradient */
background: linear-gradient(135deg, #c53030 0%, #e53e3e 50%, #f56565 100%);

/* Gold accent gradient */
background: linear-gradient(135deg, #b8860b 0%, #d4af37 50%, #f6e05e 100%);

/* Glass effect gradient */
background: linear-gradient(145deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 100%);
```

---

## 📝 Typografi

### Font Family
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

**Import**:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

### Font Weights
- Light: `300`
- Regular: `400`
- Medium: `500`
- Semibold: `600`
- Bold: `700`

### Font Sizes
```css
/* Headings */
h1: 2.5rem (40px) - font-weight: 700
h2: 2rem (32px) - font-weight: 700
h3: 1.5rem (24px) - font-weight: 600
h4: 1.25rem (20px) - font-weight: 600
h5: 1.125rem (18px) - font-weight: 600
h6: 1rem (16px) - font-weight: 600

/* Body text */
body: 1rem (16px) - font-weight: 400 - line-height: 1.6
small: 0.875rem (14px)
tiny: 0.75rem (12px)

/* Navbar */
nav-brand: 1.05rem (16.8px) - font-weight: 700
nav-subtitle: 0.75rem (12px) - font-weight: 500

/* Footer */
footer-heading: 1.1rem (17.6px) - font-weight: 700
footer-brand: 1.25rem (20px) - font-weight: 700
footer-text: 0.875rem (14px) - font-weight: 500
```

### Line Heights
```css
--line-height-tight: 1.1;
--line-height-normal: 1.2;
--line-height-relaxed: 1.6;
--line-height-loose: 1.8;
```

---

## 📐 Spacing & Layout

### Spacing Scale (8pt Grid System)
```css
--spacing-xs: 0.25rem (4px);
--spacing-sm: 0.5rem (8px);
--spacing-md: 1rem (16px);
--spacing-lg: 1.5rem (24px);
--spacing-xl: 2rem (32px);
--spacing-2xl: 3rem (48px);
--spacing-3xl: 4rem (64px);
```

### Border Radius
```css
--border-radius: 12px; /* Standard */
--border-radius-large: 16px; /* Cards, modals */
--border-radius-small: 10px; /* Inputs, badges */
--border-radius-full: 999px; /* Pills, avatars */
```

### Shadows
```css
/* Elevation levels */
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04);

/* Special shadows */
--shadow-glass: 0 8px 32px 0 rgba(201, 68, 22, 0.37);
--shadow-glow: 0 0 24px rgba(201, 68, 22, 0.35);
--shadow-focus: 0 0 0 3px rgba(201, 68, 22, 0.18);
```

### Layout Grid
```css
/* Max widths */
--container-sm: 640px;
--container-md: 768px;
--container-lg: 1024px;
--container-xl: 1200px;

/* Sidebar */
--sidebar-width: 250px;
--sidebar-collapsed-width: 80px;
```

---

## 🧩 Komponenter

### Buttons

#### Primary Button
```jsx
<button style={{
  background: 'linear-gradient(135deg, #C94416 0%, #E85A28 100%)',
  color: '#ffffff',
  padding: '0.75rem 1.5rem',
  borderRadius: '12px',
  fontSize: '1rem',
  fontWeight: '600',
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}}>
  Primary Button
</button>
```

**Hover state**:
```css
transform: translateY(-2px);
box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 0 24px rgba(201, 68, 22, 0.35);
```

#### Secondary Button
```jsx
<button style={{
  background: 'transparent',
  color: '#C94416',
  padding: '0.75rem 1.5rem',
  borderRadius: '12px',
  fontSize: '1rem',
  fontWeight: '600',
  border: '2px solid #C94416',
  cursor: 'pointer',
  transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}}>
  Secondary Button
</button>
```

**Hover state**:
```css
background: #C94416;
color: #ffffff;
transform: translateY(-2px);
```

#### Disabled Button
```css
opacity: 0.5;
cursor: not-allowed;
pointer-events: none;
```

### Cards

#### Standard Card
```jsx
<div style={{
  background: '#ffffff',
  borderRadius: '16px',
  padding: '2rem',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  border: '1px solid #e2e8f0',
  transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}}>
  Card content
</div>
```

**Hover state**:
```css
box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
transform: translateY(-2px);
```

#### Glassmorphism Card
```css
background: rgba(255, 255, 255, 0.65);
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.35);
border-radius: 16px;
box-shadow: 0 8px 32px 0 rgba(201, 68, 22, 0.37);
```

### Inputs

#### Text Input
```jsx
<input type="text" style={{
  width: '100%',
  padding: '0.75rem 1rem',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  fontSize: '1rem',
  color: '#252525',
  transition: '0.15s cubic-bezier(0.4, 0, 0.2, 1)'
}} />
```

**Focus state**:
```css
border-color: #C94416;
box-shadow: 0 0 0 3px rgba(201, 68, 22, 0.12);
outline: none;
```

### Badges

#### Status Badge
```jsx
<span style={{
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.25rem 0.75rem',
  borderRadius: '999px',
  fontSize: '0.875rem',
  fontWeight: '600',
  background: 'rgba(201, 68, 22, 0.08)',
  color: '#C94416',
  border: '1px solid rgba(201, 68, 22, 0.2)'
}}>
  Badge
</span>
```

#### Risk Level Badges
```css
/* Unacceptable - Red */
background: rgba(197, 48, 48, 0.1);
color: #c53030;
border: 1px solid rgba(197, 48, 48, 0.2);

/* High - Orange */
background: rgba(214, 158, 46, 0.1);
color: #d69e2e;
border: 1px solid rgba(214, 158, 46, 0.2);

/* Limited - Blue */
background: rgba(59, 130, 246, 0.1);
color: #3b82f6;
border: 1px solid rgba(59, 130, 246, 0.2);

/* Minimal - Green */
background: rgba(47, 133, 90, 0.1);
color: #2f855a;
border: 1px solid rgba(47, 133, 90, 0.2);
```

### Navigation

#### Navbar
```css
background: rgba(255, 255, 255, 0.92);
backdrop-filter: blur(10px);
padding: 1rem 2rem;
border-bottom: 1px solid #e2e8f0;
```

#### Sidebar
```css
background: linear-gradient(180deg, rgba(201,68,22,0.95) 0%, rgba(160,54,18,0.92) 100%);
width: 250px;
height: 100vh;
position: fixed;
color: #f8fafc;
transition: 0.3s ease;
```

**Active menu item**:
```css
background: linear-gradient(135deg, rgba(232,90,40,0.28) 0%, rgba(201,68,22,0.38) 100%);
border-left: 3px solid #d4af37;
color: #ffffff;
font-weight: 600;
```

### Ticker

```css
background: linear-gradient(135deg, #C94416 0%, #E85A28 100%);
color: #ffffff;
padding: 0.75rem 1.5rem;
border-radius: 12px;
font-size: 0.875rem;
font-weight: 600;
animation: ticker 30s linear infinite;
```

---

## ⚡ Animationer & Transitions

### Timing Functions
```css
/* Standard easing curves */
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

/* Special easing */
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
```

### Transition Speeds
```css
--transition-fast: 0.15s;
--transition-normal: 0.3s;
--transition-slow: 0.5s;
```

### Common Transitions
```css
/* Hover lift effect */
transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
&:hover {
  transform: translateY(-2px);
}

/* Fade in */
animation: fadeIn 0.3s ease-in-out;
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Slide in from left */
animation: slideInLeft 0.3s ease-out;
@keyframes slideInLeft {
  from { transform: translateX(-20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* Pulse effect */
animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

/* Spin (for loaders) */
animation: spin 1s linear infinite;
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

---

## 🎭 Ikoner & Assets

### Icon Library
**Library**: React Icons
**Package**: `react-icons`

```bash
npm install react-icons
```

### Commonly Used Icons
```jsx
import {
  FaHome,
  FaBalanceScale,
  FaShieldAlt,
  FaLightbulb,
  FaBook,
  FaHistory,
  FaCog,
  FaSearch,
  FaSun,
  FaMoon,
  FaBell,
  FaCheckCircle,
  FaExclamationTriangle,
  FaSpinner,
  FaChevronDown,
  FaMapMarkerAlt,
  FaEnvelope,
} from 'react-icons/fa';
```

### Icon Styling
```css
/* Standard icon size */
font-size: 1.25rem (20px);

/* Small icon */
font-size: 1rem (16px);

/* Large icon */
font-size: 1.5rem (24px);

/* Icon with text */
display: inline-flex;
align-items: center;
gap: 0.5rem;
```

### Logo Asset
**Primary Logo**: `/frontend/public/kalundborg-logo.svg`
**Format**: SVG (scalable)
**Colors**: Teglrød (#C94416) + White
**Usage**: Navbar, Footer, Hero sections

---

## 🌓 Dark Mode

### Theme Toggle
Dark mode supports bruges gennem React Context og styled-components ThemeProvider.

```jsx
import { useUserPreferences } from '../contexts/UserPreferencesContext';

const { preferences, updatePreferences } = useUserPreferences();
const isDark = preferences.theme === 'dark';

// Toggle function
const toggleTheme = () => {
  updatePreferences({ theme: isDark ? 'light' : 'dark' });
};
```

### Dark Mode Color Adjustments

#### Primary Colors
- Light mode primary: `#A03612` (darker)
- Dark mode primary: `#E85A28` (lighter for contrast)

#### Surfaces
- Light mode surface: `#ffffff`
- Dark mode surface: `#111827`

#### Text
- Light mode text: `#252525`
- Dark mode text: `#e2e8f0`

#### Borders
- Light mode border: `#e2e8f0`
- Dark mode border: `#1f2937`

### Dark Mode Best Practices
1. **Always test both modes** when creating components
2. **Use theme tokens** instead of hardcoded colors
3. **Maintain sufficient contrast** (WCAG AA minimum)
4. **Adjust shadow opacity** for dark backgrounds
5. **Test glassmorphism effects** in dark mode

---

## 📱 Responsive Design

### Breakpoints
```css
/* Mobile first approach */
--breakpoint-sm: 640px;  /* Small devices */
--breakpoint-md: 768px;  /* Tablets */
--breakpoint-lg: 1024px; /* Laptops */
--breakpoint-xl: 1200px; /* Desktops */
```

### Media Queries
```css
/* Mobile */
@media (max-width: 640px) {
  /* Mobile styles */
}

/* Tablet */
@media (min-width: 641px) and (max-width: 968px) {
  /* Tablet styles */
}

/* Desktop */
@media (min-width: 969px) {
  /* Desktop styles */
}
```

### Responsive Typography
```css
/* Mobile */
h1: 1.875rem (30px);
h2: 1.5rem (24px);
body: 0.875rem (14px);

/* Tablet */
h1: 2.25rem (36px);
h2: 1.75rem (28px);
body: 0.9375rem (15px);

/* Desktop */
h1: 2.5rem (40px);
h2: 2rem (32px);
body: 1rem (16px);
```

### Responsive Spacing
```css
/* Mobile */
padding: 1rem; /* 16px */
margin: 1rem;

/* Tablet */
padding: 1.5rem; /* 24px */
margin: 1.5rem;

/* Desktop */
padding: 2rem; /* 32px */
margin: 2rem;
```

---

## ♿ Accessibility

### Focus States
```css
/* All interactive elements */
&:focus-visible {
  outline: 2px solid #C94416;
  outline-offset: 2px;
  box-shadow: 0 0 0 3px rgba(201, 68, 22, 0.18);
  border-radius: 2px;
}
```

### Color Contrast
- **Text on white**: Minimum contrast ratio 4.5:1 (WCAG AA)
- **Text on teglrød**: Use white text (#ffffff) for sufficient contrast
- **Links**: Ensure 3:1 contrast with surrounding text

### Text Selection
```css
::selection {
  background: #C94416;
  color: white;
}

::-moz-selection {
  background: #C94416;
  color: white;
}
```

### Semantic HTML
- Use proper heading hierarchy (h1 → h6)
- Use `<button>` for clickable actions
- Use `<a>` for navigation links
- Include `alt` text for all images
- Use `aria-label` for icon-only buttons

### Keyboard Navigation
- All interactive elements are keyboard accessible
- Tab order follows visual flow
- Focus indicators are clearly visible
- Escape closes modals and dropdowns

---

## 🔧 Implementation

### React + styled-components

```jsx
import styled from 'styled-components';

const Button = styled.button`
  background: ${props => props.theme.colors.primary};
  color: #ffffff;
  padding: 0.75rem 1.5rem;
  border-radius: ${props => props.theme.borderRadius};
  font-size: 1rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  box-shadow: ${props => props.theme.shadows.md};
  transition: ${props => props.theme.animations.transition};

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${props => props.theme.shadows.lg}, ${props => props.theme.shadows.glow};
  }

  &:focus-visible {
    outline: 2px solid ${props => props.theme.colors.primary};
    outline-offset: 2px;
    box-shadow: ${props => props.theme.shadows.focus};
  }
`;
```

### CSS Variables (Vanilla CSS)

```css
:root {
  /* Colors */
  --color-primary: #C94416;
  --color-primary-dark: #A03612;
  --color-primary-light: #E85A28;

  /* Spacing */
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;

  /* Borders */
  --border-radius: 12px;

  /* Shadows */
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);

  /* Transitions */
  --transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.button-primary {
  background: var(--color-primary);
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-md);
  transition: all var(--transition);
}
```

---

## 📦 Export til Andet Projekt

### Nødvendige Filer
1. **Logo**: `kalundborg-logo.svg`
2. **Theme config**: `theme.js` (full color palette)
3. **Global styles**: CSS variables og reset styles

### Quick Setup Guide

#### Step 1: Installer Dependencies
```bash
npm install styled-components react-icons
```

#### Step 2: Kopier Theme Config
Kopier `theme.js` til dit nye projekt:
- Farvepalette (light + dark)
- Typography tokens
- Spacing scale
- Shadows & animations

#### Step 3: Kopier Logo
Kopier `kalundborg-logo.svg` til `/public` mappen.

#### Step 4: Import Theme
```jsx
import { ThemeProvider } from 'styled-components';
import { lightTheme, darkTheme } from './theme';

function App() {
  const [theme, setTheme] = useState('light');
  const currentTheme = theme === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeProvider theme={currentTheme}>
      {/* Your app */}
    </ThemeProvider>
  );
}
```

---

## 📚 Reference Links

- **Styled Components**: https://styled-components.com/
- **React Icons**: https://react-icons.github.io/react-icons/
- **Inter Font**: https://rsms.me/inter/
- **Kalundborg Kommune**: https://kalundborg.dk/

---

## 📝 Version History

- **v1.12.0** (9. okt 2025): Initial design system documentation
- **v1.11.0** (9. okt 2025): Phased UI implementation
- **v1.10.0** (9. okt 2025): Progress tracking improvements
- **v1.9.0** (8. okt 2025): Web search integration

---

## 💡 Tips & Best Practices

### Do's ✅
- Use theme tokens for all colors
- Implement proper dark mode support
- Test accessibility (keyboard, screen readers)
- Use semantic HTML
- Maintain consistent spacing
- Add focus states to all interactive elements
- Use proper heading hierarchy
- Test on mobile, tablet, and desktop

### Don'ts ❌
- Don't hardcode colors (use theme tokens)
- Don't skip focus states
- Don't use low contrast colors
- Don't break responsive design
- Don't forget alt text on images
- Don't use only color to convey information
- Don't skip dark mode testing

---

**Developed by**: Kalundborg Kommune
**Platform**: Judge Dredd - AI Compliance Control
**License**: Internal use only

For questions or contributions, contact the development team.
