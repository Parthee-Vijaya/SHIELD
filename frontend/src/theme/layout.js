import { css } from 'styled-components';

export const layoutTokens = { pageWidth: '1320px', pageGutter: '32px' };
export const typographyTokens = {
  pageTitle: 'clamp(2rem, 3.5vw, 2.75rem)',
  sectionTitle: '1.5rem',
  controlFont: '0.875rem',
};

export const pageLayout = css`
  width: 100%;
  max-width: ${layoutTokens.pageWidth};
  min-width: 0;
  margin: 0 auto;
  padding: 38px ${layoutTokens.pageGutter} 80px;
  box-sizing: border-box;
  @media (max-width: 640px) { padding: 28px 20px 64px; }
  @media (max-width: 400px) { padding-inline: 14px; }
`;

export const pageTitleStyle = css`
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  font-family: ${p => p.theme.fonts.display};
  font-size: ${typographyTokens.pageTitle};
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1.16;
  color: ${p => p.theme.colors.text};
  margin: 0 0 12px;
`;

export const sectionTitleStyle = css`
  font-family: ${p => p.theme.fonts.display};
  font-size: ${typographyTokens.sectionTitle};
  font-weight: 620;
  letter-spacing: -0.02em;
  line-height: 1.25;
  overflow-wrap: anywhere;
`;

export const controlStyle = css`
  min-height: 44px;
  font-family: ${p => p.theme.fonts.sans};
  font-size: ${typographyTokens.controlFont};
  font-weight: 600;
  line-height: 1.3;
  border-radius: 0;
`;
