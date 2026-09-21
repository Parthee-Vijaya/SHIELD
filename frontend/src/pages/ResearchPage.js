import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { modelLabel } from '../utils/modelPresentation';
import {
  FaSearch,
  FaSpinner,
  FaExternalLinkAlt,
  FaQuoteLeft,
  FaCalendarAlt,
  FaGlobeEurope,
  FaFileAlt,
  FaUniversity,
  FaBookOpen,
  FaCheckCircle,
  FaTag,
  FaChartBar,
  FaDatabase,
  FaClock,
  FaLink,
  FaChevronDown
} from 'react-icons/fa';
import {
  PageShell,
  PageHeader,
  PrimaryButton,
} from '../components/page-chrome/PageChrome';

const SearchSection = styled.section`
  background: ${(p) => p.theme.colors.surface};
  padding: 1.75rem;
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  margin-bottom: 2rem;
`;

const SearchForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  label {
    font-family: ${(p) => p.theme.fonts.sans};
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${(p) => p.theme.colors.textMuted};
  }
`;

const SearchInput = styled.input`
  padding: 0.85rem 1rem;
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1rem;
  background: ${(p) => p.theme.colors.surface};
  color: ${(p) => p.theme.colors.text};
  transition: ${(p) => p.theme.animations.transitionFast};

  &::placeholder {
    color: ${(p) => p.theme.colors.textFaded};
    font-style: italic;
  }

  &:focus {
    border-color: ${(p) => p.theme.colors.primary};
    outline: none;
    box-shadow: ${(p) => p.theme.shadows.focus};
  }

  &::placeholder {
    color: ${props => props.theme.colors.gray[400]};
  }
`;

const FocusAreasContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const FocusAreaTag = styled.button`
  font-family: ${(p) => p.theme.fonts.sans};
  background: ${(p) =>
    p.selected ? p.theme.colors.primarySoft : 'transparent'};
  color: ${(p) =>
    p.selected ? p.theme.colors.primary : p.theme.colors.textMuted};
  border: 1px solid
    ${(p) => (p.selected ? p.theme.colors.primary : p.theme.colors.border)};
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: ${(p) => p.theme.animations.transitionFast};

  &:hover {
    border-color: ${(p) => p.theme.colors.primary};
    color: ${(p) => p.theme.colors.primary};
  }
`;

const SearchButton = styled(PrimaryButton)`
  align-self: flex-start;
  padding: 12px 24px;
  font-size: 0.95rem;
`;

const ProgressContainer = styled.div`
  display: ${props => props.show ? 'block' : 'none'};
  background: white;
  padding: 1.5rem 2rem;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.md};
  margin-bottom: 1.5rem;
`;

const ProgressBarWrapper = styled.div`
  width: 100%;
  background: ${props => props.theme.colors.gray[200]};
  border-radius: 10px;
  height: 20px;
  overflow: hidden;
  margin-bottom: 1rem;
`;

const ProgressBarFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg,
    #667eea 0%,
    #764ba2 50%,
    #667eea 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
  transition: width 0.5s ease-out;
  width: ${props => props.percent}%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 0.5rem;
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
  box-shadow: 0 0 10px rgba(102, 126, 234, 0.5);

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const ProgressMessage = styled.div`
  color: ${props => props.theme.colors.gray[700]};
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .icon {
    color: ${props => props.theme.colors.primary};
  }
`;

const ResultsSection = styled.section`
  display: ${props => props.show ? 'block' : 'none'};
`;

const ResultsHeader = styled.div`
  background: white;
  padding: 1.5rem 2rem;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.md};
  margin-bottom: 1.5rem;

  h2 {
    color: ${props => props.theme.colors.gray[800]};
    margin-bottom: 0.5rem;
  }

  .summary {
    color: ${props => props.theme.colors.gray[600]};
    line-height: 1.6;
  }

  .meta {
    margin-top: 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    color: ${props => props.theme.colors.gray[500]};
    font-size: 0.9rem;

    span {
      background: ${props => props.theme.colors.gray[100]};
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      color: ${props => props.theme.colors.gray[700]};
    }
  }
`;

const AnswerCard = styled.div`
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.lg};
  padding: 2.5rem;
  margin-bottom: 2rem;
  color: white;

  h3 {
    margin: 0 0 1.5rem 0;
    color: white;
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 700;
  }

  .answer-content {
    background: rgba(255, 255, 255, 0.95);
    padding: 2rem;
    border-radius: 12px;
    color: ${props => props.theme.colors.gray[800]};
    line-height: 1.8;
    font-size: 1.05rem;
    white-space: pre-wrap;
    margin-bottom: 1.5rem;

    /* Style citation numbers */
    [data-citation] {
      background: ${props => props.theme.colors.primary};
      color: white;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: ${props => props.theme.colors.primaryDark};
        transform: translateY(-1px);
      }
    }
  }

  .key-points {
    background: rgba(255, 255, 255, 0.1);
    padding: 1.5rem;
    border-radius: 10px;
    margin-top: 1rem;

    h4 {
      margin: 0 0 1rem 0;
      font-size: 1.1rem;
      font-weight: 600;
    }

    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;

      li {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;

        &:before {
          content: "✓";
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
        }
      }
    }
  }
`;

const CitationList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 1rem 0 0 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: rgba(255, 255, 255, 0.1);
  padding: 1.5rem;
  border-radius: 10px;

  li {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    font-size: 0.9rem;
    color: ${props => props.theme.colors.gray[700]};
    border-left: 3px solid ${props => props.theme.colors.primary};
    transition: all 0.2s;

    &:hover {
      transform: translateX(4px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    a {
      color: ${props => props.theme.colors.primary};
      text-decoration: none;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;

      &:hover {
        text-decoration: underline;
      }
    }

    .citation-snippet {
      margin-top: 0.5rem;
      font-style: italic;
      color: ${props => props.theme.colors.gray[600]};
      font-size: 0.85rem;
      line-height: 1.5;
    }

    .citation-meta {
      margin-top: 0.5rem;
      display: flex;
      gap: 1rem;
      font-size: 0.8rem;
      color: ${props => props.theme.colors.gray[500]};

      span {
        display: flex;
        align-items: center;
        gap: 0.3rem;
      }
    }
  }
`;

const SourcesList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 2rem 0;
  background: white;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.sm};
  overflow: hidden;
`;

const CrossReferenceList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
`;

const CrossReferenceItem = styled.li`
  background: white;
  border-radius: ${props => props.theme.borderRadius};
  border: 1px solid ${props => props.theme.colors.gray[200]};
  padding: 1.25rem 1.5rem;
  box-shadow: ${props => props.theme.shadows.sm};
  line-height: 1.6;

  p {
    margin: 0 0 0.75rem;
    color: ${props => props.theme.colors.gray[800]};
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  li {
    background: ${props => props.theme.colors.gray[100]};
    border-radius: 999px;
    padding: 0.35rem 0.75rem;
    font-size: 0.85rem;
    color: ${props => props.theme.colors.gray[700]};
  }
`;

const SourceItem = styled.li`
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.gray[200]};
  transition: background-color 0.2s;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: ${props => props.theme.colors.gray[50]};
  }

  .source-info {
    flex: 1;
  }

  .source-title {
    font-weight: 600;
    color: ${props => props.theme.colors.gray[800]};
    margin-bottom: 0.5rem;
    font-size: 1rem;
  }

  .source-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.875rem;
    color: ${props => props.theme.colors.gray[600]};
    margin-bottom: 0.5rem;

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }
  }

  .source-link {
    color: ${props => props.theme.colors.primary};
    text-decoration: none;
    font-size: 0.875rem;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-weight: 500;

    &:hover {
      text-decoration: underline;
    }
  }

  .relevance-badge {
    flex-shrink: 0;
    background: ${props => props.theme.colors.primary};
    color: white;
    padding: 0.375rem 0.75rem;
    border-radius: 999px;
    font-size: 0.875rem;
    font-weight: 600;
  }
`;

const DetailsSection = styled.section`
  background: white;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.sm};
  padding: 1.5rem 2rem;
  margin-bottom: 1.5rem;

  h3 {
    margin: 0 0 1rem;
    color: ${props => props.theme.colors.gray[800]};
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    li {
      color: ${props => props.theme.colors.gray[700]};
      line-height: 1.6;
    }
  }
`;

const SystemCard = styled.section`
  background: ${props => props.theme.isDark
    ? 'rgba(45, 55, 72, 0.95)'
    : 'rgba(255, 255, 255, 0.95)'};
  backdrop-filter: blur(20px);
  border-radius: ${props => props.theme.borderRadiusLarge};
  padding: 1.5rem;
  margin-bottom: 2rem;
  border: 1px solid ${props => props.theme.isDark
    ? 'rgba(255, 255, 255, 0.1)'
    : 'rgba(0, 0, 0, 0.1)'};
  box-shadow: ${props => props.theme.shadows.md};

  h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: ${props => props.theme.isDark
      ? props.theme.colors.gray[100]
      : props.theme.colors.gray[800]};
    font-weight: 600;

    .icon {
      color: ${props => props.theme.colors.primary};
    }
  }
`;

const SystemGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
`;

const SystemStat = styled.div`
  background: ${props => props.theme.isDark
    ? 'rgba(255, 255, 255, 0.05)'
    : 'rgba(0, 0, 0, 0.03)'};
  border-radius: 8px;
  padding: 0.75rem;
  border: 1px solid ${props => props.theme.isDark
    ? 'rgba(255, 255, 255, 0.1)'
    : 'rgba(0, 0, 0, 0.05)'};

  .stat-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${props => props.theme.isDark
      ? 'rgba(255, 255, 255, 0.6)'
      : props.theme.colors.gray[600]};
    margin-bottom: 0.25rem;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: ${props => props.theme.isDark
      ? props.theme.colors.gray[100]
      : props.theme.colors.gray[800]};
    line-height: 1.2;
  }

  .stat-detail {
    font-size: 0.7rem;
    color: ${props => props.theme.isDark
      ? 'rgba(255, 255, 255, 0.5)'
      : props.theme.colors.gray[500]};
    margin-top: 0.15rem;
  }
`;

const SearchEnginesList = styled.div`
  .search-engine-item {
    margin-bottom: 0.5rem;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .engine-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.65rem 0.75rem;
    background: ${props => props.theme.isDark
      ? 'rgba(255, 255, 255, 0.05)'
      : 'rgba(0, 0, 0, 0.03)'};
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid ${props => props.theme.isDark
      ? 'rgba(255, 255, 255, 0.08)'
      : 'rgba(0, 0, 0, 0.05)'};

    &:hover {
      background: ${props => props.theme.isDark
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(0, 0, 0, 0.05)'};
    }

    .engine-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
    }

    .engine-name {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: ${props => props.theme.isDark
        ? props.theme.colors.gray[200]
        : props.theme.colors.gray[700]};
      font-weight: 500;

      .engine-icon {
        color: ${props => props.theme.colors.primary};
      }
    }

    .engine-count {
      background: ${props => props.theme.colors.primary}20;
      color: ${props => props.theme.colors.primary};
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .expand-icon {
      color: ${props => props.theme.isDark
        ? props.theme.colors.gray[400]
        : props.theme.colors.gray[500]};
      transition: transform 0.2s;

      &.expanded {
        transform: rotate(180deg);
      }
    }
  }

  .engine-sources {
    padding: 0.5rem 0.75rem 0.75rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .source-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem;
    background: ${props => props.theme.isDark
      ? 'rgba(255, 255, 255, 0.03)'
      : 'rgba(0, 0, 0, 0.02)'};
    border-radius: 6px;
    border: 1px solid ${props => props.theme.isDark
      ? 'rgba(255, 255, 255, 0.05)'
      : 'rgba(0, 0, 0, 0.05)'};
  }

  .source-link {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: ${props => props.theme.colors.primary};
    text-decoration: none;
    transition: all 0.2s;
    font-weight: 500;

    &:hover {
      text-decoration: underline;
    }

    .link-icon {
      flex-shrink: 0;
      margin-top: 0.2rem;
    }

    .link-text {
      flex: 1;
      line-height: 1.4;
    }
  }

  .source-snippet {
    font-size: 0.75rem;
    line-height: 1.5;
    color: ${props => props.theme.isDark
      ? props.theme.colors.gray[400]
      : props.theme.colors.gray[600]};
    font-style: italic;
    padding-left: 1.2rem;
  }
`;

const SourceHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid ${props => props.theme.colors.gray[200]};

  .authority {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: ${props => props.theme.colors.primary};
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .title {
    font-size: 1.125rem;
    font-weight: 600;
    color: ${props => props.theme.colors.gray[800]};
    margin-bottom: 0.5rem;
    line-height: 1.4;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.875rem;
    color: ${props => props.theme.colors.gray[500]};

    .domain {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .date {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
  }
`;

const SourceContent = styled.div`
  padding: 1.5rem;

  .relevance-score {
    display: inline-block;
    background: ${props => props.score > 0.8 ? props.theme.colors.success :
                         props.score > 0.6 ? '#C94416' :
                         props.theme.colors.danger};
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }
`;

const SourceLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: ${props => props.theme.colors.primary};
  text-decoration: none;
  font-weight: 500;
  margin-top: 1rem;

  &:hover {
    text-decoration: underline;
  }
`;

const CitationsSection = styled.div`
  background: white;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.md};
  overflow: hidden;
`;

const CitationsHeader = styled.div`
  background: ${props => props.theme.colors.gray[50]};
  padding: 1.5rem 2rem;
  border-bottom: 1px solid ${props => props.theme.colors.gray[200]};

  h3 {
    color: ${props => props.theme.colors.gray[800]};
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
`;

const CitationsList = styled.div`
  padding: 1.5rem 2rem;
`;

const CitationItem = styled.div`
  border-left: 4px solid ${props => props.theme.colors.primary};
  padding-left: 1rem;
  margin-bottom: 1.5rem;

  &:last-child {
    margin-bottom: 0;
  }

  .quote {
    font-style: italic;
    color: ${props => props.theme.colors.gray[700]};
    margin-bottom: 0.5rem;
    line-height: 1.6;
  }

  .citation-source {
    font-size: 0.875rem;
    color: ${props => props.theme.colors.gray[500]};
    font-weight: 500;
  }

`;

const LoadingSpinner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: ${props => props.theme.colors.primary};

  .spinner {
    animation: spin 1s linear infinite;
  }

  .text {
    margin-left: 1rem;
    font-weight: 500;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

function SourceText({ value }) {
  if (typeof value !== 'string') return null;
  return <div>{value.split(/\n+/).filter(Boolean).map((line, index) => <p key={index}>{line.split(/(\*\*[^*]+\*\*)/g).map((part, key) => part.startsWith('**') && part.endsWith('**') ? <strong key={key}>{part.slice(2, -2)}</strong> : part)}</p>)}</div>;
}

const sourceUrl = value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
};

const ResearchPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [selectedFocusAreas, setSelectedFocusAreas] = useState(['EU AI Act', 'GDPR']);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [expandedEngines, setExpandedEngines] = useState({});
  const streamRef = useRef(null);
  const [researchError, setResearchError] = useState('');
  useEffect(() => () => streamRef.current?.close(), []);

  const { register, handleSubmit } = useForm();

  const focusAreas = [
    'EU AI Act',
    'GDPR',
    'Dansk lovgivning',
    'Automatiserede beslutninger',
    'Højrisiko AI systemer',
    'Biometrisk identifikation',
    'Databeskyttelse',
    'Datatilsynets vejledninger'
  ];

  const toggleFocusArea = (area) => {
    setSelectedFocusAreas(prev =>
      prev.includes(area)
        ? prev.filter(item => item !== area)
        : [...prev, area]
    );
  };

  const onSubmit = async (data) => {
    if (!selectedFocusAreas.length) {
      toast.error('Vælg mindst ét fokusområde.');
      return;
    }
    if (!data.emne.trim()) {
      toast.error('Indtast venligst et research emne');
      return;
    }

    streamRef.current?.close();
    setResearchError('');
    setIsLoading(true);
    setResults(null);
    setProgressMessage('Starter research...');
    setProgressPercent(0);

    try {
      // Use EventSource for Server-Sent Events
      const params = new URLSearchParams({ emne: data.emne.trim() });
      selectedFocusAreas.forEach(area => params.append('focus_areas', area));
      const eventSource = new EventSource(`/api/research/juridisk/stream?${params}`);
      streamRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const progressData = JSON.parse(event.data);

          setProgressMessage(progressData.message);
          setProgressPercent(progressData.progress);

          // Check if research is complete
          if (progressData.status === 'complete' && progressData.result) {
            setResults(progressData.result);
            toast.success(`Kildesøgning afsluttet – ${progressData.result.sources?.length || 0} kilder fundet`);
            eventSource.close();
            setIsLoading(false);
          }

          // Handle error
          if (progressData.status === 'error') {
            setResearchError(progressData.message || 'Kildesøgningen kunne ikke fuldføres.');
            eventSource.close();
            setIsLoading(false);
          }
        } catch (err) {
          setResearchError('Kildesøgningen returnerede et ugyldigt svar. Prøv igen.');
          eventSource.close();
          setIsLoading(false);
        }
      };

      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        setResearchError('Forbindelsen til kildesøgningen blev afbrudt. Prøv igen.');
        eventSource.close();
        setIsLoading(false);
      };

    } catch (error) {
      console.error('Research fejl:', error);
      setResearchError('Kildesøgningen kunne ikke startes. Prøv igen.');
      setIsLoading(false);
    }
  };

  const getAuthorityIcon = (authority) => {
    switch (authority) {
      case 'EU-Kommissionen':
      case 'EU':
        return FaUniversity;
      case 'Datatilsynet':
        return FaGlobeEurope;
      case 'EDPB':
        return FaBookOpen;
      default:
        return FaFileAlt;
    }
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="S.H.I.E.L.D. · juridisk research"
        title="Søg i juridiske kilder"
        lede="Find offentlige kilder til et juridisk emne. Kontrollér relevans, indhold og dato i originalkilden, før du bruger den i en sag. Søgeresultaterne er ikke en vurdering og gemmes ikke automatisk på sagen."
      />

      <SearchSection>
        <h2 style={{
          marginBottom: '1.5rem',
          fontFamily: '"IBM Plex Sans", -apple-system, sans-serif',
          fontWeight: 600,
          fontSize: '1.4rem',
          letterSpacing: '-0.01em',
        }}>Start research</h2>

        <SearchForm onSubmit={handleSubmit(onSubmit)}>
          <FormGroup>
            <label htmlFor="emne">Emne</label>
            <SearchInput
              aria-label="Emne for kildesøgning"
              {...register('emne', { required: true })}
              placeholder="F.eks. 'højrisiko AI systemer i sundhedssektoren' eller 'automatiserede beslutninger GDPR'"
            />
          </FormGroup>

          <FormGroup>
            <label>Fokusområder</label>
            <FocusAreasContainer>
              {focusAreas.map((area) => (
                <FocusAreaTag
                  key={area}
                  type="button"
                  selected={selectedFocusAreas.includes(area)}
                  aria-pressed={selectedFocusAreas.includes(area)}
                  disabled={isLoading}
                  onClick={() => toggleFocusArea(area)}
                >
                  {area}
                </FocusAreaTag>
              ))}
            </FocusAreasContainer>
          </FormGroup>

          <SearchButton type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <FaSpinner className="spinner" />
                Søger efter kilder…
              </>
            ) : (
              <>
                <FaSearch />
                Søg efter kilder
              </>
            )}
          </SearchButton>
        </SearchForm>
      </SearchSection>

      {researchError && <p role="alert">{researchError}</p>}

      {/* Progress Bar */}
      <ProgressContainer show={isLoading}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>
          Søger efter kilder…
        </h3>
        <ProgressBarWrapper>
          <ProgressBarFill percent={progressPercent}>
            {progressPercent > 10 && `${progressPercent}%`}
          </ProgressBarFill>
        </ProgressBarWrapper>
        <ProgressMessage>
          <FaSpinner className="icon spinner" />
          {progressMessage}
        </ProgressMessage>
      </ProgressContainer>

      <AnimatePresence>
        {isLoading && !progressMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <LoadingSpinner>
              <FaSpinner className="spinner" size={24} />
              <span className="text">Søger i juridiske databaser...</span>
            </LoadingSpinner>
          </motion.div>
        )}
      </AnimatePresence>

      <ResultsSection show={results && !isLoading}>
        {results && (
          <>
            <ResultsHeader>
              <h2>Kilder til "{results.query}"</h2>
              <div className="summary">
                <SourceText value={results.summary} />
              </div>
              {results.focus_areas && results.focus_areas.length > 0 && (
                <div className="meta">
                  {results.focus_areas.map((area, index) => (
                    <span key={`focus-${index}`}>{area}</span>
                  ))}
                </div>
              )}
            </ResultsHeader>

            {Array.isArray(results.warnings) && results.warnings.length > 0 && <aside aria-label="Forbehold for kildesøgningen"><h3>Forbehold</h3><ul>{results.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside>}
            <section aria-label="Fundne kilder"><h3>Fundne kilder ({results.sources?.length || 0})</h3><p>Søgeresultaterne kræver faglig kontrol. Åbn originalkilden for at kontrollere indhold, dato og relevans.</p>
              {results.sources?.length ? <CitationList>{results.sources.map((source, index) => <li key={source.url || index}>{sourceUrl(source.url) ? <a href={sourceUrl(source.url)} target="_blank" rel="noopener noreferrer">{source.title || source.url}</a> : <strong>{source.title || 'Kilde uden gyldigt link'}</strong>}{source.snippet && <SourceText value={source.snippet} />}</li>)}</CitationList> : <p>Der blev ikke fundet dokumenterede kilder til søgningen. Det betyder ikke, at emnet er afklaret.</p>}
            </section>

            {results.llm_answer && (
              <AnswerCard>
                <h3>
                  <FaBookOpen /> AI-udkast
                </h3>
                <p>Udarbejdet med {modelLabel(results.model)} · kræver faglig kontrol.</p>

                <div className="answer-content">
                  <SourceText value={results.llm_answer} />
                </div>

                {results.llm_answer_key_points && results.llm_answer_key_points.length > 0 && (
                  <div className="key-points">
                    <h4>Nøglepunkter:</h4>
                    <ul>
                      {results.llm_answer_key_points.map((point, index) => (
                        <li key={`key-point-${index}`}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {results.llm_answer_citations && results.llm_answer_citations.length > 0 && (
                  <CitationList>
                    {results.llm_answer_citations.map((citation, index) => (
                      <li key={`answer-citation-${index}`}>
                        <a
                          href={sourceUrl(citation.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <FaExternalLinkAlt size={12} />
                          {citation.authority || citation.title}
                        </a>
                        {citation.snippet && (
                          <div className="citation-snippet">
                            "{citation.snippet}"
                          </div>
                        )}
                        {citation.relevance && (
                          <div className="citation-meta">
                            <span>
                              <FaTag size={10} />
                              {citation.relevance}
                            </span>
                          </div>
                        )}
                      </li>
                    ))}
                  </CitationList>
                )}
              </AnswerCard>
            )}

            {/* System Card - Search Statistics */}
            <SystemCard>
              <h3>
                <FaChartBar className="icon" /> Søgningsstatistikker
              </h3>

              <SystemGrid>
                <SystemStat>
                  <div className="stat-label">
                    <FaDatabase /> Samlede kilder
                  </div>
                  <div className="stat-value">
                    {results.sources?.length || 0}
                  </div>
                  <div className="stat-detail">
                    Unikke kilder fundet
                  </div>
                </SystemStat>

                <SystemStat>
                  <div className="stat-label">
                    <FaLink /> Henvisninger i AI-svaret
                  </div>
                  <div className="stat-value">
                    {results.llm_answer_citations?.length || 0}
                  </div>
                  <div className="stat-detail">
                    Henvisninger angivet af modellen
                  </div>
                </SystemStat>

                <SystemStat>
                  <div className="stat-label">
                    <FaUniversity /> Autoritative kilder
                  </div>
                  <div className="stat-value">
                    {results.sources?.filter(s => s.authority).length || 0}
                  </div>
                  <div className="stat-detail">
                    Kilder med registreret afsender
                  </div>
                </SystemStat>

                <SystemStat>
                  <div className="stat-label">
                    <FaClock /> Procestid
                  </div>
                  <div className="stat-value">
                    {results.metadata?.processing_time ?
                      `${results.metadata.processing_time.toFixed(1)}s` :
                      'N/A'}
                  </div>
                  <div className="stat-detail">
                    Total søgetid
                  </div>
                </SystemStat>
              </SystemGrid>

              <SearchEnginesList>
                {(() => {
                  // Group sources by domain/engine with their actual sources
                  const groupedSources = {
                    'EUR-Lex': results.sources?.filter(s => s.domain?.includes('eur-lex')) || [],
                    'Datatilsynet': results.sources?.filter(s => s.domain?.includes('datatilsynet')) || [],
                    'EDPB': results.sources?.filter(s => s.domain?.includes('edpb')) || [],
                    'Retsinformation': results.sources?.filter(s => s.domain?.includes('retsinformation')) || [],
                    'KL': results.sources?.filter(s => s.domain?.includes('kl.dk')) || [],
                    'Andre kilder': results.sources?.filter(s =>
                      !s.domain?.includes('eur-lex') &&
                      !s.domain?.includes('datatilsynet') &&
                      !s.domain?.includes('edpb') &&
                      !s.domain?.includes('retsinformation') &&
                      !s.domain?.includes('kl.dk')
                    ) || []
                  };

                  return Object.entries(groupedSources)
                    .filter(([_, sources]) => sources.length > 0)
                    .map(([engineName, sources]) => (
                      <div key={engineName} className="search-engine-item">
                        <div
                          className="engine-header"
                          onClick={() => setExpandedEngines(prev => ({
                            ...prev,
                            [engineName]: !prev[engineName]
                          }))}
                        >
                          <div className="engine-info">
                            <div className="engine-name">
                              <FaCheckCircle className="engine-icon" size={14} />
                              {engineName}
                            </div>
                            <div className="engine-count">{sources.length}</div>
                          </div>
                          <FaChevronDown
                            className={`expand-icon ${expandedEngines[engineName] ? 'expanded' : ''}`}
                            size={14}
                          />
                        </div>

                        {expandedEngines[engineName] && (
                          <div className="engine-sources">
                            {sources.map((source, idx) => (
                              <div key={`${engineName}-${idx}`} className="source-item">
                                <a
                                  href={sourceUrl(source.url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="source-link"
                                >
                                  <FaExternalLinkAlt className="link-icon" size={12} />
                                  <span className="link-text">
                                    {source.title || source.url}
                                  </span>
                                </a>
                                {source.snippet && (
                                  <div className="source-snippet">
                                    "{source.snippet}"
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ));
                })()}
              </SearchEnginesList>
            </SystemCard>

            {results.key_findings && results.key_findings.length > 0 && (
              <DetailsSection>
                <h3>Vigtige indsigter</h3>
                <ul>
                  {results.key_findings.map((finding, index) => (
                    <li key={`finding-${index}`}>{finding}</li>
                  ))}
                </ul>
              </DetailsSection>
            )}

            {results.recommendations && results.recommendations.length > 0 && (
              <DetailsSection>
                <h3>Anbefalinger</h3>
                <ul>
                  {results.recommendations.map((rec, index) => (
                    <li key={`recommendation-${index}`}>{rec}</li>
                  ))}
                </ul>
              </DetailsSection>
            )}

            {results.citations && results.citations.length > 0 && (
              <CitationsSection>
                <CitationsHeader>
                  <h3>
                    <FaQuoteLeft />
                    Tekstuddrag fra kilder ({results.citations.length})
                  </h3>
                </CitationsHeader>
                <CitationsList>
                  {results.citations.map((citation, index) => (
                    <CitationItem
                      key={index}
                    >
                      <div className="quote">"{citation.text}"</div>
                      <div className="citation-source">
                        — {citation.source.title} ({citation.source.authority || citation.source.domain})
                      </div>
                    </CitationItem>
                  ))}
                </CitationsList>
              </CitationsSection>
            )}
          </>
        )}
      </ResultsSection>
    </PageShell>
  );
};

export default ResearchPage;
