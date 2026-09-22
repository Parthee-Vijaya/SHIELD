import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  FaSearch,
  FaSpinner,
  FaExternalLinkAlt,
  FaGavel,
  FaChevronDown,
  FaChevronUp,
  FaCheckCircle,
  FaBook
} from 'react-icons/fa';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { readJsonEventStream } from '../utils/readJsonEventStream';
import { modelLabel } from '../utils/modelPresentation';
import { lawSourceText } from '../utils/lawSourcePresentation';
import {
  PageShell,
  PageHeader,
  PrimaryButton,
} from '../components/page-chrome/PageChrome';

const SearchCard = styled.div`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  padding: 1.75rem;
  margin-bottom: 2rem;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 0.85rem 1rem 0.85rem 2.75rem;
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1rem;
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
`;

const SearchInputWrapper = styled.div`
  position: relative;
  margin-bottom: 1.25rem;

  .search-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: ${(p) => p.theme.colors.textMuted};
    font-size: 0.9rem;
  }
`;

const CategorySelect = styled.select`
  padding: 0.7rem 0.9rem;
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  background: ${(p) => p.theme.colors.surface};
  color: ${(p) => p.theme.colors.text};
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.92rem;
  cursor: pointer;
  margin-bottom: 1.25rem;
  width: 100%;

  &:focus {
    border-color: ${(p) => p.theme.colors.primary};
    outline: none;
  }
`;

const SearchButton = styled(PrimaryButton)`
  width: 100%;
  justify-content: center;
  padding: 12px 20px;
`;

const AnswerCard = styled(motion.div)`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-left: 3px solid ${(p) => p.theme.colors.primary};
  border-radius: ${(p) => p.theme.borderRadius};
  padding: 1.75rem;
  margin-bottom: 2rem;

  h3 {
    font-family: ${(p) => p.theme.fonts.display};
    font-size: 1.3rem;
    font-weight: 600;
    color: ${(p) => p.theme.colors.text};
    margin: 0 0 1rem 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    .icon {
      color: ${(p) => p.theme.colors.primary};
      font-size: 1rem;
    }
  }
`;

const AnswerText = styled.div`
  font-family: ${(p) => p.theme.fonts.body};
  color: ${(p) => p.theme.colors.text};
  line-height: 1.7;
  font-size: 1.05rem;
  margin-bottom: 1.5rem;

  p { margin-bottom: 1rem; }

  strong {
    color: ${(p) => p.theme.colors.text};
    font-weight: 600;
  }

  .cursor {
    display: inline-block;
    margin-left: 2px;
    animation: blink 1.1s steps(2, start) infinite;
    color: ${(p) => p.theme.colors?.primary || '#0d2e54'};
    font-weight: 700;
  }

  @keyframes blink {
    50% { opacity: 0; }
  }
`;

const KeyPointsList = styled.ul`
  list-style: none;
  padding: 0;
  margin-top: 1.5rem;

  li {
    font-family: ${(p) => p.theme.fonts.body};
    padding: 0.85rem 1rem;
    margin-bottom: 0.5rem;
    background: ${(p) => p.theme.colors.surfaceAlt};
    border-left: 2px solid ${(p) => p.theme.colors.primary};
    border-radius: 4px;
    color: ${(p) => p.theme.colors.text};
    line-height: 1.55;
  }
`;

const SourcesCard = styled.div`
  background: ${(p) => p.theme.colors.surface};
  border: 1px solid ${(p) => p.theme.colors.border};
  border-radius: ${(p) => p.theme.borderRadius};
  padding: 1.75rem;
  margin-bottom: 2rem;

  h3 {
    font-family: ${(p) => p.theme.fonts.display};
    font-size: 1.3rem;
    font-weight: 600;
    color: ${(p) => p.theme.colors.text};
    margin: 0 0 1.25rem 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
`;

const SourceItem = styled.div`
  padding: 1.1rem;
  margin-bottom: 0.8rem;
  background: ${(p) => p.theme.colors.surfaceAlt};
  border-radius: ${(p) => p.theme.borderRadius};
  border: 1px solid ${(p) => p.theme.colors.borderSoft};
  cursor: pointer;
  transition: ${(p) => p.theme.animations.transitionFast};

  &:hover {
    border-color: ${(p) => p.theme.colors.primary};
    background: ${(p) => p.theme.colors.surface};
  }

  .law-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 1rem;
  }

  .law-title {
    font-family: ${(p) => p.theme.fonts.display};
    font-weight: 600;
    font-size: 1.05rem;
    color: ${(p) => p.theme.colors.text};
    margin-bottom: 0.4rem;
  }

  .law-summary {
    font-family: ${(p) => p.theme.fonts.body};
    color: ${(p) => p.theme.colors.text};
    font-size: 0.92rem;
    line-height: 1.55;
    margin-top: 0.4rem;
  }

  .law-link {
    font-family: ${(p) => p.theme.fonts.sans};
    color: ${(p) => p.theme.colors.primary};
    text-decoration: none;
    font-size: 0.82rem;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.75rem;

    &:hover { text-decoration: underline; }
  }

  .expand-icon {
    color: ${(p) => p.theme.colors.textMuted};
    transition: transform 0.2s ease;
    transform: ${(p) => (p.expanded ? 'rotate(180deg)' : 'rotate(0deg)')};
  }

  .law-content {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid ${(p) => p.theme.colors.borderSoft};
    font-family: ${(p) => p.theme.fonts.body};
    color: ${(p) => p.theme.colors.text};
    font-size: 0.94rem;
    line-height: 1.7;
  }
`;

const ExampleQueries = styled.div`
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;

  .label {
    font-family: ${(p) => p.theme.fonts.sans};
    color: ${(p) => p.theme.colors.textMuted};
    font-size: 0.78rem;
    letter-spacing: 0.04em;
    margin-right: 4px;
  }

  button {
    font-family: ${(p) => p.theme.fonts.sans};
    background: transparent;
    color: ${(p) => p.theme.colors.textMuted};
    border: 1px solid ${(p) => p.theme.colors.border};
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 0.78rem;
    cursor: pointer;
    transition: ${(p) => p.theme.animations.transitionFast};

    &:hover {
      border-color: ${(p) => p.theme.colors.primary};
      color: ${(p) => p.theme.colors.primary};
    }
  }
`;

const LoadingSpinner = styled(FaSpinner)`
  animation: spin 1s linear infinite;

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

// ============ MAIN COMPONENT ============

const LawAssistantPage = () => {
  const { authFetch } = useAuth();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | retrieving | streaming | done | error
  const [result, setResult] = useState(null); // {answer, key_points, citations, follow_up_questions, sources, retrieval, provider}
  const [categories, setCategories] = useState([]);
  const [streamError, setStreamError] = useState('');
  const [expandedSources, setExpandedSources] = useState(new Set());
  const abortRef = useRef(null);

  // Load categories on mount
  useEffect(() => {
    loadCategories();
    return () => { const current = abortRef.current; abortRef.current = null; current?.abort(); };
  }, []);

  const loadCategories = async () => {
    try {
      const response = await axios.get('/api/law/categories');
      if (response.data.success) {
        setCategories(response.data.categories);
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const isLoading = phase === 'retrieving' || phase === 'streaming';

  const runQuery = async (rawQuery) => {
    const q = (rawQuery ?? query).trim();
    if (!q || q.length < 3) {
      toast.error('Indtast venligst mindst 3 tegn');
      return;
    }

    // Cancel any in-flight stream
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStreamError('');
    setPhase('retrieving');
    setResult({
      answer: '',
      key_points: [],
      citations: [],
      follow_up_questions: [],
      sources: [],
      retrieval: null,
      provider: null,
      query: q,
    });

    try {
      const response = await authFetch('/api/law/ask/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          query: q,
          category: selectedCategory || null,
          mode: 'auto',
        }),
        signal: controller.signal,
      });

      let completed = false;
      await readJsonEventStream(response, {
        signal: controller.signal,
        invalidMessage: 'Svartjenesten returnerede et ugyldigt svar. Prøv igen.',
        onEvent: event => {
          if (abortRef.current !== controller || controller.signal.aborted) return false;
          if (event.event === 'error') throw new Error(event.message || 'Svartjenesten kunne ikke fuldføre svaret.');
          handleStreamEvent(event);
          if (event.event === 'final') { completed = true; return false; }
        },
      });
      if (!completed && !controller.signal.aborted) throw new Error('Forbindelsen blev afbrudt, før svaret var færdigt. Prøv igen.');
      if (abortRef.current === controller && !controller.signal.aborted) setPhase('done');
    } catch (error) {
      if (error.name === 'AbortError' || abortRef.current !== controller) return;
      setPhase('error');
      setStreamError(error.message || 'Svaret kunne ikke færdiggøres. Prøv igen.');
    } finally {
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const stopAnswer = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('error');
    setStreamError('Du stoppede svaret. Start en ny forespørgsel for at få et færdigt svar.');
  };

  const handleStreamEvent = (event) => {
    if (!event || !event.event) return;
    setResult((prev) => {
      if (!prev) return prev;
      switch (event.event) {
        case 'retrieval':
          return {
            ...prev,
            sources: event.sources || [],
            retrieval: event.retrieval || null,
          };
        case 'delta':
          return { ...prev, answer: (prev.answer || '') + (event.text || '') };
        case 'final':
          return {
            ...prev,
            answer: event.answer || prev.answer,
            confidence: event.confidence,
            key_points: event.key_points || [],
            citations: event.citations || [],
            follow_up_questions: event.follow_up_questions || [],
            provider: event.provider,
            model: event.model,
          };
        default:
          return prev;
      }
    });
    if (event.event === 'retrieval') setPhase('streaming');
    if (event.event === 'final') setPhase('done');
  };

  const handleSearch = (e) => {
    e?.preventDefault();
    runQuery();
  };

  const toggleSourceExpansion = (slug) => {
    const newExpanded = new Set(expandedSources);
    if (newExpanded.has(slug)) {
      newExpanded.delete(slug);
    } else {
      newExpanded.add(slug);
    }
    setExpandedSources(newExpanded);
  };

  const exampleQueries = [
    'Skal jeg give partshøring i en social-sag før afgørelse?',
    'Må jeg dele helbredsoplysninger med en privat aktør?',
    'Hvornår er en automatiseret afgørelse i strid med GDPR?',
    'Hvad står der i grundloven om ytringsfrihed?'
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow="S.H.I.E.L.D. · lov-assistent"
        title="Spørg til lovgivning"
        lede="Stil spørgsmål til det indlæste lovindeks, og få et AI-udkast med kilder til faglig kontrol. Et svar er ikke juridisk rådgivning eller en godkendelse og gemmes ikke automatisk på en sag."
      />

      {/* Search Card */}
      <SearchCard>
        <form onSubmit={handleSearch}>
          <SearchInputWrapper>
            <FaSearch className="search-icon" />
            <SearchInput
              type="text"
              aria-label="Juridisk spørgsmål"
              placeholder="Stil et juridisk spørgsmål, fx 'Hvad siger ferieloven om feriepenge?'"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isLoading}
            />
          </SearchInputWrapper>

          <CategorySelect
            aria-label="Lovkategori"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Alle kategorier</option>
            {categories.map(cat => (
              <option key={cat.slug} value={cat.slug}>
                {cat.name.replace('Se alle love i', '')}
              </option>
            ))}
          </CategorySelect>

          <SearchButton type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <LoadingSpinner />
                Genererer svar...
              </>
            ) : (
              <>
                <FaSearch />
                Søg svar
              </>
            )}
          </SearchButton>
          {isLoading && <PrimaryButton $secondary type="button" onClick={stopAnswer}>Stop svar</PrimaryButton>}
        </form>

        {!result && (
          <ExampleQueries>
            <span className="label">Eksempler:</span>
            {exampleQueries.map((example, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setQuery(example);
                }}
                type="button"
              >
                {example}
              </button>
            ))}
          </ExampleQueries>
        )}
      </SearchCard>

      {/* AI Answer Section */}
      <AnimatePresence>
        {result && (
          <AnswerCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <h3>
              {phase === 'done' && <FaCheckCircle className="icon" />}
              {phase === 'error' ? 'Svaret kunne ikke færdiggøres' : 'AI-genereret svar'}
              {phase === 'retrieving' && (
                <span style={{ marginLeft: '0.7rem', fontSize: '0.8rem', fontWeight: 400, opacity: 0.7 }}>
                  · Søger i love…
                </span>
              )}
              {phase === 'streaming' && (
                <span style={{ marginLeft: '0.7rem', fontSize: '0.8rem', fontWeight: 400, opacity: 0.7 }}>
                  · Genererer svar…
                </span>
              )}
            </h3>

            {result.retrieval && (
              <div style={{
                fontFamily: 'monospace',
                fontSize: '0.72rem',
                opacity: 0.75,
                marginBottom: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {result.retrieval.mode === 'rag' ? 'Semantisk søgning' : 'Keyword-søgning'}
                {result.retrieval.matched_chunks && ` · ${result.retrieval.matched_chunks} passager → ${result.retrieval.matched_laws} love`}
                {result.model && ` · ${modelLabel(result.model)}`}
              </div>
            )}

            {Array.isArray(result.retrieval?.warnings) && result.retrieval.warnings.length > 0 && <aside aria-label="Forbehold for lovkilderne"><h4>Forbehold for kildegrundlaget</h4><ul>{result.retrieval.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside>}

            {streamError && <p role="alert">{streamError} Eventuel tekst nedenfor er ufuldstændig og må ikke bruges som et færdigt svar.</p>}
            <AnswerText style={{ whiteSpace: 'pre-wrap' }}>
              {result.answer || ''}{phase === 'streaming' && <span className="cursor" aria-hidden="true">▍</span>}
            </AnswerText>

            {result.key_points && result.key_points.length > 0 && (
              <>
                <h4>Nøglepunkter</h4>
                <KeyPointsList>
                  {result.key_points.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </KeyPointsList>
              </>
            )}

            {result.follow_up_questions && result.follow_up_questions.length > 0 && (
              <>
                <h4 style={{ marginTop: '1.5rem' }}>Foreslåede opfølgninger</h4>
                <ExampleQueries>
                  {result.follow_up_questions.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setQuery(q);
                        runQuery(q);
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </ExampleQueries>
              </>
            )}
          </AnswerCard>
        )}
      </AnimatePresence>

      {/* Sources Section */}
      <AnimatePresence>
        {result && result.sources && result.sources.length > 0 && (
          <SourcesCard
            as={motion.div}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <h3>
              <FaBook />
              Kilder ({result.sources.length})
            </h3>

            {result.sources.map((source, sourceIdx) => {
              const isExpanded = expandedSources.has(source.slug);
              const lawNumber = source.law_number || source.lawNumber;
              const passages = source.passages || [];
              const summary = lawSourceText(source.summary);
              return (
                <SourceItem
                  key={source.slug || sourceIdx}
                  expanded={isExpanded}
                  onClick={() => toggleSourceExpansion(source.slug)}
                >
                  <div className="law-header">
                    <div style={{ flex: 1 }}>
                      <div className="law-title">
                        [{sourceIdx + 1}] {source.title}
                        {typeof source.best_similarity === 'number' && (
                          <span style={{
                            marginLeft: '0.6rem',
                            fontFamily: 'monospace',
                            fontSize: '0.74rem',
                            color: '#888',
                            fontWeight: 400,
                          }}>
                            sim {source.best_similarity.toFixed(2)} · {source.passage_count || 1} passager
                          </span>
                        )}
                      </div>
                      {lawNumber && (
                        <div style={{ fontSize: '0.85rem', color: 'gray', marginBottom: '0.5rem' }}>
                          {lawNumber}
                        </div>
                      )}
                      {summary && (
                        <div className="law-summary">{summary}</div>
                      )}
                    </div>
                    <div className="expand-icon">
                      {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                    </div>
                  </div>

                  {isExpanded && passages.length > 0 && (
                    <div className="law-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                      {passages.map((p, idx) => (
                        <div key={idx} style={{
                          borderLeft: '3px solid #ddd',
                          padding: '0.4rem 0.8rem',
                          background: 'rgba(0,0,0,0.02)',
                          borderRadius: '0 4px 4px 0',
                        }}>
                          <div style={{
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                            opacity: 0.6,
                            marginBottom: '0.3rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}>
                            Passage #{p.chunk_index} · sim {typeof p.similarity === 'number' ? p.similarity.toFixed(2) : '—'}
                          </div>
                          <div>{lawSourceText(p.text)}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {isExpanded && passages.length === 0 && source.content && (
                    <div className="law-content">{lawSourceText(source.content)}</div>
                  )}

                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="law-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FaExternalLinkAlt />
                      Åbn på regelrytter.dk
                    </a>
                  )}
                </SourceItem>
              );
            })}
          </SourcesCard>
        )}
      </AnimatePresence>
    </PageShell>
  );
};

export default LawAssistantPage;
