import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import BRAND from '../config/brand';
import { useAuth } from '../contexts/AuthContext';

const Page = styled.main`
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr);
  background: ${p => p.theme.colors.surface};
  @media (max-width: 800px) { grid-template-columns: 1fr; }
`;
const Introduction = styled.section`
  display: flex; flex-direction: column; justify-content: space-between;
  gap: 64px; padding: clamp(28px, 5vw, 80px);
  color: #fffefb; background: #283b3b;
  .brand { display: flex; align-items: baseline; flex-wrap: wrap; gap: 14px; }
  .brand strong { font-size: 1.3rem; letter-spacing: .08em; }
  .brand span { font: 500 .75rem ${p => p.theme.fonts.mono}; color: #d3ded9; }
  h2 { margin: 0 0 24px; max-width: 12ch; font-size: clamp(2rem, 4.2vw, 4rem); font-weight: 620; line-height: 1.08; letter-spacing: -.045em; color: inherit; }
  p { max-width: 46ch; color: #dce5e0; font-size: 1rem; line-height: 1.7; margin: 0; }
  ol { list-style: none; padding: 0; margin: 32px 0 0; }
  li { display: flex; align-items: flex-start; gap: 14px; padding: 16px 0; border-top: 1px solid #627674; }
  li > span { font: 500 .8rem/1.65 ${p => p.theme.fonts.mono}; color: #edbda8; }
  li strong { display: block; margin-bottom: 5px; font-size: .93rem; font-weight: 600; }
  li p { font-size: .86rem; }
  @media (max-width: 800px) { gap: 26px; padding: 28px; h2 { max-width: 21ch; font-size: 2rem; margin-bottom: 14px; } ol { display: none; } }
`;
const Access = styled.section`
  min-width: 0; display: flex; flex-direction: column; justify-content: center;
  padding: clamp(28px, 6vw, 96px);
  > div { width: 100%; max-width: 420px; margin-inline: auto; }
  .organisation { display: block; width: 172px; height: auto; margin-bottom: 56px; }
  .eyebrow { font-size: .75rem; font-weight: 650; color: ${p => p.theme.mode === 'dark' ? p.theme.colors.primaryLight : p.theme.colors.primaryDark}; letter-spacing: .08em; text-transform: uppercase; }
  h1 { margin: 12px 0 16px; font-size: clamp(1.9rem, 2.8vw, 2.5rem); line-height: 1.12; font-weight: 620; letter-spacing: -.035em; }
  p { color: ${p => p.theme.colors.textMuted}; line-height: 1.65; }
  .identity { margin-block: 28px 20px; padding: 16px 0; border-block: 1px solid ${p => p.theme.colors.border}; display: flex; gap: 12px; align-items: center; }
  .initial { display: grid; place-items: center; flex-shrink: 0; width: 42px; height: 42px; font-weight: 650; background: ${p => p.theme.colors.primarySoft}; color: ${p => p.theme.colors.primaryDark}; }
  .identity strong, .identity small { display: block; }
  .identity small { color: ${p => p.theme.colors.textMuted}; margin-top: 4px; font-size: .8rem; }
  .local-notice { font-size: .82rem; margin: 16px 0 0; }
  .error { padding: 14px 16px; margin: 20px 0; background: ${p => p.theme.colors.dangerSoft}; color: ${p => p.theme.colors.dangerDark}; }
  .support { border-top: 1px solid ${p => p.theme.colors.border}; margin-top: 36px; padding-top: 20px; font-size: .82rem; }
  @media (max-width: 800px) { padding: 32px 28px 40px; .organisation { margin-bottom: 28px; } }
`;
const Button = styled.button`
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; min-height: 48px; padding: 12px 20px; margin-top: 20px;
  border: 1px solid ${p => p.theme.colors.primary}; background: ${p => p.theme.colors.primary};
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
    <Introduction aria-label="Om SHIELD">
      <div className="brand"><strong>{BRAND.name}</strong><span>{BRAND.version}</span></div>
      <div>
        <h2>Fra AI-idé til oplyst beslutning.</h2>
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
      <span className="eyebrow">Dit arbejdsrum for AI-vurderinger</span>
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
  </Page>;
}
