import React, { useState, useMemo, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  FaSearch,
  FaExternalLinkAlt,
  FaRobot,
  FaCheckCircle,
  FaClock,
  FaMapMarkerAlt,
  FaTimes,
  FaSync
} from 'react-icons/fa';

import bundledProjectsFallback from '../data/aiProjectsFallback.json';
import {
  PageShell,
  PageHeader,
  OutlinePill,
  SearchField,
} from '../components/page-chrome/PageChrome';

const Toolbar = styled.div`
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 1.25rem;
`;

const FilterChips = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const ResultsCount = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  color: ${(p) => p.theme.colors.textMuted};
  margin-bottom: 1.5rem;
`;

const ProjectsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ProjectCard = styled(motion.div)`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  overflow: hidden;
  transition: ${(p) => p.theme.animations.transition};
  cursor: pointer;

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${(p) => p.theme.shadows.md};
    border-color: ${(p) => p.theme.colors.primary};
  }
`;

const ProjectImage = styled.div`
  width: 100%;
  height: 180px;
  background: ${props => props.$imageUrl
    ? `url(${props.$imageUrl})`
    : props.theme.colors.gradients.primary};
  background-size: cover;
  background-position: center;
  position: relative;

  ${props => props.$isSignature && `
    &::after {
      content: 'Signaturprojekt';
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      padding: 0.35rem 0.75rem;
      background: rgba(16, 185, 129, 0.95);
      color: white;
      font-size: 0.7rem;
      font-weight: 600;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
  `}
`;

const ProjectContent = styled.div`
  padding: 1.25rem;
`;

const ProjectTitle = styled.h3`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.18rem;
  font-weight: 600;
  letter-spacing: -0.005em;
  color: ${(p) => p.theme.colors.text};
  margin: 0 0 0.6rem 0;
  line-height: 1.3;
`;

const ProjectDescription = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.95rem;
  color: ${(p) => p.theme.colors.text};
  line-height: 1.55;
  margin: 0 0 1rem 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ProjectMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const MetaBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 3px 10px;
  background: transparent;
  border: 1px solid ${(p) => p.theme.colors.border};
  color: ${(p) => p.theme.colors.textMuted};
  border-radius: 999px;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.04em;

  svg {
    font-size: 0.7rem;
  }
`;

const StatusBadge = styled(MetaBadge)`
  ${({ $status, theme }) => {
    if ($status === 'I brug') {
      return `border-color: ${theme.colors.success}; color: ${theme.colors.success};`;
    }
    if ($status === 'Planlægges taget i brug') {
      return `border-color: ${theme.colors.warning}; color: ${theme.colors.warning};`;
    }
    return '';
  }}
`;

const Modal = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 2rem;
  overflow-y: auto;
`;

const ModalContent = styled(motion.div)`
  background: ${props => props.theme.mode === 'dark'
    ? 'rgba(15, 23, 42, 0.98)'
    : props.theme.colors.white};
  border-radius: ${props => props.theme.borderRadiusLarge};
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
`;

const ModalHeader = styled.div`
  position: sticky;
  top: 0;
  background: ${props => props.theme.mode === 'dark'
    ? 'rgba(15, 23, 42, 0.98)'
    : props.theme.colors.white};
  padding: 1.5rem;
  border-bottom: 1px solid ${props => props.theme.mode === 'dark'
    ? 'rgba(148, 163, 184, 0.2)'
    : props.theme.colors.gray[200]};
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  z-index: 10;
`;

const CloseButton = styled.button`
  background: ${props => props.theme.mode === 'dark'
    ? 'rgba(148, 163, 184, 0.1)'
    : props.theme.colors.gray[100]};
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: ${props => props.theme.mode === 'dark'
    ? props.theme.colors.white
    : props.theme.colors.gray[600]};
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.theme.mode === 'dark'
      ? 'rgba(148, 163, 184, 0.2)'
      : props.theme.colors.gray[200]};
  }
`;

const ModalBody = styled.div`
  padding: 1.5rem;
`;

const ModalImage = styled.div`
  width: 100%;
  height: 300px;
  background: ${props => props.$imageUrl
    ? `url(${props.$imageUrl})`
    : props.theme.colors.gradients.primary};
  background-size: cover;
  background-position: center;
  border-radius: ${props => props.theme.borderRadius};
  margin-bottom: 1.5rem;
`;

const ModalTitle = styled.h2`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.theme.mode === 'dark'
    ? props.theme.colors.white
    : props.theme.colors.gray[900]};
  margin: 0 0 1rem 0;
`;

const ModalDescription = styled.div`
  font-size: 1rem;
  color: ${props => props.theme.mode === 'dark'
    ? 'rgba(226, 232, 240, 0.9)'
    : props.theme.colors.gray[700]};
  line-height: 1.7;
  margin-bottom: 1.5rem;

  p {
    margin-bottom: 1rem;
  }
`;

const ModalMetaSection = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  padding: 1.5rem;
  background: ${props => props.theme.mode === 'dark'
    ? 'rgba(30, 41, 59, 0.5)'
    : props.theme.colors.gray[50]};
  border-radius: ${props => props.theme.borderRadius};
  margin-bottom: 1.5rem;
`;

const MetaItem = styled.div`
  .label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${props => props.theme.mode === 'dark'
      ? 'rgba(148, 163, 184, 0.8)'
      : props.theme.colors.gray[500]};
    margin-bottom: 0.25rem;
  }

  .value {
    font-size: 0.95rem;
    font-weight: 600;
    color: ${props => props.theme.mode === 'dark'
      ? props.theme.colors.white
      : props.theme.colors.gray[900]};
  }
`;

const ExternalLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: ${props => props.theme.colors.gradients.primary};
  color: white;
  text-decoration: none;
  border-radius: ${props => props.theme.borderRadius};
  font-weight: 600;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${props => props.theme.shadows.lg};
  }
`;

const AIProjectsPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedScope, setSelectedScope] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState(bundledProjectsFallback);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [isLocalCopy, setIsLocalCopy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Hent live-katalog fra API ved mount; fall back til bundlet JSON hvis
  // backend er nede eller cache er tom.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get('/api/ai-projects', { timeout: 8000 });
        if (cancelled) return;
        const items = r.data?.items || [];
        if (items.length > 0) {
          setProjects(items);
          setIsLocalCopy(false);
          setFetchedAt(r.data?.fetched_at || null);
        }
      } catch (err) {
        // Behold bundled fallback
        console.warn('AI-projekt-katalog fetch fejlede, bruger bundlet fallback', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(projects.map(p => p.category).filter(Boolean));
    return ['all', ...Array.from(cats).sort((a, b) => a.localeCompare(b, 'da'))];
  }, [projects]);

  const scopes = useMemo(() => {
    const s = new Set(projects.map(p => p.scope).filter(Boolean));
    return ['all', ...Array.from(s).sort((a, b) => a.localeCompare(b, 'da'))];
  }, [projects]);

  const statuses = useMemo(() => {
    const s = new Set(projects.map(p => p.status).filter(Boolean));
    return ['all', ...Array.from(s).sort((a, b) => a.localeCompare(b, 'da'))];
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return projects.filter(project => {
      const matchesSearch = !q
        || (project.title || '').toLowerCase().includes(q)
        || (project.description || '').toLowerCase().includes(q)
        || (project.category || '').toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'all' || project.category === selectedCategory;
      const matchesScope = selectedScope === 'all' || project.scope === selectedScope;
      const matchesStatus = selectedStatus === 'all' || project.status === selectedStatus;
      return matchesSearch && matchesCategory && matchesScope && matchesStatus;
    });
  }, [projects, searchTerm, selectedCategory, selectedScope, selectedStatus]);

  const refreshFromSource = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const r = await axios.post('/api/ai-projects/refresh', null, { timeout: 60000 });
      if (r.data?.cache_updated) {
        const list = await axios.get('/api/ai-projects');
        setProjects(list.data?.items || []);
        setIsLocalCopy(false);
        setFetchedAt(list.data?.fetched_at || null);
      } else if (r.data?.error) {
        setError(r.data.error);
      }
    } catch (err) {
      setError(err.message || 'Refresh fejlede');
    } finally {
      setRefreshing(false);
    }
  };

  const formatRelative = (iso) => {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const seconds = Math.round((Date.now() - then) / 1000);
    if (seconds < 60) return `${seconds}s siden`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m siden`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}t siden`;
    return `${Math.round(seconds / 86400)}d siden`;
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="S.H.I.E.L.D. · ai-løsninger"
        title="Inspiration til AI-løsninger"
        lede="Et inspirationskatalog fra offentlig-ai.dk med offentlige AI-projekter. Oplysningerne er ikke SHIELD-vurderinger eller godkendelser. Kontrollér aktuelle forhold hos kilden, før de bruges i en anskaffelse."
      />

      <Toolbar>
        <SearchField>
          <FaSearch />
          <input
            type="text"
            placeholder="Søg efter projekter…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </SearchField>
        <button
          type="button"
          onClick={refreshFromSource}
          disabled={refreshing}
          title="Hent friske projekter fra offentlig-ai.dk"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.55rem 0.95rem',
            fontFamily: 'inherit',
            fontSize: '0.82rem',
            fontWeight: 500,
            border: '1px solid currentColor',
            background: 'transparent',
            borderRadius: 4,
            cursor: refreshing ? 'wait' : 'pointer',
            opacity: refreshing ? 0.6 : 1,
          }}
        >
          <FaSync style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Henter…' : 'Opdatér fra kilde'}
        </button>
      </Toolbar>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        marginBottom: '1.25rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.55, marginRight: '0.4rem' }}>Kategori</span>
          <FilterChips style={{ flexWrap: 'wrap' }}>
            {categories.slice(0, 12).map(cat => (
              <OutlinePill
                key={cat}
                $active={selectedCategory === cat}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat === 'all' ? 'Alle' : cat}
              </OutlinePill>
            ))}
          </FilterChips>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.55, marginRight: '0.4rem' }}>Scope</span>
          <FilterChips style={{ flexWrap: 'wrap' }}>
            {scopes.map(s => (
              <OutlinePill key={s} $active={selectedScope === s} onClick={() => setSelectedScope(s)}>
                {s === 'all' ? 'Alle' : s}
              </OutlinePill>
            ))}
          </FilterChips>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.55, marginRight: '0.4rem' }}>Status</span>
          <FilterChips style={{ flexWrap: 'wrap' }}>
            {statuses.map(s => (
              <OutlinePill key={s} $active={selectedStatus === s} onClick={() => setSelectedStatus(s)}>
                {s === 'all' ? 'Alle' : s}
              </OutlinePill>
            ))}
          </FilterChips>
        </div>
      </div>

      <ResultsCount style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span>Viser {filteredProjects.length} af {projects.length} projekter</span>
        {!isLocalCopy ? (
          <span style={{ fontFamily: 'monospace', fontSize: '0.74rem', opacity: 0.7 }}>
            {fetchedAt ? `Hentet ${formatRelative(fetchedAt)}` : 'Hentetidspunkt ikke registreret'} · offentlig-ai.dk
          </span>
        ) : (
          <span style={{ fontFamily: 'monospace', fontSize: '0.74rem', opacity: 0.7 }}>
            Viser en lokal kopi ({projects.length} projekter). Oplysningerne kan være forældede; opdatér fra kilden.
          </span>
        )}
      </ResultsCount>

      {error && (
        <div style={{
          background: 'rgba(160, 32, 32, 0.06)',
          border: '1px solid rgba(160, 32, 32, 0.3)',
          color: '#a02020',
          padding: '0.6rem 0.9rem',
          borderRadius: 4,
          marginBottom: '1rem',
          fontFamily: 'monospace',
          fontSize: '0.84rem',
        }}>
          Opdateringen mislykkedes: {error}
        </div>
      )}

      <ProjectsGrid>
        {filteredProjects.map(project => (
          <ProjectCard
            key={project.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setSelectedProject(project)}
          >
            <ProjectImage
              $imageUrl={project.imageUrl}
              $isSignature={project.isSignature}
            />
            <ProjectContent>
              <ProjectTitle>{project.title}</ProjectTitle>
              <ProjectDescription>{project.description}</ProjectDescription>
              <ProjectMeta>
                <MetaBadge>
                  <FaRobot />
                  {project.category}
                </MetaBadge>
                <MetaBadge>
                  <FaMapMarkerAlt />
                  {project.scope}
                </MetaBadge>
                {project.status && (
                  <StatusBadge $status={project.status}>
                    {project.status === 'I brug' ? <FaCheckCircle /> : <FaClock />}
                    {project.status}
                  </StatusBadge>
                )}
              </ProjectMeta>
            </ProjectContent>
          </ProjectCard>
        ))}
      </ProjectsGrid>

      <AnimatePresence>
        {selectedProject && (
          <Modal
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedProject(null)}
          >
            <ModalContent
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <ModalHeader>
                <div>
                  <ModalTitle>{selectedProject.title}</ModalTitle>
                  {selectedProject.isSignature && (
                    <MetaBadge style={{ marginBottom: '0.5rem' }}>
                      <FaCheckCircle />
                      Signaturprojekt
                    </MetaBadge>
                  )}
                </div>
                <CloseButton onClick={() => setSelectedProject(null)}>
                  <FaTimes />
                </CloseButton>
              </ModalHeader>
              <ModalBody>
                <ModalImage $imageUrl={selectedProject.imageUrl} />
                <ModalDescription>
                  <p>{selectedProject.description}</p>
                </ModalDescription>
                <ModalMetaSection>
                  <MetaItem>
                    <div className="label">Klassifikation</div>
                    <div className="value">{selectedProject.category}</div>
                  </MetaItem>
                  <MetaItem>
                    <div className="label">Udbredelse</div>
                    <div className="value">{selectedProject.scope}</div>
                  </MetaItem>
                  {selectedProject.status && (
                    <MetaItem>
                      <div className="label">Status</div>
                      <div className="value">{selectedProject.status}</div>
                    </MetaItem>
                  )}
                </ModalMetaSection>
                <ExternalLink
                  href={selectedProject.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Læs mere på Offentlig AI
                  <FaExternalLinkAlt />
                </ExternalLink>
              </ModalBody>
            </ModalContent>
          </Modal>
        )}
      </AnimatePresence>
    </PageShell>
  );
};

export default AIProjectsPage;
