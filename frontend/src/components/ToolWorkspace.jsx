import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styled from 'styled-components';

const Navigation = styled.nav`
  width: min(100% - 40px, 1240px);
  margin: 24px auto 0;
  padding: 14px 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 24px;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  color: ${p => p.theme.colors.text};
  strong { font-size: 0.85rem; }
  div { display: flex; flex-wrap: wrap; gap: 8px; }
  a {
    padding: 10px 14px;
    font-size: 0.83rem;
    color: ${p => p.theme.colors.textMuted};
    border: 1px solid transparent;
    overflow-wrap: anywhere;
  }
  a[aria-current='page'] {
    background: ${p => p.theme.colors.surface};
    border-color: ${p => p.theme.colors.border};
    color: ${p => p.theme.colors.primary};
    font-weight: 650;
  }
  a:focus-visible { outline: 2px solid ${p => p.theme.colors.primary}; outline-offset: 2px; }
`;

/** One workspace, several views. Keep visited views mounted so a tab change
 * never discards an unfinished question, assessment or guide session. */
export default function ToolWorkspace({ title, views }) {
  const { pathname, search } = useLocation();
  const [visited, setVisited] = useState(() => [pathname]);
  useEffect(() => { setVisited(paths => paths.includes(pathname) ? paths : [...paths, pathname]); }, [pathname]);
  const params = new URLSearchParams(search);
  const caseContext = new URLSearchParams();
  ['case', 'case_id', 'query'].forEach(key => { if (params.has(key)) caseContext.set(key, params.get(key)); });
  const suffix = caseContext.toString() ? `?${caseContext}` : '';
  return <>
    <Navigation aria-label={title}>
      <strong>{title}</strong>
      <div>{views.map(view => <NavLink key={view.path} to={`${view.path}${suffix}`}>{view.label}</NavLink>)}</div>
    </Navigation>
    {views.filter(view => view.path === pathname || visited.includes(view.path)).map(view =>
      <div key={view.path} hidden={view.path !== pathname}>{view.element}</div>
    )}
  </>;
}
