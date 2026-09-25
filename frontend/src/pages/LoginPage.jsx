import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import BRAND from '../config/brand';
import { useAuth } from '../contexts/AuthContext';

const Page = styled.main`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  font-family: ${p => p.theme.fonts.body};
  h1, h2, p, strong { overflow-wrap: anywhere; }
`;
const Header = styled.header`
  width: 100%; max-width: 1320px; margin-inline: auto;
  padding: 32px; box-sizing: border-box;
  display: flex; align-items: center; flex-wrap: wrap; gap: 14px;
  strong { font-size: 1.3rem; letter-spacing: .08em; font-weight: 650; }
  span { padding: 4px 7px; border: 1px solid ${p => p.theme.colors.border}; border-radius: ${p => p.theme.borderRadius}; font: 500 .72rem ${p => p.theme.fonts.mono}; color: ${p => p.theme.colors.textMuted}; }
  @media (max-width: 640px) { padding: 24px 20px; }
  @media (max-width: 400px) { padding-inline: 14px; }
`;
const Content = styled.div`
  width: 100%; max-width: 1320px; margin: auto; padding: 48px 32px 80px;
  box-sizing: border-box; display: grid; align-items: center;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: clamp(40px, 7vw, 104px);
  @media (max-width: 900px) { gap: 36px; }
  @media (max-width: 760px) { grid-template-columns: 1fr; padding-top: 20px; gap: 32px; }
  @media (max-width: 640px) { padding: 16px 20px 40px; }
  @media (max-width: 400px) { padding-inline: 14px; }
`;
const Introduction = styled.section`
  min-width: 0;
  .eyebrow { margin-bottom: 18px; font-size: .73rem; font-weight: 650; letter-spacing: .12em; text-transform: uppercase; color: ${p => p.theme.colors.textMuted}; }
  h2 { margin: 0 0 24px; max-width: 13ch; font-size: clamp(2.4rem, 4.2vw, 3.75rem); font-weight: 560; line-height: 1.09; letter-spacing: -.045em; color: inherit; }
  h2 span { color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primary}; }
  p { max-width: 46ch; color: ${p => p.theme.colors.textMuted}; font-size: 1rem; line-height: 1.75; margin: 0; }
  ol { list-style: none; padding: 0; margin: 36px 0 0; }
  li { display: flex; align-items: flex-start; gap: 14px; padding: 16px 0; border-top: 1px solid ${p => p.theme.colors.borderSoft}; }
  li > span { flex-shrink: 0; font: 500 .75rem/1.7 ${p => p.theme.fonts.mono}; color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark}; }
  li strong { display: block; margin-bottom: 5px; font-size: .93rem; font-weight: 600; }
  li p { font-size: .86rem; }
  @media (max-width: 760px) {
    h2 { max-width: 17ch; font-size: clamp(2.25rem, 7vw, 3rem); margin-bottom: 16px; }
    ol { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 24px; }
    li { gap: 9px; padding: 12px 0 0; } li p { font-size: .8rem; }
  }
  @media (max-width: 520px) { ol { grid-template-columns: 1fr; gap: 0; } li { padding: 12px 0; } }
`;
const Access = styled.section`
  min-width: 0; padding: clamp(24px, 3vw, 40px);
  border: 1px solid ${p => p.theme.colors.border}; border-radius: ${p => p.theme.borderRadiusLarge};
  background: ${p => p.theme.colors.surface}; box-shadow: ${p => p.theme.shadows.md};
  > div { width: 100%; }
  .organisation { display: block; width: 172px; max-width: 100%; height: auto; margin-bottom: 28px; }
  .organisation-divider { border-top: 1px solid ${p => p.theme.colors.borderSoft}; padding-top: 26px; }
  .eyebrow { font-size: .75rem; font-weight: 650; color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark}; letter-spacing: .08em; text-transform: uppercase; }
  h1 { margin: 12px 0 14px; font-size: clamp(1.65rem, 2.4vw, 2rem); line-height: 1.18; font-weight: 560; letter-spacing: -.035em; }
  p { color: ${p => p.theme.colors.textMuted}; font-size: .93rem; line-height: 1.65; }
  .identity { margin-block: 26px 20px; display: flex; gap: 12px; align-items: center; }
  .initial { display: grid; place-items: center; flex-shrink: 0; width: 44px; height: 44px; border-radius: 50%; font-weight: 650; background: ${p => p.theme.colors.primarySoft}; color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark}; }
  .identity strong, .identity small { display: block; }
  .identity small { color: ${p => p.theme.colors.textMuted}; margin-top: 4px; font-size: .8rem; }
  .local-notice { font-size: .78rem; margin: 16px 0 0; }
  .error { padding: 14px 16px; margin: 20px 0; border-radius: ${p => p.theme.borderRadius}; background: ${p => p.theme.colors.dangerSoft}; color: ${p => p.theme.mode === 'dark' ? p.theme.colors.dangerLight : p.theme.colors.dangerDark}; }
  .support { border-top: 1px solid ${p => p.theme.colors.borderSoft}; margin-top: 26px; padding-top: 20px; font-size: .8rem; }
  @media (max-width: 760px) { max-width: 560px; width: 100%; box-sizing: border-box; }
  @media (max-width: 400px) { padding: 22px; }
`;
const Button = styled.button`
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; min-height: 48px; padding: 12px 20px; margin-top: 20px;
  border: 1px solid ${p => p.theme.colors.primary}; background: ${p => p.theme.colors.primary};
  border-radius: ${p => p.theme.borderRadius};
  color: #fff; font: inherit; font-size: .94rem; font-weight: 600;
  cursor: pointer; &:hover { background: ${p => p.theme.colors.primaryDark}; }
  &:focus-visible { outline: 3px solid ${p => p.theme.colors.text}; outline-offset: 4px; }
  &:disabled { opacity: .65; cursor: wait; }
`;

export function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return '/';
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.replace(/\/+$/, '') === '/login') return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/'; }
}

export default function LoginPage() {
  const { ready, error, user, availableUser, canLogin, isAuthenticated, isDevelopmentIdentity, login, retry } = useAuth();
  const location = useLocation();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState('');
  const returnTo = safeReturnPath(new URLSearchParams(location.search).get('returnTo'));
  if (isAuthenticated && user) return <Navigate to={returnTo} replace />;
  const start = async () => {
    setPending(true); setActionError('');
    try { await login(); } catch (err) { setActionError(err.message || 'Sessionen kunne ikke startes. Prøv igen.'); } finally { setPending(false); }
  };
  const name = availableUser?.name;
  return <Page id="main-content">
    <Header><strong>{BRAND.name}</strong><span>{BRAND.version}</span></Header>
    <Content>
    <Introduction aria-label="Om SHIELD">
      <div>
        <div className="eyebrow">Dokumentation · Vurdering · Ansvar</div>
        <h2>Fra AI-idé til <span>oplyst beslutning.</span></h2>
        <p>Saml dokumentationen, forstå risiciene og skab et fælles grundlag for den faglige og juridiske vurdering.</p>
        <ol>
          <li><span>01</span><div><strong>Saml grundlaget</strong><p>Beskriv AI-løsningen, og tilføj leverandørens dokumentation.</p></div></li>
          <li><span>02</span><div><strong>Få overblik over risici</strong><p>AI udarbejder et udkast med kilder, mangler og afklaringer.</p></div></li>
          <li><span>03</span><div><strong>Gennemgå og dokumentér</strong><p>Fagpersoner vurderer, fordeler ansvar og godkender.</p></div></li>
        </ol>
      </div>
    </Introduction>
    <Access aria-labelledby="login-heading"><div>
      <img className="organisation" src={BRAND.organisationLogoPath} alt={BRAND.organisation} width="172" height="57" />
      <div className="organisation-divider"><span className="eyebrow">Dit arbejdsrum for AI-vurderinger</span></div>
      <h1 id="login-heading">Velkommen til SHIELD</h1>
      <p>Fortsæt til dine sager, konsekvensanalyser og risikovurderinger.</p>
      {!ready && <p role="status">Forbinder til dit arbejdsrum…</p>}
      {(error || actionError) && <p role="alert" className="error">{actionError || error}</p>}
      {ready && canLogin && <>
        {isDevelopmentIdentity && name && <div className="identity"><span aria-hidden="true" className="initial">{name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span><div><strong>{name}</strong><small>Delt lokal session</small></div></div>}
        <Button type="button" disabled={pending} onClick={start}>{pending ? 'Åbner arbejdsrummet…' : isDevelopmentIdentity ? `Fortsæt som ${name}` : 'Log ind med Microsoft'}<span aria-hidden="true">→</span></Button>
        {isDevelopmentIdentity && <p className="local-notice">Du fortsætter med en fælles lokal bruger. Dette er ikke et personligt, bekræftet kommunalt login.</p>}
      </>}
      {ready && error && <Button type="button" onClick={retry}>Prøv forbindelsen igen</Button>}
      <p className="support">AI hjælper med at udarbejde grundlaget. Den faglige vurdering og godkendelse ligger altid hos mennesker.</p>
    </div></Access>
    </Content>
  </Page>;
}
