import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaArrowRight,
  FaArrowLeft,
  FaCheck,
  FaRobot,
  FaShieldAlt,
  FaBalanceScale,
  FaGraduationCap,
  FaQuestionCircle,
  FaListUl,
  FaInfoCircle,
  FaSpinner,
  FaCheckCircle
} from 'react-icons/fa';
import { FAGOMRAADE_OPTIONS } from '../utils/fagomraadeOptions';

const resolvePhaseStatus = (props) => (props.$completed ? 'healthy' : props.$active ? 'degraded' : 'idle');

const phasePalette = (theme, status) => {
  const palette = theme.colors.status?.[status] || theme.colors.status?.idle;
  if (palette) {
    return palette;
  }
  return {
    background: theme.colors.surfaceAlt,
    border: theme.colors.border,
    text: theme.colors.text,
  };
};

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const Container = styled.div`
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 3rem;
`;

const Title = styled.h1`
  color: ${props => props.theme.colors.gray[800]};
  font-size: 2.5rem;
  margin-bottom: 1rem;
`;

const Subtitle = styled.p`
  color: ${props => props.theme.colors.gray[600]};
  font-size: 1.125rem;
  max-width: 600px;
  margin: 0 auto;
`;

const ProgressBar = styled.div`
  background: ${props => props.theme.colors.gray[200]};
  height: 8px;
  border-radius: 4px;
  margin: 2rem 0;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  background: linear-gradient(90deg, ${props => props.theme.colors.primary}, ${props => props.theme.colors.success});
  height: 100%;
  width: ${props => props.progress}%;
  transition: width 0.3s ease;
`;

const StepContainer = styled(motion.div)`
  background: white;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.lg};
  padding: 3rem;
  margin-bottom: 2rem;
`;

const StepHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
`;

const StepIcon = styled.div`
  background: ${props => props.theme.colors.primary};
  color: white;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 1rem;
  font-size: 1.5rem;
`;

const StepInfo = styled.div`
  flex: 1;
`;

const StepTitle = styled.h2`
  color: ${props => props.theme.colors.gray[800]};
  margin-bottom: 0.5rem;
`;

const StepDescription = styled.p`
  color: ${props => props.theme.colors.gray[600]};
  margin: 0;
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-weight: 600;
  color: ${props => props.theme.colors.gray[700]};
  margin-bottom: 0.5rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid ${props => props.theme.colors.gray[300]};
  border-radius: ${props => props.theme.borderRadius};
  font-size: 1rem;
  transition: border-color 0.2s ease;

  &:focus {
    border-color: ${props => props.theme.colors.primary};
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid ${props => props.theme.colors.gray[300]};
  border-radius: ${props => props.theme.borderRadius};
  font-size: 1rem;
  min-height: 100px;
  resize: vertical;
  transition: border-color 0.2s ease;

  &:focus {
    border-color: ${props => props.theme.colors.primary};
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid ${props => props.theme.colors.gray[300]};
  border-radius: ${props => props.theme.borderRadius};
  font-size: 1rem;
  background: white;
  transition: border-color 0.2s ease;

  &:focus {
    border-color: ${props => props.theme.colors.primary};
  }
`;

const CheckboxGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const CheckboxItem = styled.label`
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 0.75rem;
  background: ${props => props.theme.colors.gray[50]};
  border-radius: ${props => props.theme.borderRadius};
  transition: background-color 0.2s ease;

  &:hover {
    background: ${props => props.theme.colors.gray[100]};
  }
`;

const Checkbox = styled.input`
  margin-right: 0.75rem;
  width: 18px;
  height: 18px;
`;

const NavigationButtons = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 3rem;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  border-radius: ${props => props.theme.borderRadius};
  font-weight: 600;
  font-size: 1rem;
  transition: all 0.2s ease;
  border: none;

  ${props => props.primary ? `
    background: ${props.theme.colors.primary};
    color: white;
    &:hover {
      background: ${props.theme.colors.primaryDark || '#A03612'};
    }
  ` : `
    background: transparent;
    color: ${props.theme.colors.primary};
    border: 2px solid ${props.theme.colors.primary};
    &:hover {
      background: ${props.theme.colors.primary};
      color: white;
    }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ResultsContainer = styled.div`
  background: white;
  border-radius: ${props => props.theme.borderRadius};
  box-shadow: ${props => props.theme.shadows.lg};
  padding: 3rem;
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-top: 2rem;
`;

const PhaseItem = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: ${props => phasePalette(props.theme, resolvePhaseStatus(props)).background};
  border-left: 4px solid ${props => phasePalette(props.theme, resolvePhaseStatus(props)).border};
  border-radius: 8px;
  box-shadow: ${props => props.$active ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'};

  .icon {
    font-size: 1.5rem;
    color: ${props => phasePalette(props.theme, resolvePhaseStatus(props)).border};
    min-width: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .content {
    flex: 1;

    h4 {
      margin: 0 0 0.25rem 0;
      color: ${props => phasePalette(props.theme, resolvePhaseStatus(props)).text};
      font-size: 1rem;
      font-weight: 600;
    }

    p {
      margin: 0;
      color: ${props => phasePalette(props.theme, resolvePhaseStatus(props)).text};
      opacity: 0.85;
      font-size: 0.875rem;
    }
  }
`;

const ProgressBarContainer = styled.div`
  margin: 2rem 0;
`;

const ProgressBarTrack = styled.div`
  background: #e2e8f0;
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
`;

const ProgressBarFill = styled(motion.div)`
  background: linear-gradient(90deg, #C94416 0%, #059669 100%);
  height: 100%;
  border-radius: 6px;
`;

const ProgressText = styled.div`
  text-align: center;
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #64748b;
  font-weight: 500;
`;

const steps = [
  {
    id: 'initial',
    title: 'Systemoplysninger',
    description: 'Grundlæggende information om dit AI-system',
    helpText: 'Start med at give os en detaljeret beskrivelse af dit AI-system. Dette hjælper os med at forstå konteksten og give dig den mest præcise compliance analyse.',
    icon: FaRobot
  },
  {
    id: 'punkt1',
    title: 'Punkt 1: Er det et AI-system?',
    description: 'Undersøg om systemet kvalificeres som et AI-system ifølge EU AI Act',
    helpText: 'EU AI Act definerer et AI-system som software, der kan generere outputs som forudsigelser, anbefalinger eller beslutninger for et givet sæt menneskelige inputs. Dette inkluderer machine learning, logik-baserede systemer og statistiske tilgange.',
    icon: FaQuestionCircle
  },
  {
    id: 'punkt2',
    title: 'Punkt 2: Behandling af personoplysninger',
    description: 'Vurder om AI-systemet behandler personoplysninger',
    helpText: 'Personoplysninger omfatter alle oplysninger, der kan identificere en person direkte eller indirekte. Dette inkluderer navne, email-adresser, IP-adresser, biometriske data og adfærdsmønstre.',
    icon: FaShieldAlt
  },
  {
    id: 'punkt3',
    title: 'Punkt 3: Databeskyttelsesregler',
    description: 'Compliance analyse i forhold til GDPR og dansk lovgivning',
    helpText: 'GDPR stiller strenge krav til behandling af personoplysninger i AI-systemer. Dette inkluderer lovlig grundlag, databeskyttelse by design, og særlige regler for automatiske beslutninger.',
    icon: FaBalanceScale
  },
  {
    id: 'punkt4',
    title: 'Punkt 4: AI-forordningen',
    description: 'Analyse af systemet i forhold til EU AI Act krav',
    icon: FaListUl
  },
  {
    id: 'punkt5',
    title: 'Punkt 5: Medarbejderuddannelse',
    description: 'Analyse af nødvendig uddannelse i AI-færdigheder',
    icon: FaGraduationCap
  },
  {
    id: 'punkt6',
    title: 'Punkt 6: Yderligere ressourcer',
    description: 'Identificering af behov for ekstern hjælp og ressourcer',
    icon: FaQuestionCircle
  },
  {
    id: 'punkt7',
    title: 'Punkt 7: Vejledende krav',
    description: 'Specifikke krav og anbefalinger til dit AI-system',
    icon: FaListUl
  }
];

const FullAssessmentPage = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysisPhases, setAnalysisPhases] = useState([
    { id: 1, title: 'Grundlæggende analyse', description: 'Behandler systemoplysninger og kontekst', completed: false, active: false },
    { id: 2, title: 'Risikoscore beregning', description: 'Beregner risikoscore baseret på 7-punkts vurdering', completed: false, active: false },
    { id: 3, title: 'AI Act & GDPR compliance', description: 'Vurderer EU AI Act risikokategori og GDPR krav', completed: false, active: false },
    { id: 4, title: 'Hard stops & betingelser', description: 'Identificerer kritiske blokeringer og godkendelsesbetingelser', completed: false, active: false },
    { id: 5, title: 'Artefakter & tests', description: 'Genererer liste over nødvendig dokumentation og tests', completed: false, active: false },
    { id: 6, title: 'Beslutningslogik', description: 'Bestemmer endelig GO/BETINGET-GO/NO-GO beslutning', completed: false, active: false },
    { id: 7, title: 'Anbefalinger & næste skridt', description: 'Opretter handlingsplan og intelligente anbefalinger', completed: false, active: false },
  ]);
  const [currentPhase, setCurrentPhase] = useState(0);

  const progress = ((currentStep + 1) / steps.length) * 100;

  // Progressive phase animation effect
  useEffect(() => {
    if (loading && currentPhase < analysisPhases.length) {
      const timer = setTimeout(() => {
        setAnalysisPhases(prev => prev.map((phase, idx) => {
          if (idx === currentPhase) {
            return { ...phase, active: true };
          } else if (idx < currentPhase) {
            return { ...phase, completed: true, active: false };
          }
          return phase;
        }));

        // Move to next phase after marking current as active
        const completeTimer = setTimeout(() => {
          setAnalysisPhases(prev => prev.map((phase, idx) => {
            if (idx === currentPhase) {
              return { ...phase, completed: true, active: false };
            }
            return phase;
          }));
          setCurrentPhase(prev => prev + 1);
        }, 1500); // Each phase takes 1.5 seconds

        return () => clearTimeout(completeTimer);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [loading, currentPhase, analysisPhases.length]);

  const updateFormData = (stepId, data) => {
    setFormData(prev => ({
      ...prev,
      [stepId]: data
    }));
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const submitAssessment = async () => {
    setLoading(true);
    setCurrentPhase(0);
    // Reset phases
    setAnalysisPhases(prev => prev.map(phase => ({ ...phase, completed: false, active: false })));

    try {
      // Transform form data to match backend API structure
      const transformedData = {
        system_navn: formData.initial?.system_navn || '',
        system_beskrivelse: formData.initial?.system_beskrivelse || '',
        organisation: formData.initial?.team
          ? `Kalundborg Kommune - ${formData.initial.team}`
          : 'Kalundborg Kommune',
        kontaktperson: formData.initial?.kontaktperson || '',
        fagomraade: formData.initial?.fagomraade || '',
        sektor: formData.initial?.fagomraade || '',
        team: formData.initial?.team || '',

        // Punkt 1 data
        bruger_ml: formData.punkt1?.bruger_ml === 'ja',
        autonome_beslutninger: formData.punkt1?.autonome_beslutninger === 'ja',
        behandler_data: formData.punkt1?.behandler_data === 'ja',
        system_funktionalitet: formData.punkt1?.system_funktionalitet || '',

        // Punkt 2 data
        personoplysninger: formData.punkt2?.behandler_personoplysninger === 'ja',
        persondata_typer: formData.punkt2?.personoplysninger_typer || [],
        behandlings_formaal: formData.punkt2?.behandlings_formaal || '',
        juridisk_grundlag: formData.punkt2?.juridisk_grundlag || '',

        // Punkt 3 data
        dpia_udfoert: formData.punkt3?.dpia_udfoert === 'ja',
        privacy_by_design: formData.punkt3?.privacy_by_design === 'ja',
        databehandleraftaler: formData.punkt3?.databehandleraftaler === 'ja',
        sikkerhedsforanstaltninger: formData.punkt3?.sikkerhedsforanstaltninger || '',

        // Punkt 4 data
        ai_risiko_kategori: formData.punkt4?.ai_risiko_kategori || '',
        kritiske_formaal: formData.punkt4?.kritiske_formaal === 'ja',
        transparens: formData.punkt4?.transparens === 'ja',
        menneskelig_overvaagning: formData.punkt4?.menneskelig_overvaagning === 'ja',
        anvendelsesomraade: formData.punkt4?.anvendelsesomraade || '',

        // Punkt 5 data
        medarbejder_uddannelse: formData.punkt5?.medarbejder_uddannelse === 'ja',
        rettigheder_ansvar: formData.punkt5?.rettigheder_ansvar === 'ja',
        ansvarlig_person: formData.punkt5?.ansvarlig_person === 'ja',
        uddannelsesbehov: formData.punkt5?.uddannelsesbehov || '',

        // Punkt 6 data
        juridisk_raadgivning: formData.punkt6?.juridisk_raadgivning === 'ja',
        teknisk_ekspertise: formData.punkt6?.teknisk_ekspertise === 'ja',
        certificering_behov: formData.punkt6?.certificering_behov === 'ja',
        stoerste_udfordringer: formData.punkt6?.stoerste_udfordringer || '',

        // Punkt 7 data
        beslutningslogik_dokumentation: formData.punkt7?.beslutningslogik_dokumentation === 'ja',
        bias_testing: formData.punkt7?.bias_testing === 'ja',
        klage_procedurer: formData.punkt7?.klage_procedurer === 'ja',
        yderligere_kommentarer: formData.punkt7?.yderligere_kommentarer || ''
      };

      const response = await fetch('/api/compliance/7-punkts-vurdering', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transformedData),
      });

      if (response.ok) {
        const data = await response.json();

        // Fetch contextual news based on assessment results
        const newsResponse = await fetch(`/api/news/relevant?system=${encodeURIComponent(transformedData.system_navn)}&risk=${data.samlet_vurdering?.risikoniveau}`);
        const contextualNews = newsResponse.ok ? await newsResponse.json() : { nyheder: [] };

        setResults({
          ...data,
          contextual_news: contextualNews.nyheder || []
        });
        nextStep();
      } else {
        throw new Error('Fejl ved indsendelse af vurdering');
      }
    } catch (error) {
      console.error('Fejl:', error);
      alert('Der opstod en fejl ved indsendelse af vurderingen. Prøv igen.');
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    const step = steps[currentStep];

    if (!step) return null;

    switch (step.id) {
      case 'initial':
        return <InitialStep formData={formData.initial || {}} updateFormData={updateFormData} />;
      case 'punkt1':
        return <Punkt1Step formData={formData.punkt1 || {}} updateFormData={updateFormData} />;
      case 'punkt2':
        return <Punkt2Step formData={formData.punkt2 || {}} updateFormData={updateFormData} />;
      case 'punkt3':
        return <Punkt3Step formData={formData.punkt3 || {}} updateFormData={updateFormData} />;
      case 'punkt4':
        return <Punkt4Step formData={formData.punkt4 || {}} updateFormData={updateFormData} />;
      case 'punkt5':
        return <Punkt5Step formData={formData.punkt5 || {}} updateFormData={updateFormData} />;
      case 'punkt6':
        return <Punkt6Step formData={formData.punkt6 || {}} updateFormData={updateFormData} />;
      case 'punkt7':
        return <Punkt7Step formData={formData.punkt7 || {}} updateFormData={updateFormData} />;
      default:
        return null;
    }
  };

  if (results) {
    return (
      <Container>
        <Header>
          <Title>Compliance Control Afsluttet</Title>
          <Subtitle>
            Din compliance kontrol er gennemført. Se beslutning, betingelser og nødvendig dokumentation nedenfor.
          </Subtitle>
        </Header>

        <ResultsContainer>
          {/* Compliance beslutning */}
          <div style={{
            padding: '1.5rem',
            borderRadius: '12px',
            marginBottom: '2rem',
            background: results.compliance_control?.beslutning === 'go' ? '#dcfce7' :
                       results.compliance_control?.beslutning === 'betinget-go' ? '#fef3c7' : '#fee2e2',
            border: `2px solid ${results.compliance_control?.beslutning === 'go' ? '#16a34a' :
                                results.compliance_control?.beslutning === 'betinget-go' ? '#f59e0b' : '#dc2626'}`
          }}>
            <h2 style={{
              margin: '0 0 0.5rem 0',
              color: results.compliance_control?.beslutning === 'go' ? '#14532d' :
                     results.compliance_control?.beslutning === 'betinget-go' ? '#78350f' : '#7f1d1d'
            }}>
              Beslutning: {results.compliance_control?.beslutning === 'go' ? 'GO' :
                          results.compliance_control?.beslutning === 'betinget-go' ? 'BETINGET GO' : 'NO-GO'}
            </h2>
            <p style={{ margin: 0 }}>
              {results.compliance_control?.beslutning_beskrivelse}
            </p>
          </div>

          {/* Risikoscore */}
          <div style={{ marginBottom: '2rem' }}>
            <h3>Risikoscore: {results.compliance_control?.risiko_score || 0}/100</h3>
            <div style={{
              background: '#e5e7eb',
              height: '20px',
              borderRadius: '10px',
              overflow: 'hidden'
            }}>
              <div style={{
                background: results.compliance_control?.risiko_score >= 80 ? '#dc2626' :
                           results.compliance_control?.risiko_score >= 60 ? '#f59e0b' :
                           results.compliance_control?.risiko_score >= 40 ? '#eab308' :
                           results.compliance_control?.risiko_score >= 20 ? '#84cc16' : '#22c55e',
                height: '100%',
                width: `${results.compliance_control?.risiko_score || 0}%`,
                transition: 'width 0.5s ease'
              }} />
            </div>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
              Risikoniveau: {results.compliance_control?.risiko_niveau}
            </p>
          </div>

          {/* Hard stops */}
          {results.compliance_control?.hard_stops && results.compliance_control.hard_stops.length > 0 && (
            <div style={{ background: '#fee2e2', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>
              <h4 style={{ color: '#dc2626', margin: '0 0 0.5rem 0' }}>Kritiske Blokeringer (Hard Stops)</h4>
              <ul style={{ margin: 0 }}>
                {results.compliance_control.hard_stops.map((stop, index) => (
                  <li key={index} style={{ color: '#7f1d1d' }}>{stop}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Betingelser */}
          {results.compliance_control?.betingelser && results.compliance_control.betingelser.length > 0 && (
            <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>
              <h4 style={{ color: '#f59e0b', margin: '0 0 0.5rem 0' }}>Betingelser for Godkendelse</h4>
              <ul style={{ margin: 0 }}>
                {results.compliance_control.betingelser.map((betingelse, index) => (
                  <li key={index} style={{ color: '#78350f' }}>{betingelse}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Nødvendige artefakter */}
          {results.compliance_control?.nødvendige_artefakter && results.compliance_control.nødvendige_artefakter.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h4>Nødvendig Dokumentation ({results.compliance_control.nødvendige_artefakter.length})</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                {results.compliance_control.nødvendige_artefakter.map((artefakt, index) => (
                  <div key={index} style={{
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1rem'
                  }}>
                    <h5 style={{ margin: '0 0 0.5rem 0', color: '#1f2937' }}>{artefakt.navn}</h5>
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                      {artefakt.beskrivelse}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        background: '#f3f4f6',
                        color: '#4b5563'
                      }}>
                        {artefakt.kategori}
                      </span>
                      {artefakt.template_url && (
                        <a href={artefakt.template_url} target="_blank" rel="noopener noreferrer"
                           style={{ color: '#3b82f6', fontSize: '0.875rem' }}>
                          Se skabelon →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nødvendige tests */}
          {results.compliance_control?.nødvendige_tests && results.compliance_control.nødvendige_tests.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h4>Nødvendige Tests ({results.compliance_control.nødvendige_tests.length})</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                {results.compliance_control.nødvendige_tests.map((test, index) => (
                  <div key={index} style={{
                    padding: '0.5rem',
                    background: '#f9fafb',
                    borderRadius: '4px',
                    borderLeft: '3px solid #3b82f6'
                  }}>
                    <span style={{ fontSize: '0.875rem' }}>{test}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Næste skridt */}
          <div style={{ marginBottom: '2rem', background: '#f0fdf4', padding: '1rem', borderRadius: '8px' }}>
            <h4 style={{ color: '#16a34a', margin: '0 0 0.5rem 0' }}>Næste Skridt</h4>
            <ol style={{ margin: 0 }}>
              {results.compliance_control?.næste_skridt?.map((skridt, index) => (
                <li key={index} style={{ color: '#14532d' }}>{skridt}</li>
              )) || <li>Ingen specifikke skridt identificeret</li>}
            </ol>
          </div>

          {results.contextual_news && results.contextual_news.length > 0 && (
            <>
              <h4>Relevante Nyheder for Din Compliance:</h4>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                {results.contextual_news.slice(0, 3).map((nyhed, index) => (
                  <div key={index} style={{ borderBottom: index < 2 ? '1px solid #e2e8f0' : 'none', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                    <h5 style={{ margin: '0 0 0.5rem 0', color: '#2d3748' }}>{nyhed.title}</h5>
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#4a5568' }}>{nyhed.summary}</p>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {nyhed.source} • {new Date(nyhed.published_date).toLocaleDateString('da-DK')}
                      {nyhed.importance && (
                        <span style={{
                          marginLeft: '0.5rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: nyhed.importance === 'high' ? '#fed7d7' : nyhed.importance === 'medium' ? '#feebc8' : '#c6f6d5',
                          color: nyhed.importance === 'high' ? '#c53030' : nyhed.importance === 'medium' ? '#dd6b20' : '#38a169'
                        }}>
                          {nyhed.importance === 'high' ? 'Høj vigtighed' : nyhed.importance === 'medium' ? 'Medium vigtighed' : 'Lav vigtighed'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}


          <Button primary onClick={() => window.location.reload()}>
            Start Ny Analyse
          </Button>
        </ResultsContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>Compliance Control</Title>
        <Subtitle>
          Struktureret compliance kontrol med regelmotor, evidenskatalog og beslutningslogik for AI-systemer.
        </Subtitle>
      </Header>

      <ProgressBar>
        <ProgressFill progress={progress} />
      </ProgressBar>

      {loading && (
        <LoadingContainer>
          <Header>
            <Title>Analyserer dit AI-system</Title>
            <Subtitle>Gennemfører omfattende compliance control vurdering...</Subtitle>
          </Header>

          <ProgressBarContainer>
            <ProgressBarTrack>
              <ProgressBarFill
                initial={{ width: '0%' }}
                animate={{ width: `${(currentPhase / analysisPhases.length) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </ProgressBarTrack>
            <ProgressText>
              {currentPhase} af {analysisPhases.length} faser gennemført
            </ProgressText>
          </ProgressBarContainer>

          {/* Only show the currently active phase */}
          {analysisPhases.map((phase, index) => {
            if (phase.active || (phase.completed && index === currentPhase - 1)) {
              return (
                <PhaseItem
                  key={phase.id}
                  $completed={phase.completed}
                  $active={phase.active}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="icon">
                    {phase.completed ? (
                      <FaCheckCircle />
                    ) : (
                      <FaSpinner style={{ animation: `${spin} 1s linear infinite` }} />
                    )}
                  </div>
                  <div className="content">
                    <h4>{phase.title}</h4>
                    <p>{phase.description}</p>
                  </div>
                </PhaseItem>
              );
            }
            return null;
          })}

          {/* Summary of completed phases */}
          {currentPhase > 0 && (
            <div style={{
              textAlign: 'center',
              padding: '1rem',
              color: '#64748b',
              fontSize: '0.875rem'
            }}>
              ✓ {currentPhase} {currentPhase === 1 ? 'fase' : 'faser'} gennemført
            </div>
          )}
        </LoadingContainer>
      )}

      {!loading && (
        <AnimatePresence mode="wait">
          <StepContainer
            key={currentStep}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
          >
            <StepHeader>
              <StepIcon>
                {React.createElement(steps[currentStep].icon)}
              </StepIcon>
              <StepInfo>
                <StepTitle>
                  {steps[currentStep].title}
                {steps[currentStep].helpText && (
                  <>
                    <FaInfoCircle
                      data-tooltip-id="step-help"
                      data-tooltip-content={steps[currentStep].helpText}
                      style={{
                        marginLeft: '8px',
                        color: '#1a365d',
                        cursor: 'help',
                        fontSize: '0.875rem'
                      }}
                    />
                  </>
                )}
              </StepTitle>
              <StepDescription>{steps[currentStep].description}</StepDescription>
            </StepInfo>
          </StepHeader>

          {renderStepContent()}

          <NavigationButtons>
            <Button onClick={prevStep} disabled={currentStep === 0}>
              <FaArrowLeft /> Forrige
            </Button>

            <div>
              {currentStep + 1} af {steps.length}
            </div>

            {currentStep === steps.length - 1 ? (
              <Button primary onClick={submitAssessment} disabled={loading}>
                {loading ? 'Behandler...' : 'Gennemfør Analyse'} <FaCheck />
              </Button>
            ) : (
              <Button primary onClick={nextStep}>
                Næste <FaArrowRight />
              </Button>
            )}
          </NavigationButtons>
          </StepContainer>
        </AnimatePresence>
      )}
    </Container>
  );
};

// Step Components
const InitialStep = ({ formData, updateFormData }) => {
  const handleChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    updateFormData('initial', newData);
  };

  return (
    <div>
      <FormGroup>
        <Label>System Navn *</Label>
        <Input
          type="text"
          value={formData.system_navn || ''}
          onChange={(e) => handleChange('system_navn', e.target.value)}
          placeholder="F.eks. SmartRecruit AI"
        />
      </FormGroup>

      <FormGroup>
        <Label>System Beskrivelse *</Label>
        <TextArea
          value={formData.system_beskrivelse || ''}
          onChange={(e) => handleChange('system_beskrivelse', e.target.value)}
          placeholder="Beskriv hvad dit AI-system gør, hvordan det fungerer, og hvilke data det bruger"
        />
      </FormGroup>

      <FormGroup>
        <Label>Team *</Label>
        <Input
          type="text"
          value={formData.team || ''}
          onChange={(e) => handleChange('team', e.target.value)}
          placeholder="Teamnavn"
        />
      </FormGroup>

      <FormGroup>
        <Label>Fagområde *</Label>
        <Select
          value={formData.fagomraade || ''}
          onChange={(e) => handleChange('fagomraade', e.target.value)}
        >
          <option value="">Vælg fagområde...</option>
          {FAGOMRAADE_OPTIONS.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Kontaktperson *</Label>
        <Input
          type="text"
          value={formData.kontaktperson || ''}
          onChange={(e) => handleChange('kontaktperson', e.target.value)}
          placeholder="Navn på ansvarlig person"
        />
      </FormGroup>
    </div>
  );
};

const Punkt1Step = ({ formData, updateFormData }) => {
  const handleChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    updateFormData('punkt1', newData);
  };

  return (
    <div>
      <FormGroup>
        <Label>Bruger systemet machine learning, deep learning eller AI algoritmer?</Label>
        <Select
          value={formData.bruger_ml || ''}
          onChange={(e) => handleChange('bruger_ml', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="nej">Nej</option>
          <option value="ved_ikke">Ved ikke</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Kan systemet træffe autonome beslutninger?</Label>
        <Select
          value={formData.autonome_beslutninger || ''}
          onChange={(e) => handleChange('autonome_beslutninger', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="nej">Nej</option>
          <option value="delvist">Delvist</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Behandler systemet data for at generere output eller forudsigelser?</Label>
        <Select
          value={formData.behandler_data || ''}
          onChange={(e) => handleChange('behandler_data', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="nej">Nej</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Beskriv systemets funktionalitet</Label>
        <TextArea
          value={formData.system_funktionalitet || ''}
          onChange={(e) => handleChange('system_funktionalitet', e.target.value)}
          placeholder="Uddyb hvordan systemet fungerer og hvilke opgaver det løser"
        />
      </FormGroup>
    </div>
  );
};

const Punkt2Step = ({ formData, updateFormData }) => {
  const handleChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    updateFormData('punkt2', newData);
  };

  const handleCheckboxChange = (field, values, value, checked) => {
    let newValues = [...values];
    if (checked) {
      newValues.push(value);
    } else {
      newValues = newValues.filter(v => v !== value);
    }
    handleChange(field, newValues);
  };

  const dataTypes = formData.personoplysninger_typer || [];

  return (
    <div>
      <FormGroup>
        <Label>Behandler systemet personoplysninger?</Label>
        <Select
          value={formData.behandler_personoplysninger || ''}
          onChange={(e) => handleChange('behandler_personoplysninger', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="nej">Nej</option>
          <option value="ved_ikke">Ved ikke</option>
        </Select>
      </FormGroup>

      {formData.behandler_personoplysninger === 'ja' && (
        <>
          <FormGroup>
            <Label>Hvilke typer personoplysninger behandles?</Label>
            <CheckboxGroup>
              {[
                'Navn og kontaktoplysninger',
                'CPR-nummer eller anden ID',
                'Beskæftigelsesdata',
                'Uddannelsesdata',
                'Finansielle data',
                'Sundhedsdata',
                'Biometriske data',
                'Særlige kategorier (race, religion, etc.)',
                'Andet'
              ].map(type => (
                <CheckboxItem key={type}>
                  <Checkbox
                    type="checkbox"
                    checked={dataTypes.includes(type)}
                    onChange={(e) => handleCheckboxChange('personoplysninger_typer', dataTypes, type, e.target.checked)}
                  />
                  {type}
                </CheckboxItem>
              ))}
            </CheckboxGroup>
          </FormGroup>

          <FormGroup>
            <Label>Hvad er formålet med behandlingen?</Label>
            <TextArea
              value={formData.behandlings_formaal || ''}
              onChange={(e) => handleChange('behandlings_formaal', e.target.value)}
              placeholder="Beskriv hvorfor personoplysningerne behandles"
            />
          </FormGroup>

          <FormGroup>
            <Label>Hvad er det juridiske grundlag for behandlingen?</Label>
            <Select
              value={formData.juridisk_grundlag || ''}
              onChange={(e) => handleChange('juridisk_grundlag', e.target.value)}
            >
              <option value="">Vælg...</option>
              <option value="samtykke">Samtykke (art. 6(1)(a))</option>
              <option value="kontrakt">Kontraktopfyldelse (art. 6(1)(b))</option>
              <option value="retlig_forpligtelse">Retlig forpligtelse (art. 6(1)(c))</option>
              <option value="vital_interesse">Vital interesse (art. 6(1)(d))</option>
              <option value="offentlig_opgave">Offentlig opgave (art. 6(1)(e))</option>
              <option value="legitim_interesse">Legitim interesse (art. 6(1)(f))</option>
              <option value="ved_ikke">Ved ikke</option>
            </Select>
          </FormGroup>
        </>
      )}
    </div>
  );
};

const Punkt3Step = ({ formData, updateFormData }) => {
  const handleChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    updateFormData('punkt3', newData);
  };

  return (
    <div>
      <FormGroup>
        <Label>Er der udført en DPIA (databeskyttelseskonsekvensanalyse)?</Label>
        <Select
          value={formData.dpia_udfoert || ''}
          onChange={(e) => handleChange('dpia_udfoert', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="nej">Nej</option>
          <option value="paakraevet">På vej/påkrævet</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Har I implementeret privacy by design principper?</Label>
        <Select
          value={formData.privacy_by_design || ''}
          onChange={(e) => handleChange('privacy_by_design', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="delvist">Delvist</option>
          <option value="nej">Nej</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Er der indgået databehandleraftaler med tredjeparter?</Label>
        <Select
          value={formData.databehandleraftaler || ''}
          onChange={(e) => handleChange('databehandleraftaler', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="nej">Nej</option>
          <option value="ikke_relevant">Ikke relevant</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Har I implementeret tekniske og organisatoriske sikkerhedsforanstaltninger?</Label>
        <TextArea
          value={formData.sikkerhedsforanstaltninger || ''}
          onChange={(e) => handleChange('sikkerhedsforanstaltninger', e.target.value)}
          placeholder="Beskriv hvilke sikkerhedsforanstaltninger der er implementeret"
        />
      </FormGroup>
    </div>
  );
};

const Punkt4Step = ({ formData, updateFormData }) => {
  const handleChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    updateFormData('punkt4', newData);
  };

  return (
    <div>
      <FormGroup>
        <Label>Hvilken risikokategori tilhører jeres AI-system?</Label>
        <Select
          value={formData.ai_risiko_kategori || ''}
          onChange={(e) => handleChange('ai_risiko_kategori', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="minimal">Minimal risiko</option>
          <option value="limited">Begrænset risiko</option>
          <option value="high">Høj risiko</option>
          <option value="unacceptable">Uacceptabel risiko</option>
          <option value="ved_ikke">Ved ikke</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Bruges systemet til kritiske formål? (f.eks. rekruttering, kreditanalyse, medicin)</Label>
        <Select
          value={formData.kritiske_formaal || ''}
          onChange={(e) => handleChange('kritiske_formaal', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="nej">Nej</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Er systemet transparent og forklarligt for brugerne?</Label>
        <Select
          value={formData.transparens || ''}
          onChange={(e) => handleChange('transparens', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="delvist">Delvist</option>
          <option value="nej">Nej</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Er der implementeret menneskelig overvågning og kontrol?</Label>
        <Select
          value={formData.menneskelig_overvaagning || ''}
          onChange={(e) => handleChange('menneskelig_overvaagning', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="delvist">Delvist</option>
          <option value="nej">Nej</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Beskriv AI-systemets anvendelsesområde</Label>
        <TextArea
          value={formData.anvendelsesomraade || ''}
          onChange={(e) => handleChange('anvendelsesomraade', e.target.value)}
          placeholder="Uddyb hvor og hvordan AI-systemet anvendes"
        />
      </FormGroup>
    </div>
  );
};

const Punkt5Step = ({ formData, updateFormData }) => {
  const handleChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    updateFormData('punkt5', newData);
  };

  return (
    <div>
      <FormGroup>
        <Label>Har medarbejderne fået uddannelse i AI og automatiserede beslutninger?</Label>
        <Select
          value={formData.medarbejder_uddannelse || ''}
          onChange={(e) => handleChange('medarbejder_uddannelse', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="delvist">Delvist</option>
          <option value="nej">Nej</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Kender medarbejderne deres rettigheder og ansvar omkring AI-systemet?</Label>
        <Select
          value={formData.rettigheder_ansvar || ''}
          onChange={(e) => handleChange('rettigheder_ansvar', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="delvist">Delvist</option>
          <option value="nej">Nej</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Er der udpeget en ansvarlig person for AI-systemet?</Label>
        <Select
          value={formData.ansvarlig_person || ''}
          onChange={(e) => handleChange('ansvarlig_person', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="nej">Nej</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Beskriv nuværende uddannelsesbehov</Label>
        <TextArea
          value={formData.uddannelsesbehov || ''}
          onChange={(e) => handleChange('uddannelsesbehov', e.target.value)}
          placeholder="Hvilke kompetencer mangler medarbejderne?"
        />
      </FormGroup>
    </div>
  );
};

const Punkt6Step = ({ formData, updateFormData }) => {
  const handleChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    updateFormData('punkt6', newData);
  };

  return (
    <div>
      <FormGroup>
        <Label>Har I brug for ekstern juridisk rådgivning?</Label>
        <Select
          value={formData.juridisk_raadgivning || ''}
          onChange={(e) => handleChange('juridisk_raadgivning', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="nej">Nej</option>
          <option value="ved_ikke">Ved ikke</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Mangler I teknisk ekspertise til compliance implementation?</Label>
        <Select
          value={formData.teknisk_ekspertise || ''}
          onChange={(e) => handleChange('teknisk_ekspertise', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="nej">Nej</option>
          <option value="delvist">Delvist</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Har I behov for certificering eller auditering?</Label>
        <Select
          value={formData.certificering_behov || ''}
          onChange={(e) => handleChange('certificering_behov', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="nej">Nej</option>
          <option value="ved_ikke">Ved ikke</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Beskriv jeres største udfordringer</Label>
        <TextArea
          value={formData.stoerste_udfordringer || ''}
          onChange={(e) => handleChange('stoerste_udfordringer', e.target.value)}
          placeholder="Hvad er de største forhindringer for compliance?"
        />
      </FormGroup>
    </div>
  );
};

const Punkt7Step = ({ formData, updateFormData }) => {
  const handleChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    updateFormData('punkt7', newData);
  };

  return (
    <div>
      <FormGroup>
        <Label>Er der dokumentation for AI-systemets beslutningslogik?</Label>
        <Select
          value={formData.beslutningslogik_dokumentation || ''}
          onChange={(e) => handleChange('beslutningslogik_dokumentation', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="delvist">Delvist</option>
          <option value="nej">Nej</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Er der implementeret bias testing og monitoring?</Label>
        <Select
          value={formData.bias_testing || ''}
          onChange={(e) => handleChange('bias_testing', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="delvist">Delvist</option>
          <option value="nej">Nej</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Har I procedurer for klager og appel?</Label>
        <Select
          value={formData.klage_procedurer || ''}
          onChange={(e) => handleChange('klage_procedurer', e.target.value)}
        >
          <option value="">Vælg...</option>
          <option value="ja">Ja</option>
          <option value="nej">Nej</option>
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>Yderligere kommentarer eller særlige forhold</Label>
        <TextArea
          value={formData.yderligere_kommentarer || ''}
          onChange={(e) => handleChange('yderligere_kommentarer', e.target.value)}
          placeholder="Andre relevante oplysninger om jeres AI-system"
        />
      </FormGroup>
    </div>
  );
};

export default FullAssessmentPage;
