import React, { useState, useMemo, useEffect } from 'react';
import styled from 'styled-components';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaBook,
  FaSearch,
  FaGavel,
  FaRobot,
  FaExternalLinkAlt,
  FaTags,
  FaBalanceScale,
  FaShieldAlt,
  FaCogs,
  FaDatabase,
  FaBrain,
  FaEye,
  FaLock,
  FaPlus,
  FaTimes,
  FaSave,
  FaYoutube,
  FaFileAlt,
  FaLightbulb,
  FaClipboardCheck,
  FaTachometerAlt,
  FaHeartbeat,
  FaFolderOpen,
  FaSync as FaSyncIcon,
  FaExclamationTriangle
} from 'react-icons/fa';

import fallbackKnowledgeItems from '../data/knowledgeBaseFallback.json';
import {
  PageShell,
  PageHeader,
  OutlinePill,
} from '../components/page-chrome/PageChrome';


const ICON_MAP = {
  FaBook,
  FaGavel,
  FaRobot,
  FaExternalLinkAlt,
  FaTags,
  FaBalanceScale,
  FaShieldAlt,
  FaCogs,
  FaDatabase,
  FaBrain,
  FaEye,
  FaLock,
  FaFileAlt,
  FaLightbulb,
  FaClipboardCheck,
  FaTachometerAlt,
  FaHeartbeat,
  FaFolderOpen,
  FaSync: FaSyncIcon,
};

const resolveIconComponent = (item) => {
  if (item?.icon && typeof item.icon === 'function') {
    return item.icon;
  }
  if (item?.iconKey && ICON_MAP[item.iconKey]) {
    return ICON_MAP[item.iconKey];
  }
  if (typeof item?.icon === 'string' && ICON_MAP[item.icon]) {
    return ICON_MAP[item.icon];
  }
  if (item?.category && CATEGORY_META[item.category]?.icon) {
    return CATEGORY_META[item.category].icon;
  }
  return FaBook;
};

const mapItemsWithIcons = (items = []) => {
  return (items || []).map((item, index) => {
    const icon = resolveIconComponent(item);
    const iconKey =
      item.iconKey ||
      (typeof item.icon === 'string' ? item.icon : undefined) ||
      (item.category && CATEGORY_META[item.category]?.iconKey) ||
      undefined;

    return {
      id: item.id ?? index + 1,
      ...item,
      iconKey,
      icon,
      tags: item.tags || [],
      references: item.references || [],
    };
  });
};

const CATEGORY_META = {
  legal: { label: 'Juridiske Termer', icon: FaGavel, iconKey: 'FaGavel' },
  compliance: { label: 'Compliance', icon: FaShieldAlt, iconKey: 'FaShieldAlt' },
  ai: { label: 'AI Teknologi', icon: FaRobot, iconKey: 'FaRobot' },
  operations: { label: 'Drift & Processer', icon: FaCogs, iconKey: 'FaCogs' },
  technical: { label: 'Tekniske Begreber', icon: FaCogs, iconKey: 'FaCogs' },
  video: { label: 'Videoressourcer', icon: FaYoutube, iconKey: 'FaYoutube' },
};

const SearchAndFilter = styled.div`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
`;

const SearchBox = styled.div`
  position: relative;
  flex: 1 1 240px;
  min-width: 0;
  max-width: 100%;

  input {
    width: 100%;
    padding: 0.75rem 2.5rem 0.75rem 1rem;
    border: 1px solid ${(p) => p.theme.colors.border};
    border-radius: ${(p) => p.theme.borderRadius};
    font-family: ${(p) => p.theme.fonts.body};
    font-size: 0.95rem;
    background: ${(p) => p.theme.colors.surface};
    color: ${(p) => p.theme.colors.text};
    transition: ${(p) => p.theme.animations.transitionFast};

    &:focus {
      border-color: ${(p) => p.theme.colors.primary};
      outline: none;
      box-shadow: ${(p) => p.theme.shadows.focus};
    }

    &::placeholder {
      color: ${(p) => p.theme.colors.textFaded};
      font-style: italic;
    }
  }

  .search-icon {
    position: absolute;
    right: 0.85rem;
    top: 50%;
    transform: translateY(-50%);
    color: ${(p) => p.theme.colors.textMuted};
  }
`;

const CategoryFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const CategoryButton = styled(OutlinePill)`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  box-shadow: ${props => props.active ? '0 2px 8px rgba(201, 68, 22, 0.25)' : 'none'};

  &:hover {
    background: ${props => props.active
      ? 'linear-gradient(135deg, #A03612 0%, #C94416 100%)'
      : props.theme.isDark
        ? 'rgba(255, 255, 255, 0.15)'
        : props.theme.colors.gray[200]};
    box-shadow: ${props => props.active ? '0 4px 12px rgba(201, 68, 22, 0.35)' : 'none'};
    transform: ${props => props.active ? 'translateY(-1px)' : 'none'};
  }
`;

const KnowledgeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr));
  gap: 2rem;
`;

const TermCard = styled(motion.div)`
  min-width: 0;
  overflow-wrap: anywhere;
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  padding: 1.5rem;
  border-left: 3px solid ${(p) => {
    switch (p.category) {
      case 'legal': return p.theme.colors.primary;
      case 'ai': return p.theme.colors.primary;
      case 'technical': return p.theme.colors.success;
      case 'compliance': return p.theme.colors.warning;
      case 'video': return p.theme.colors.danger;
      default: return p.theme.colors.borderSoft;
    }
  }};
  transition: ${(p) => p.theme.animations.transition};

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${(p) => p.theme.shadows.md};
  }
`;

const TermHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 1rem;

  .icon {
    background: transparent;
    border: 1px solid ${(p) => {
      switch (p.category) {
        case 'legal': return p.theme.colors.primary;
        case 'ai': return p.theme.colors.primary;
        case 'technical': return p.theme.colors.success;
        case 'compliance': return p.theme.colors.warning;
        case 'video': return p.theme.colors.danger;
        default: return p.theme.colors.border;
      }
    }};
    color: ${(p) => {
      switch (p.category) {
        case 'legal': return p.theme.colors.primary;
        case 'ai': return p.theme.colors.primary;
        case 'technical': return p.theme.colors.success;
        case 'compliance': return p.theme.colors.warning;
        case 'video': return p.theme.colors.danger;
        default: return p.theme.colors.textMuted;
      }
    }};
    width: 40px;
    height: 40px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    flex-shrink: 0;
  }

  .content {
    flex: 1;
    min-width: 0;

    h3 {
      color: ${props => props.theme.isDark
        ? props.theme.colors.gray[100]
        : props.theme.colors.gray[800]};
      margin-bottom: 0.25rem;
      font-size: 1.1rem;
      line-height: 1.3;
    }

    .meta {
      color: ${props => props.theme.isDark
        ? props.theme.colors.gray[400]
        : props.theme.colors.gray[500]};
      font-size: 0.875rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
  }
`;

const TermDefinition = styled.div`
  color: ${props => props.theme.isDark
    ? props.theme.colors.gray[300]
    : props.theme.colors.gray[700]};
  line-height: 1.6;
  margin-bottom: 1rem;
  font-size: 0.9rem;
`;

const TermContext = styled.div`
  background: ${props => props.theme.isDark
    ? 'rgba(255, 255, 255, 0.05)'
    : props.theme.colors.gray[50]};
  border-radius: ${props => props.theme.borderRadius};
  padding: 0.75rem;
  margin-bottom: 1rem;
  border-left: 3px solid ${props => props.theme.colors.juridical.lightGold};

  .label {
    font-weight: 600;
    color: ${props => props.theme.isDark
      ? props.theme.colors.gray[200]
      : props.theme.colors.gray[700]};
    font-size: 0.8rem;
    margin-bottom: 0.25rem;
  }

  .content {
    color: ${props => props.theme.isDark
      ? props.theme.colors.gray[400]
      : props.theme.colors.gray[600]};
    font-size: 0.85rem;
    line-height: 1.5;
  }
`;

const VideoWrapper = styled.div`
  position: relative;
  width: 100%;
  padding-bottom: 56.25%;
  border-radius: ${props => props.theme.borderRadiusLarge};
  overflow: hidden;
  margin-bottom: 1.25rem;
  box-shadow: 0 12px 30px -15px rgba(0, 0, 0, 0.35);

  iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
`;

const TermFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;

  .tags {
    display: flex;
    min-width: 0;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .tag {
    padding: 0.2rem 0.5rem;
    background: ${props => props.theme.isDark
      ? 'rgba(255, 255, 255, 0.1)'
      : props.theme.colors.gray[100]};
    color: ${props => props.theme.isDark
      ? props.theme.colors.gray[300]
      : props.theme.colors.gray[600]};
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .references {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .reference-link {
    color: ${props => props.theme.isDark
      ? props.theme.colors.juridical.lightGold
      : '#C94416'};
    text-decoration: none;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.2rem;

    &:hover {
      color: ${props => props.theme.colors.juridical.lightNavy};
    }
  }
`;

const VideoSection = styled.div`
  margin-top: 3rem;
`;

const VideoHeading = styled.h2`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: ${props => props.theme.isDark
    ? props.theme.colors.gray[100]
    : props.theme.colors.gray[800]};
  margin-bottom: 1.5rem;
  font-size: 1.35rem;
`;

const VideoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
  gap: 2rem;
`;

const StatsBar = styled.div`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  padding: 16px 20px;
  margin-bottom: 1.75rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;

  .stat {
    text-align: left;
    border-left: 2px solid ${(p) => p.theme.colors.borderSoft};
    padding-left: 16px;

    &:first-child { border-left: none; padding-left: 0; }

    .number {
      font-family: ${(p) => p.theme.fonts.display};
      font-size: 1.6rem;
      font-weight: 600;
      color: ${(p) => p.theme.colors.primary};
      line-height: 1;
    }

    .label {
      font-family: ${(p) => p.theme.fonts.sans};
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${(p) => p.theme.colors.textMuted};
      margin-top: 6px;
    }
  }
`;

const AddButton = styled.button`
  font-family: ${(p) => p.theme.fonts.sans};
  background: ${(p) => p.theme.colors.primary};
  color: ${(p) => p.theme.colors.white};
  border: 1px solid ${(p) => p.theme.colors.primary};
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: ${(p) => p.theme.animations.transitionFast};
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &:hover {
    background: ${(p) => p.theme.colors.primaryDark};
    border-color: ${(p) => p.theme.colors.primaryDark};
  }
`;

const StatusMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding: 0.65rem 0.9rem;
  width: 100%;
  border-radius: ${props => props.theme.borderRadius};
  font-size: 0.8rem;
  background: ${props => props.$variant === 'error'
    ? 'rgba(239, 68, 68, 0.12)'
    : 'rgba(59, 130, 246, 0.12)'};
  color: ${props => props.$variant === 'error'
    ? (props.theme.mode === 'dark' ? 'rgba(252, 165, 165, 0.9)' : '#7f1d1d')
    : (props.theme.mode === 'dark' ? 'rgba(191, 219, 254, 0.9)' : '#1e3a8a')};
  border: 1px solid ${props => props.$variant === 'error'
    ? 'rgba(239, 68, 68, 0.28)'
    : 'rgba(59, 130, 246, 0.28)'};

  svg {
    font-size: 0.9rem;
  }

  .spin {
    animation: spin 1s linear infinite;
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(5px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ModalContent = styled(motion.div)`
  background: ${props => props.theme.isDark
    ? props.theme.colors.gray[800]
    : 'white'};
  border-radius: ${props => props.theme.borderRadiusLarge};
  padding: 2rem;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: ${props => props.theme.shadows.xl};
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;

  h2 {
    color: ${props => props.theme.isDark
      ? props.theme.colors.gray[100]
      : props.theme.colors.gray[800]};
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.isDark
    ? props.theme.colors.gray[400]
    : props.theme.colors.gray[500]};
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 50%;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.isDark
      ? 'rgba(255, 255, 255, 0.1)'
      : props.theme.colors.gray[100]};
    color: ${props => props.theme.isDark
      ? props.theme.colors.gray[200]
      : props.theme.colors.gray[700]};
  }
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: ${props => props.theme.isDark
      ? props.theme.colors.gray[200]
      : props.theme.colors.gray[700]};
  }

  input, textarea, select {
    width: 100%;
    padding: 0.75rem;
    border: 2px solid ${props => props.theme.isDark
      ? 'rgba(255, 255, 255, 0.2)'
      : props.theme.colors.gray[300]};
    border-radius: ${props => props.theme.borderRadius};
    font-size: 0.875rem;
    background: ${props => props.theme.isDark
      ? 'rgba(0, 0, 0, 0.2)'
      : 'white'};
    color: ${props => props.theme.isDark
      ? props.theme.colors.gray[100]
      : props.theme.colors.gray[800]};

    &:focus {
      border-color: #C94416;
      outline: none;
    }

    &::placeholder {
      color: ${props => props.theme.isDark
        ? props.theme.colors.gray[500]
        : props.theme.colors.gray[400]};
    }
  }

  textarea {
    resize: vertical;
    min-height: 100px;
  }
`;

const ReferenceSection = styled.div`
  border: 1px solid ${props => props.theme.isDark
    ? 'rgba(255, 255, 255, 0.2)'
    : props.theme.colors.gray[200]};
  border-radius: ${props => props.theme.borderRadius};
  padding: 1rem;
  margin-bottom: 1rem;

  .reference-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;

    h4 {
      margin: 0;
      color: ${props => props.theme.isDark
        ? props.theme.colors.gray[200]
        : props.theme.colors.gray[700]};
    }
  }

  .reference-item {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;

    input {
      flex: 1;
    }

    button {
      background: ${props => props.theme.colors.danger};
      color: white;
      border: none;
      border-radius: 4px;
      padding: 0.75rem;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: ${props => props.theme.colors.dangerDark || '#c53030'};
      }
    }
  }
`;

const AddReferenceButton = styled.button`
  background: ${props => props.theme.isDark
    ? 'rgba(255, 255, 255, 0.05)'
    : props.theme.colors.gray[100]};
  color: ${props => props.theme.isDark
    ? props.theme.colors.gray[300]
    : props.theme.colors.gray[700]};
  border: 1px dashed ${props => props.theme.isDark
    ? 'rgba(255, 255, 255, 0.2)'
    : props.theme.colors.gray[300]};
  border-radius: ${props => props.theme.borderRadius};
  padding: 0.75rem;
  width: 100%;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  &:hover {
    background: ${props => props.theme.colors.gray[200]};
    border-color: ${props => props.theme.colors.gray[400]};
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 2rem;

  button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: ${props => props.theme.borderRadius};
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    &.cancel {
      background: ${props => props.theme.colors.gray[100]};
      color: ${props => props.theme.colors.gray[700]};

      &:hover {
        background: ${props => props.theme.colors.gray[200]};
      }
    }

    &.save {
      background: #C94416;
      color: white;

      &:hover {
        background: #A03612;
      }
    }
  }
`;

const PERSONAL_NOTES_KEY = 'shield.personal-knowledge-notes.v1';
const loadPersonalNotes = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(PERSONAL_NOTES_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter(item => item && typeof item.id === 'string' && item.id.startsWith('personal-') && typeof item.term === 'string' && typeof item.definition === 'string') : [];
  } catch { return []; }
};

const KnowledgeBasePage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [catalogueItems, setKnowledgeItems] = useState(() => mapItemsWithIcons(fallbackKnowledgeItems));
  const [personalNotes, setPersonalNotes] = useState(loadPersonalNotes);
  const [personalError, setPersonalError] = useState('');
  const knowledgeItems = useMemo(() => [...catalogueItems, ...mapItemsWithIcons(personalNotes).map(item => ({ ...item, personal: true }))], [catalogueItems, personalNotes]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const location = useLocation();
  const queryFromUrl = new URLSearchParams(location.search).get('query') || '';

  const categories = useMemo(() => {
    const unique = new Set(knowledgeItems.map(item => item.category).filter(Boolean));
    const dynamic = Array.from(unique).map((id) => ({
      id,
      label: CATEGORY_META[id]?.label || id,
      icon: CATEGORY_META[id]?.icon || FaBook,
    }));
    dynamic.sort((a, b) => a.label.localeCompare(b.label, 'da'));
    return [{ id: 'all', label: 'Alle', icon: FaBook }, ...dynamic];
  }, [knowledgeItems]);

  useEffect(() => {
    if (activeCategory !== 'all' && !categories.some(category => category.id === activeCategory)) {
      setActiveCategory('all');
    }
  }, [categories, activeCategory]);

  useEffect(() => {
    setSearchTerm(queryFromUrl);
    setActiveCategory('all');
  }, [queryFromUrl]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchKnowledgeBase = async () => {
      setLoading(true);
      try {
        const baseUrl = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');
        const response = await fetch(`${baseUrl}/api/knowledge-base`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!isMounted) {
          return;
        }

        if (Array.isArray(data) && data.length > 0) {
          setKnowledgeItems(mapItemsWithIcons(data));
          setErrorMessage('');
        } else if (Array.isArray(data) && data.length === 0) {
          setKnowledgeItems([]);
          setErrorMessage('Det fælles opslagsværk har endnu ingen begreber. Egne noter gemmes særskilt i denne browser.');
        }
      } catch (error) {
        if (!isMounted || controller.signal.aborted) {
          return;
        }
        console.error('Kunne ikke hente vidensbase:', error);
        setErrorMessage('Kunne ikke hente opdateret vidensbase. Viser lokale data.');
        setKnowledgeItems(mapItemsWithIcons(fallbackKnowledgeItems));
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchKnowledgeBase();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);


  const savePersonalNotes = (notes) => {
    try {
      localStorage.setItem(PERSONAL_NOTES_KEY, JSON.stringify(notes));
      setPersonalNotes(notes);
      setPersonalError('');
      return true;
    } catch {
      setPersonalError('Browseren kunne ikke gemme ændringen. Noten er ikke gemt. Kontrollér, om lokal lagring er tilladt.');
      return false;
    }
  };
  const handleAddTerm = ({ icon, ...newTerm }) => {
    const note = {
      ...newTerm, id: `personal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      references: (newTerm.references || []).filter(ref => ref.text && ref.url),
    };
    if (savePersonalNotes([...personalNotes, note])) setShowAddModal(false);
  };

  const filteredItems = useMemo(() => {
    return knowledgeItems.filter(item => {
      const matchesSearch = item.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.definition.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCategory = activeCategory === 'all' || item.category === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [knowledgeItems, searchTerm, activeCategory]);

  const stats = useMemo(() => {
    const totals = knowledgeItems.reduce((acc, item) => {
      const key = item.category || 'other';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      total: knowledgeItems.length,
      legal: totals.legal || 0,
      ai: totals.ai || 0,
      compliance: totals.compliance || 0,
      operations: totals.operations || 0,
      technical: totals.technical || 0,
      video: totals.video || 0,
    };
  }, [knowledgeItems]);

  const nonVideoItems = filteredItems.filter(item => item.category !== 'video');
  const videoItems = filteredItems.filter(item => item.category === 'video');

  const extractYouTubeId = (url = '') => {
    if (!url) return '';
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch && embedMatch[1]) return embedMatch[1];
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch && shortMatch[1]) return shortMatch[1];
    const paramMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (paramMatch && paramMatch[1]) return paramMatch[1];
    return '';
  };


  const renderTermCard = (item) => {
    const IconComponent = item.icon || FaBook;
    const rawEmbed = item.videoEmbedUrl || item.videoUrl || (item.videoId ? `https://www.youtube.com/embed/${item.videoId}` : undefined);
    const videoId = extractYouTubeId(rawEmbed);
    const embedSrc = videoId ? `https://www.youtube.com/embed/${videoId}` : rawEmbed;
    const previewHtml = videoId
      ? `
        <style>
          *{padding:0;margin:0;overflow:hidden}
          html,body{height:100%;}
          img{width:100%;height:100%;object-fit:cover;}
          .yt-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:68px;height:48px;background:url('https://www.youtube.com/s/desktop/6b47b750/img/watch/yt_play_button.svg') no-repeat center center;}
        </style>
        <a href="https://www.youtube.com/embed/${videoId}?autoplay=1">
          <img src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="Video preview"/>
          <span class='yt-play'></span>
        </a>
      `
      : null;

    return (
      <TermCard
        key={item.id}
        category={item.category}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <TermHeader category={item.category}>
          <div className="icon">
            <IconComponent />
          </div>
          <div className="content">
            <h3>{item.term}</h3>
            <div className="meta">
              <FaTags />
              <span>{categories.find(cat => cat.id === item.category)?.label}</span>
            </div>
          </div>
        </TermHeader>

        {item.personal && <p>Egen opslagsnote · kun gemt i denne browser <button type="button" onClick={() => savePersonalNotes(personalNotes.filter(note => note.id !== item.id))} aria-label={`Slet egen note: ${item.term}`}>Slet note</button></p>}
        <TermDefinition>{item.definition}</TermDefinition>

        {item.context && (
          <TermContext>
            <div className="label">Kontekst og anvendelse</div>
            <div className="content">{item.context}</div>
          </TermContext>
        )}

        {embedSrc && (
          <VideoWrapper>
            <iframe
              src={embedSrc}
              title={`Videoressource: ${item.term}`}
              loading="lazy"
              srcDoc={previewHtml || undefined}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </VideoWrapper>
        )}

        <TermFooter>
          <div className="tags">
            {item.tags?.map((tag, index) => (
              <span key={index} className="tag">{tag}</span>
            ))}
          </div>
          <div className="references">
            {item.references?.map((ref, index) => (
              <a
                key={index}
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="reference-link"
              >
                {ref.text}
                <FaExternalLinkAlt />
              </a>
            ))}
          </div>
        </TermFooter>
      </TermCard>
    );
  };

  const shouldShowVideoSection = videoItems.length > 0 && (activeCategory === 'video' || activeCategory === 'all');

  return (
    <PageShell>
      <PageHeader
        eyebrow="S.H.I.E.L.D. · videnbase"
        title="Begreber og opslagsværk"
        lede="Forklaringer på juridiske begreber, AI-teknologi og arbejdsprocesser. Brug originalkilderne til faglig kontrol. Egne opslagsnoter gemmes kun i denne browserprofil og deles ikke med andre eller knyttes til en sag."
      />

      <StatsBar>
        <div className="stat">
          <div className="number">{stats.total}</div>
          <div className="label">Samlede Termer</div>
        </div>
        <div className="stat">
          <div className="number">{stats.legal}</div>
          <div className="label">Juridiske Termer</div>
        </div>
        <div className="stat">
          <div className="number">{stats.ai}</div>
          <div className="label">AI Teknologi</div>
        </div>
        <div className="stat">
          <div className="number">{stats.operations}</div>
          <div className="label">Drift & Processer</div>
        </div>
        <div className="stat">
          <div className="number">{stats.compliance}</div>
          <div className="label">Compliance</div>
        </div>
        <div className="stat">
          <div className="number">{stats.video}</div>
          <div className="label">Videoressourcer</div>
        </div>
      </StatsBar>

      <SearchAndFilter>
        <SearchBox>
          <input
            type="text"
            aria-label="Søg i opslagsværket"
            placeholder="Søg i vidensdatabasen efter termer, definitioner eller tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <FaSearch className="search-icon" />
        </SearchBox>

        <CategoryFilters>
          {categories.map(category => (
            <CategoryButton
              key={category.id}
              $active={activeCategory === category.id}
              aria-pressed={activeCategory === category.id}
              onClick={() => setActiveCategory(category.id)}
            >
              <category.icon />
              {category.label}
            </CategoryButton>
          ))}
        </CategoryFilters>

      <AddButton onClick={() => setShowAddModal(true)}>
        <FaPlus />
        Tilføj egen opslagsnote
      </AddButton>

      {personalError && !showAddModal && <p role="alert">{personalError}</p>}
      {(loading || errorMessage) && (
        <StatusMessage $variant={errorMessage ? 'error' : 'info'}>
          {errorMessage ? (
            <FaExclamationTriangle aria-hidden="true" />
          ) : (
            <FaSyncIcon className="spin" aria-hidden="true" />
          )}
          <span>{errorMessage || 'Opdaterer vidensbasen...'}</span>
        </StatusMessage>
      )}
    </SearchAndFilter>

      {activeCategory !== 'video' && nonVideoItems.length > 0 && (
        <KnowledgeGrid>
          {nonVideoItems.map(item => renderTermCard(item))}
        </KnowledgeGrid>
      )}

      {shouldShowVideoSection && (
        <VideoSection>
          <VideoHeading>
            <FaYoutube />
            Videoressourcer
          </VideoHeading>
          <VideoGrid>
            {videoItems.map(item => renderTermCard(item))}
          </VideoGrid>
        </VideoSection>
      )}

      {filteredItems.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '16px',
          boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)'
        }}>
          <FaSearch style={{ fontSize: '3rem', color: '#a0aec0', marginBottom: '1rem' }} />
          <h3 style={{ color: '#4a5568', marginBottom: '0.5rem' }}>Ingen termer fundet</h3>
          <p style={{ color: '#718096' }}>Prøv at justere dine søgekriterier eller vælg en anden kategori.</p>
        </div>
      )}

      <AnimatePresence>
        {showAddModal && (
          <AddTermModal
            onClose={() => setShowAddModal(false)}
            onSave={handleAddTerm}
            categories={categories}
            error={personalError}
          />
        )}
      </AnimatePresence>
    </PageShell>
  );
};

const AddTermModal = ({ onClose, onSave, categories, error }) => {
  const [formData, setFormData] = useState({
    term: '',
    category: 'legal',
    definition: '',
    context: '',
    tags: '',
    videoEmbedUrl: '',
    references: [{ text: '', url: '' }]
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleReferenceChange = (index, field, value) => {
    const newReferences = [...formData.references];
    newReferences[index][field] = value;
    setFormData(prev => ({ ...prev, references: newReferences }));
  };

  const addReference = () => {
    setFormData(prev => ({
      ...prev,
      references: [...prev.references, { text: '', url: '' }]
    }));
  };

  const removeReference = (index) => {
    if (formData.references.length > 1) {
      const newReferences = formData.references.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, references: newReferences }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.term && formData.definition) {
      const categoryIcon = categories.find(cat => cat.id === formData.category)?.icon || FaBook;
      const newTerm = {
        ...formData,
        videoEmbedUrl: formData.videoEmbedUrl?.trim(),
        icon: categoryIcon,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
      };
      onSave(newTerm);
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent
        role="dialog"
        aria-modal="true"
        aria-label="Tilføj egen opslagsnote"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        <ModalHeader>
          <h2>
            <FaPlus />
            Tilføj egen opslagsnote
          </h2>
          <CloseButton onClick={onClose}>
            <FaTimes />
          </CloseButton>
        </ModalHeader>

        <p>Noten gemmes kun i denne browserprofil. Den er ikke en fælles eller fagligt godkendt kilde.</p>
        {error && <p role="alert">{error}</p>}
        <form onSubmit={handleSubmit}>
          <FormGroup>
            <label htmlFor="personal-note-term">Begreb *</label>
            <input
              type="text"
              id="personal-note-term"
              value={formData.term}
              onChange={(e) => handleInputChange('term', e.target.value)}
              placeholder="Fx: Risikoklassificering"
              required
            />
          </FormGroup>

          <FormGroup>
            <label>Kategori *</label>
            <select
              value={formData.category}
              onChange={(e) => handleInputChange('category', e.target.value)}
              required
            >
              {categories.filter(cat => cat.id !== 'all').map(category => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </FormGroup>

          <FormGroup>
            <label>Definition *</label>
            <textarea
              value={formData.definition}
              onChange={(e) => handleInputChange('definition', e.target.value)}
              placeholder="Kort og præcis definition af termen..."
              required
            />
          </FormGroup>

          <FormGroup>
            <label>Kontekst og anvendelse</label>
            <textarea
              value={formData.context}
              onChange={(e) => handleInputChange('context', e.target.value)}
              placeholder="Hvor og hvordan bruges dette term i praksis..."
            />
          </FormGroup>

          {formData.category === 'video' && (
            <FormGroup>
              <label>YouTube URL eller embed-link</label>
              <input
                type="url"
                value={formData.videoEmbedUrl}
                onChange={(e) => handleInputChange('videoEmbedUrl', e.target.value)}
                placeholder="https://www.youtube.com/embed/..."
              />
              <small style={{ color: '#718096' }}>
                Tip: Brug det fulde embed-link (fx https://www.youtube.com/embed?...), eller lad feltet være tomt for at bruge automatiske søgninger.
              </small>
            </FormGroup>
          )}

          <FormGroup>
            <label>Tags (komma-separeret)</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => handleInputChange('tags', e.target.value)}
              placeholder="AI Act, EU Lov, Risikovurdering"
            />
          </FormGroup>

          <ReferenceSection>
            <div className="reference-header">
              <h4>Referencer</h4>
            </div>
            {formData.references.map((ref, index) => (
              <div key={index} className="reference-item">
                <input
                  type="text"
                  placeholder="Reference tekst"
                  value={ref.text}
                  onChange={(e) => handleReferenceChange(index, 'text', e.target.value)}
                />
                <input
                  type="url"
                  placeholder="URL"
                  value={ref.url}
                  onChange={(e) => handleReferenceChange(index, 'url', e.target.value)}
                />
                {formData.references.length > 1 && (
                  <button type="button" onClick={() => removeReference(index)}>
                    <FaTimes />
                  </button>
                )}
              </div>
            ))}
            <AddReferenceButton type="button" onClick={addReference}>
              <FaPlus />
              Tilføj reference
            </AddReferenceButton>
          </ReferenceSection>

          <ModalActions>
            <button type="button" className="cancel" onClick={onClose}>
              <FaTimes />
              Annuller
            </button>
            <button type="submit" className="save">
              <FaSave />
              Gem note i denne browser
            </button>
          </ModalActions>
        </form>
      </ModalContent>
    </ModalOverlay>
  );
};

export default KnowledgeBasePage;
