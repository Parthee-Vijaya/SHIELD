import React, { useState, Suspense, useMemo, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import styled, { ThemeProvider, createGlobalStyle } from 'styled-components';

// Theme
import { lightTheme, darkTheme } from './theme';

// Components
import ErrorBoundary from './components/ErrorBoundary';
import PageErrorBoundary from './components/PageErrorBoundary';
import PortalFooter from './components/PortalFooter';
import PortalHeader from './components/PortalHeader';
import ToolWorkspace from './components/ToolWorkspace';
import PrivacyNotice from './components/PrivacyNotice';
import { SectionLoader } from './components/LoadingSpinner';

// Contexts
import { UserPreferencesProvider, useUserPreferences } from './contexts/UserPreferencesContext';
import { LoadingProvider } from './contexts/LoadingContext';
import { AuthProvider, RequireRole, useAuth } from './contexts/AuthContext';
import { TutorialProvider, useTutorial } from './contexts/TutorialContext';

// Command palette
import CommandPalette, { useCommandPaletteShortcut, useGotoShortcuts } from './components/command-palette/CommandPalette';
import { useNavigate } from 'react-router-dom';

// Lazy loaded pages - Optimized code splitting
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'));
const HomePage = React.lazy(() => import('./pages/HomePage'));
const ProcurementPage = React.lazy(() => import('./pages/ProcurementPage'));
const PrivacyPage = React.lazy(() => import('./pages/PrivacyPage'));
const AboutPage = React.lazy(() => import('./pages/AboutPage'));
const DriftPage = React.lazy(() => import('./pages/DriftPage'));
const EuAiActCheckerPage = React.lazy(() => import('./pages/EuAiActCheckerPage'));
const KnowledgeBasePage = React.lazy(() => import('./pages/KnowledgeBasePage'));
const ResearchPage = React.lazy(() => import('./pages/ResearchPage'));
const LawAssistantPage = React.lazy(() => import('./pages/LawAssistantPage'));
const ResourcesPage = React.lazy(() => import('./pages/ResourcesPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const AIProjectsPage = React.lazy(() => import('./pages/AIProjectsPage'));
const VurderingPage = React.lazy(() => import('./pages/DpiaAssessmentPage'));
const JuridiskScreeningPage = React.lazy(() => import('./pages/V3VurderingPage'));
const VurderingHistorikPage = React.lazy(() => import('./pages/VurderingHistorikPage'));
const SammenlignPage = React.lazy(() => import('./pages/SammenlignPage'));
const SagerPage = React.lazy(() => import('./pages/SagerPage'));
const CaseWorkspacePage = React.lazy(() => import('./pages/CaseWorkspacePage'));
const AiActAssessmentPage = React.lazy(() => import('./pages/AiActAssessmentPage'));
const FriaAssessmentPage = React.lazy(() => import('./pages/FriaAssessmentPage'));
const DocumentBankPage = React.lazy(() => import('./pages/DocumentBankPage'));
const LovOvervaagningPage = React.lazy(() => import('./pages/LovOvervaagningPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

// Theme is now imported from './theme'

const GlobalStyle = createGlobalStyle`
  :root {
    --primary: #bc4d30;
    --primary-dark: #9b4028;
    --primary-light: #c94416;
    --primary-rgb: 188, 77, 48;
    --secondary: #006f71;
    --paper: #f5f5f1;
    --paper-soft: #eeeee9;
    --surface: #fffefb;
    --ink: #252525;
    --ink-soft: #535e70;
    --ink-faded: #737985;
    --line: #c9cbc7;
    --line-soft: #dfdfd9;
    --font-body: "Geist Variable", Arial, sans-serif;
    --font-display: "Geist Variable", Arial, sans-serif;
    --font-sans: "Geist Variable", Arial, sans-serif;
    --font-serif: Georgia, "Times New Roman", serif;
    --font-mono: "Geist Mono Variable", "SF Mono", Consolas, monospace;
    --kalundborg-primary: #bc4d30;
    --kalundborg-primary-dark: #9b4028;
    --kalundborg-primary-light: #c94416;
    --kalundborg-primary-rgb: 188, 77, 48;
  }

  html {
    scroll-behavior: smooth;
    background: ${props => props.theme.colors.background};
  }

  body {
    margin: 0;
    font-family: ${props => props.theme.fonts.body};
    background-color: ${props => props.theme.colors.background};
    color: ${props => props.theme.colors.text};
    font-size: 16px;
    line-height: 1.6;
    font-feature-settings: "kern";
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    transition: background-color 0.18s ease, color 0.18s ease;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: ${props => props.theme.fonts.display};
    letter-spacing: -0.015em;
    line-height: 1.2;
    color: ${props => props.theme.colors.ink};
  }

  a {
    text-decoration: none;
    color: ${props => props.theme.colors.primary};
    transition: color ${props => props.theme.animations.transitionFast};

    &:hover {
      color: ${props => props.theme.colors.primaryDark};
    }

    &:focus-visible {
      outline: 2px solid ${props => props.theme.colors.primary};
      outline-offset: 2px;
      border-radius: 0;
    }
  }

  button {
    cursor: pointer;
    border: none;
    outline: none;
    font-family: ${props => props.theme.fonts.sans};
    background: none;

    &:focus-visible {
      outline: 2px solid ${props => props.theme.colors.primary};
      outline-offset: 2px;
      box-shadow: 0 0 0 3px rgba(188, 77, 48, 0.18);
    }
  }

  input, textarea, select {
    font-family: ${props => props.theme.fonts.sans};
    outline: none;
    transition: background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
    background-color: ${props => props.theme.colors.inputBackground};
    color: ${props => props.theme.colors.text};
    border: 1px solid ${props => props.theme.colors.border};

    &:focus {
      border-color: ${props => props.theme.colors.primary};
      box-shadow: 0 0 0 3px rgba(188, 77, 48, 0.15);
    }
  }

  /* Lov-citater renderes i Plex Serif italic for "ordret kilde"-signal */
  article p.citat, .doc p.citat, .citat {
    font-family: ${props => props.theme.fonts.serif};
    font-style: italic;
  }

  ::selection {
    background: ${props => props.theme.colors.primary};
    color: white;
  }

  ::-moz-selection {
    background: ${props => props.theme.colors.primary};
    color: white;
  }

  ::-webkit-scrollbar {
    width: 10px;
  }

  ::-webkit-scrollbar-thumb {
    background-color: ${props => props.theme.colors.gray[300]};
    border-radius: 0;

    &:hover {
      background-color: ${props => props.theme.colors.primary};
    }
  }

  ::-webkit-scrollbar-track {
    background-color: ${props => props.theme.colors.surfaceAlt};
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: ${props => props.theme.colors.background};
`;

const MainContent = styled.main`
  flex: 1;
  min-width: 0;
  width: 100%;
  background-color: ${props => props.theme.colors.background};
  color: ${props => props.theme.colors.text};
`;

const AccessDenied = styled.div`
  width: min(760px, calc(100% - 40px));
  margin: 72px auto;
  padding: 28px;
  border: 1px solid ${props => props.theme.colors.warning};
  background: ${props => props.theme.colors.warningSoft};
  color: ${props => props.theme.colors.text};

  h1 { margin-bottom: 10px; font-size: 1.5rem; }
  p { color: ${props => props.theme.colors.textMuted}; }
`;

const CASE_ROLES = [
  'Hammeren.Sagsbehandler',
  'Hammeren.Godkender',
  'Hammeren.DPO',
  'Hammeren.Admin',
];

const ProtectedPage = ({ children }) => (
  <RequireRole
    anyOf={CASE_ROLES}
    fallback={(
      <AccessDenied role="alert">
        <h1>Du har ikke adgang til sagsarbejdsrummet</h1>
        <p>Din Entra-konto skal tildeles en S.H.I.E.L.D.-rolle af kommunens administrator.</p>
      </AccessDenied>
    )}
  >
    {children}
  </RequireRole>
);

// Tiny in-Router wrapper that wires `g v`-style shortcuts (needs useNavigate
// which only works inside <Router>).
const RouterShortcuts = ({ paletteOpen, setPaletteOpen }) => {
  const navigate = useNavigate();
  const { isOpen } = useTutorial();
  useGotoShortcuts(navigate, paletteOpen || isOpen);
  useEffect(() => { if (isOpen) setPaletteOpen(false); }, [isOpen, setPaletteOpen]);
  return null;
};

// Session choice controls the UI only. API identity and permissions remain server-enforced.
const SessionBoundary = ({ children }) => {
  const { ready, isAuthenticated } = useAuth();
  const location = useLocation();
  useEffect(() => { if (ready && !isAuthenticated) queryClient.clear(); }, [ready, isAuthenticated]);
  if (location.pathname === '/login') return <Suspense fallback={<SectionLoader text="Indlæser login…" />}><LoginPage /></Suspense>;
  if (!ready) return <SectionLoader text="Forbinder til dit arbejdsrum…" />;
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return children;
};

const AppInner = () => {
  const { isAuthenticated } = useAuth();
  const { preferences } = useUserPreferences();
  const themeMode = useMemo(() => (preferences?.theme === 'dark' ? darkTheme : lightTheme), [preferences?.theme]);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode.mode);
  }, [themeMode.mode]);

  useCommandPaletteShortcut(() => { if (isAuthenticated && !document.querySelector('[data-tutorial-dialog]')) setPaletteOpen(true); });

  return (
    <ThemeProvider theme={themeMode}>
      <GlobalStyle />
      <Router>
        <SessionBoundary>
        <TutorialProvider>
        <RouterShortcuts paletteOpen={paletteOpen} setPaletteOpen={setPaletteOpen} />
        <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <AppContainer>
          <PageErrorBoundary title="Navigation fejl" message="Der opstod en fejl i navigationen. Siden kan stadig fungere.">
            <PortalHeader onOpenCommandPalette={() => setPaletteOpen(true)} />
          </PageErrorBoundary>
          <MainContent id="main-content" tabIndex="-1">
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: themeMode.colors.surface,
                  color: themeMode.colors.text,
                  borderRadius: 0,
                  border: `1px solid ${themeMode.colors.border}`,
                },
              }}
            />
            <PageErrorBoundary title="Side indlæsningsfejl" message="Der opstod en fejl ved indlæsning af siden.">
              <Suspense fallback={<SectionLoader text="Indlæser side..." />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />

                  {/* GDPR persondatapolitik (synlig fra privacy-banneret) */}
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/om-loesningen" element={<AboutPage />} />

                  {/* Drift-dashboard — observability + ops (Modul 4) */}
                  <Route path="/drift" element={<DriftPage />} />

                  {/* Primary assessment page (replaces Hurtig Tjek + Compliance Control) */}
                  <Route path="/vurdering" element={<ProtectedPage><VurderingPage /></ProtectedPage>} />
                  <Route path="/anskaffelse" element={<ProtectedPage><ProcurementPage /></ProtectedPage>} />

                  {/* Den tidligere deterministiske v3-regelmotor bevares som særskilt juridisk screening. */}
                  <Route path="/juridisk-screening" element={<ProtectedPage><JuridiskScreeningPage /></ProtectedPage>} />

                  {/* Vurderingshistorik (audit log over /api/v3/audit) */}
                  <Route path="/historik" element={<ProtectedPage><VurderingHistorikPage /></ProtectedPage>} />
                  <Route path="/historik/:id" element={<ProtectedPage><VurderingHistorikPage /></ProtectedPage>} />

                  {/* Sammenlign engines (v3 vs legacy) — Step 4 validation */}
                  <Route path="/sammenlign" element={<SammenlignPage />} />

                  {/* Sager — kanban over /api/v3/cases (Step 2 workflow) */}
                  <Route path="/sager" element={<ProtectedPage><SagerPage /></ProtectedPage>} />
                  <Route path="/sager/:caseId" element={<ProtectedPage><CaseWorkspacePage /></ProtectedPage>} />

                  {/* Sammenhængende vurderingsspor, som gemmes på den valgte sag. */}
                  <Route element={<ToolWorkspace title="AI Act" views={[
                    { path: '/ai-act-vurdering', label: 'Vurdering på en sag', element: <ProtectedPage><AiActAssessmentPage /></ProtectedPage> },
                    { path: '/eu-checker', label: 'Supplerende EU-vejviser (engelsk)', element: <EuAiActCheckerPage /> },
                  ]} />}>
                    <Route path="/ai-act-vurdering" element={<></>} />
                    <Route path="/eu-checker" element={<></>} />
                  </Route>
                  <Route path="/grundrettigheder" element={<ProtectedPage><FriaAssessmentPage /></ProtectedPage>} />
                  <Route path="/dokumentbank" element={<ProtectedPage><DocumentBankPage /></ProtectedPage>} />

                  {/* Lov-overvågning — daglig citation-verifier (Step 3) */}
                  <Route path="/lov-overvaagning" element={<ProtectedPage><LovOvervaagningPage /></ProtectedPage>} />

                  {/* Back-compat redirects from removed pages */}
                  <Route path="/hurtig-tjek" element={<Navigate to="/vurdering" replace />} />
                  <Route path="/fuld-vurdering" element={<Navigate to="/vurdering" replace />} />
                  <Route path="/v3-vurdering" element={<Navigate to="/juridisk-screening" replace />} />
                  <Route path="/dashboard" element={<Navigate to="/" replace />} />
                  <Route path="/ai-sager" element={<Navigate to="/sager" replace />} />

                  <Route element={<ToolWorkspace title="Viden og vejledning" views={[
                    { path: '/videnbase', label: 'Begreber', element: <KnowledgeBasePage /> },
                    { path: '/ressourcer', label: 'Vejledninger og rapporter', element: <ResourcesPage /> },
                  ]} />}>
                    <Route path="/videnbase" element={<></>} />
                    <Route path="/ressourcer" element={<></>} />
                  </Route>
                  <Route path="/ai-losninger" element={<AIProjectsPage />} />
                  <Route element={<ToolWorkspace title="Juridisk arbejdsrum" views={[
                    { path: '/research', label: 'Find kilder', element: <ResearchPage /> },
                    { path: '/lov-assistent', label: 'Spørg til lovgivning', element: <LawAssistantPage /> },
                  ]} />}>
                    <Route path="/research" element={<></>} />
                    <Route path="/lov-assistent" element={<></>} />
                  </Route>
                  <Route path="/indstillinger" element={<SettingsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </PageErrorBoundary>
          </MainContent>
          <PortalFooter />
          <PrivacyNotice />
        </AppContainer>
        </TutorialProvider>
        </SessionBoundary>
      </Router>
    </ThemeProvider>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <UserPreferencesProvider>
            <LoadingProvider>
              <AppInner />
            </LoadingProvider>
          </UserPreferencesProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
