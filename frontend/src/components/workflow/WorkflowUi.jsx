import styled from 'styled-components';

// App.js already owns the single <main> landmark. Workflow pages are content
// containers so routes never render nested main landmarks.
export const Page = styled.div`
  max-width: 1320px;
  margin: 0 auto;
  padding: clamp(38px, 5vw, 72px) 20px 104px;

  @media (max-width: 640px) {
    padding: 30px 14px 72px;
  }
`;

export const PageHeader = styled.header`
  display: grid;
  grid-template-columns: ${(p) => p.$stacked ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) auto'};
  align-items: end;
  gap: 32px;
  padding-bottom: clamp(30px, 4vw, 48px);
  border-bottom: 1px solid ${(p) => p.theme.colors.line};

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;
    align-items: start;
  }
`;

export const HeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;

  @media (max-width: 1080px) {
    justify-content: flex-start;
  }
`;

export const Eyebrow = styled.div`
  margin-bottom: 10px;
  color: ${(p) => p.theme.colors.primary};
  font: 650 0.69rem/1.2 ${(p) => p.theme.fonts.sans};
  letter-spacing: 0.16em;
  text-transform: uppercase;
`;

export const Title = styled.h1`
  min-width: 0;
  overflow-wrap: anywhere;
  margin: 0;
  color: ${(p) => p.theme.colors.ink};
  font: 580 clamp(2.45rem, 5vw, 4.25rem)/1.02 ${(p) => p.theme.fonts.display};
  letter-spacing: -0.052em;
`;

export const Lede = styled.p`
  overflow-wrap: anywhere;
  max-width: 780px;
  margin: 18px 0 0;
  color: ${(p) => p.theme.colors.inkSoft};
  font: 400 1rem/1.65 ${(p) => p.theme.fonts.body};
`;

export const Button = styled.button`
  min-height: 44px;
  padding: 11px 18px;
  border: 1px solid ${(p) => p.theme.colors.primary};
  border-radius: 0;
  background: ${(p) => p.theme.colors.primary};
  color: #fff;
  font: 620 0.86rem/1.2 ${(p) => p.theme.fonts.sans};
  cursor: pointer;
  transition: background ${(p) => p.theme.animations.transitionFast},
    border-color ${(p) => p.theme.animations.transitionFast};

  &:hover:not(:disabled) {
    border-color: ${(p) => p.theme.colors.primaryDark};
    background: ${(p) => p.theme.colors.primaryDark};
    color: #fff;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.52;
  }
`;

export const SecondaryButton = styled(Button)`
  border-color: ${(p) => p.theme.colors.line};
  background: ${(p) => p.theme.colors.surface};
  color: ${(p) => p.theme.colors.ink};

  &:hover:not(:disabled) {
    border-color: ${(p) => p.theme.colors.primary};
    background: ${(p) => p.theme.colors.primaryShallow};
    color: ${(p) => p.theme.colors.primaryDark};
  }
`;

export const TextLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  color: ${(p) => p.theme.colors.primaryDark};
  font: 620 0.82rem/1.35 ${(p) => p.theme.fonts.sans};
  text-decoration: underline;
  text-underline-offset: 3px;
`;

export const Section = styled.section`
  padding: 30px 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.line};

  &:last-child {
    border-bottom: 0;
  }
`;

export const SectionHeader = styled.div`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;

  h2 {
    margin: 0;
    color: ${(p) => p.theme.colors.ink};
    font: 590 clamp(1.45rem, 2.5vw, 2rem)/1.1 ${(p) => p.theme.fonts.display};
    letter-spacing: -0.035em;
  }

  p {
    max-width: 620px;
    margin: 7px 0 0;
    color: ${(p) => p.theme.colors.inkSoft};
    font-size: 0.85rem;
    line-height: 1.55;
  }

  @media (max-width: 640px) {
    align-items: start;
    flex-direction: column;
  }
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(${(p) => p.$columns || 3}, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 940px) {
    grid-template-columns: repeat(${(p) => Math.min(p.$columns || 3, 2)}, minmax(0, 1fr));
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

export const Card = styled.article`
  min-width: 0;
  padding: 22px;
  border: 1px solid ${(p) => p.theme.colors.line};
  background: ${(p) => p.theme.colors.surface};

  h3 {
    margin: 0;
    color: ${(p) => p.theme.colors.ink};
    font: 620 1rem/1.35 ${(p) => p.theme.fonts.display};
  }

  p {
    margin: 10px 0 0;
    color: ${(p) => p.theme.colors.inkSoft};
    font-size: 0.86rem;
    line-height: 1.58;
  }
`;

export const Inset = styled.div`
  padding: 18px;
  border-left: 3px solid ${(p) => p.$accent || p.theme.colors.secondary};
  background: ${(p) => p.theme.colors.paperSoft};
`;

const STATUS_COLORS = {
  success: ['successSoft', 'success'],
  warning: ['warningSoft', 'warning'],
  danger: ['dangerSoft', 'danger'],
  info: ['primarySoft', 'primaryDark'],
  neutral: ['paperSoft', 'inkSoft'],
};

export const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 26px;
  padding: 4px 9px;
  border: 1px solid ${(p) => {
    const colors = STATUS_COLORS[p.$tone] || STATUS_COLORS.neutral;
    return p.theme.colors[colors[1]] || p.theme.colors.line;
  }};
  background: ${(p) => {
    const colors = STATUS_COLORS[p.$tone] || STATUS_COLORS.neutral;
    return p.theme.colors[colors[0]] || p.theme.colors.paperSoft;
  }};
  color: ${(p) => {
    const colors = STATUS_COLORS[p.$tone] || STATUS_COLORS.neutral;
    return p.theme.colors[colors[1]] || p.theme.colors.inkSoft;
  }};
  font: 650 0.68rem/1 ${(p) => p.theme.fonts.sans};
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

export const StatePanel = styled.div`
  margin: 32px 0;
  padding: 28px;
  border: 1px solid ${(p) => p.theme.colors.line};
  background: ${(p) => p.theme.colors.surface};
  color: ${(p) => p.theme.colors.inkSoft};

  strong {
    display: block;
    margin-bottom: 7px;
    color: ${(p) => p.theme.colors.ink};
    font: 620 1rem/1.35 ${(p) => p.theme.fonts.display};
  }

  p {
    margin: 0;
    max-width: 760px;
    font-size: 0.88rem;
    line-height: 1.6;
  }

  button {
    margin-top: 18px;
  }
`;

export const ErrorPanel = styled(StatePanel)`
  border-color: ${(p) => p.theme.colors.danger};
  background: ${(p) => p.theme.colors.dangerSoft};
`;

export const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-left: 1px solid ${(p) => p.theme.colors.line};
  border-top: 1px solid ${(p) => p.theme.colors.line};

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

export const Metric = styled.div`
  min-height: 118px;
  padding: 20px;
  border-right: 1px solid ${(p) => p.theme.colors.line};
  border-bottom: 1px solid ${(p) => p.theme.colors.line};
  background: ${(p) => p.theme.colors.surface};

  span {
    display: block;
    color: ${(p) => p.theme.colors.inkFaded};
    font: 600 0.67rem/1.2 ${(p) => p.theme.fonts.sans};
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  strong {
    display: block;
    margin-top: 17px;
    color: ${(p) => p.theme.colors.ink};
    font: 590 1.35rem/1.18 ${(p) => p.theme.fonts.display};
  }
`;

export const TabList = styled.div`
  display: flex;
  gap: 0;
  overflow-x: auto;
  border-bottom: 1px solid ${(p) => p.theme.colors.line};
`;

export const Tab = styled.button`
  flex: 0 0 auto;
  min-height: 52px;
  padding: 14px 17px;
  border: 0;
  border-bottom: 3px solid ${(p) => (p.$active ? p.theme.colors.primary : 'transparent')};
  background: transparent;
  color: ${(p) => (p.$active ? p.theme.colors.primaryDark : p.theme.colors.inkSoft)};
  font: ${(p) => (p.$active ? 650 : 520)} 0.82rem/1.2 ${(p) => p.theme.fonts.sans};
  white-space: nowrap;
`;

export const Form = styled.form`
  display: grid;
  gap: 24px;
`;

export const Fieldset = styled.fieldset`
  display: grid;
  gap: 16px;
  margin: 0;
  padding: 24px;
  border: 1px solid ${(p) => p.theme.colors.line};
  background: ${(p) => p.theme.colors.surface};

  legend {
    padding: 0 8px;
    color: ${(p) => p.theme.colors.ink};
    font: 620 1rem/1.35 ${(p) => p.theme.fonts.display};
  }
`;

export const Field = styled.div`
  display: grid;
  gap: 7px;

  label,
  .label {
    color: ${(p) => p.theme.colors.ink};
    font: 620 0.8rem/1.35 ${(p) => p.theme.fonts.sans};
  }

  small {
    color: ${(p) => p.theme.colors.inkFaded};
    font-size: 0.74rem;
    line-height: 1.45;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid ${(p) => p.theme.colors.line};
    border-radius: 0;
    background: ${(p) => p.theme.colors.inputBackground};
    color: ${(p) => p.theme.colors.ink};
    font: 400 0.9rem/1.45 ${(p) => p.theme.fonts.body};
  }

  textarea {
    min-height: 104px;
    resize: vertical;
  }
`;

export const ChoiceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(${(p) => p.$columns || 2}, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

export const Choice = styled.label`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 11px;
  align-items: start;
  min-height: 62px;
  padding: 14px;
  border: 1px solid ${(p) => (p.$selected ? p.theme.colors.primary : p.theme.colors.line)};
  background: ${(p) => (p.$selected ? p.theme.colors.primaryShallow : p.theme.colors.surface)};
  cursor: pointer;

  input {
    width: 17px;
    height: 17px;
    margin-top: 2px;
    accent-color: ${(p) => p.theme.colors.primary};
  }

  strong {
    display: block;
    color: ${(p) => p.theme.colors.ink};
    font: 620 0.84rem/1.35 ${(p) => p.theme.fonts.sans};
  }

  small {
    display: block;
    margin-top: 4px;
    color: ${(p) => p.theme.colors.inkSoft};
    font-size: 0.74rem;
    line-height: 1.45;
  }
`;

export const FormActions = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;

  > div {
    display: flex;
    gap: 10px;
  }
`;

export const List = styled.ul`
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid ${(p) => p.theme.colors.line};
`;

export const ListItem = styled.li`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 24px;
  padding: 18px 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.line};

  strong {
    display: block;
    color: ${(p) => p.theme.colors.ink};
    font: 620 0.9rem/1.4 ${(p) => p.theme.fonts.sans};
  }

  p {
    margin: 5px 0 0;
    color: ${(p) => p.theme.colors.inkSoft};
    font-size: 0.8rem;
    line-height: 1.5;
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
    gap: 10px;
  }
`;

export const ProgressTrack = styled.div`
  height: 7px;
  overflow: hidden;
  background: ${(p) => p.theme.colors.paperSoft};
`;

export const ProgressValue = styled.div`
  width: ${(p) => Math.max(0, Math.min(100, p.$value || 0))}%;
  height: 100%;
  background: ${(p) => p.theme.colors.secondary};
  transition: width ${(p) => p.theme.animations.transition};
`;

export const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

export function formatDate(value, withTime = false) {
  if (!value) return 'Ikke angivet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('da-DK', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(date);
}

export function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

export function toneForStatus(value) {
  const normalized = String(value || '').toLowerCase();
  if (['no-go', 'blocked', 'bloker', 'afvist', 'critical', 'kritisk', 'high', 'høj', 'forbudt'].some((item) => normalized.includes(item))) return 'danger';
  if (['condition', 'betinget', 'pending', 'afventer', 'review', 'medium', 'middel', 'action', 'kræver'].some((item) => normalized.includes(item))) return 'warning';
  if (['go', 'approved', 'godkendt', 'complete', 'completed', 'ready', 'klar', 'ok', 'low', 'lav'].some((item) => normalized.includes(item))) return 'success';
  return 'neutral';
}
