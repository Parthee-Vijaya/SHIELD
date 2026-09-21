import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

import BRAND from '../config/brand';
import { Page, PageHeader, Eyebrow, Title, Lede, Section, SectionHeader, Button, SecondaryButton } from '../components/workflow/WorkflowUi';

const Content = styled(Page)`
  max-width: 1160px;
  overflow-wrap: anywhere;
`;

const Intro = styled.div`
  max-width: 820px;
  h1 { max-width: 780px; }
`;

const JumpLinks = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 12px 26px;
  margin-top: 24px;
  a { font-size: 0.86rem; text-decoration: underline; text-underline-offset: 4px; }
`;

const ReadingSection = styled(Section)`
  padding: 38px 0;
  scroll-margin-top: 100px;
  p { line-height: 1.7; }
`;

const Steps = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid ${p => p.theme.colors.border};
  @media (max-width: 640px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const StepButton = styled.button`
  min-width: 0;
  min-height: 86px;
  padding: 16px;
  text-align: left;
  color: ${p => p.theme.colors.text};
  background: ${p => p.$active ? p.theme.colors.primarySoft : p.theme.colors.surface};
  box-shadow: ${p => p.$active ? `inset 0 -3px ${p.theme.colors.primary}` : 'none'};
  border-right: 1px solid ${p => p.theme.colors.border};
  &:last-child { border-right: 0; }
  &:hover { background: ${p => p.theme.colors.surfaceAlt}; }
  span { display: block; margin-bottom: 7px; color: ${p => p.theme.colors.textMuted}; font: 500 0.7rem/1.2 ${p => p.theme.fonts.mono}; }
  strong { font-size: 0.9rem; }
  @media (max-width: 640px) {
    &:nth-child(2) { border-right: 0; }
    &:nth-child(-n + 2) { border-bottom: 1px solid ${p => p.theme.colors.border}; }
  }
`;

const Example = styled.div`
  padding: clamp(20px, 4vw, 36px);
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.border};
  border-top: 0;
  h3 { margin: 8px 0 12px; font-size: 1.4rem; scroll-margin-top: 110px; }
  p { max-width: 760px; color: ${p => p.theme.colors.textMuted}; }
  blockquote {
    margin: 22px 0;
    padding: 16px 20px;
    border-left: 3px solid ${p => p.theme.colors.primary};
    background: ${p => p.theme.colors.surfaceAlt};
    max-width: 760px;
    p { color: ${p => p.theme.colors.text}; }
  }
  .example-label { color: ${p => p.theme.colors.textMuted}; font: 500 0.7rem/1.5 ${p => p.theme.fonts.mono}; }
  .outcome { color: ${p => p.theme.colors.text}; }
`;

const ExampleActions = styled.div`
  margin-top: 24px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  small { margin-right: auto; color: ${p => p.theme.colors.textMuted}; }
`;

const RoleRow = styled.div`
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 24px;
  padding: 28px 0;
  border-top: 1px solid ${p => p.theme.colors.borderSoft};
  h3 { font-size: 1.2rem; margin-bottom: 8px; }
  .role-description { font-size: 0.85rem; color: ${p => p.theme.colors.textMuted}; }
  .body > p + p { margin-top: 12px; }
  ul { padding-left: 20px; margin-top: 12px; }
  li { padding: 4px 0; line-height: 1.6; }
  @media (max-width: 640px) { grid-template-columns: 1fr; gap: 12px; }
`;

const Note = styled.div`
  padding: 20px 24px;
  background: ${p => p.theme.colors.primarySoft};
  p + p { margin-top: 8px; }
`;

const Details = styled.details`
  border-top: 1px solid ${p => p.theme.colors.border};
  padding: 18px 0;
  summary { cursor: pointer; font-weight: 600; padding: 5px 0; }
  summary:focus-visible { outline: 2px solid ${p => p.theme.colors.primary}; outline-offset: 4px; }
  > div { max-width: 820px; margin-top: 14px; }
  p + p { margin-top: 12px; }
  a { text-decoration: underline; text-underline-offset: 3px; }
`;

const Closing = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-top: 28px;
  span { margin-right: auto; color: ${p => p.theme.colors.textMuted}; font-size: 0.85rem; }
`;

const EXAMPLE_STEPS = [
  {
    label: 'Materiale', title: 'Kommunen beskriver behovet',
    description: 'En kommune vil afprøve en AI-assistent til mødereferater. Sagsbehandleren vedlægger en præsentation og beskriver, hvilke møder og oplysninger løsningen skal bruges til.',
    quoteLabel: 'Fiktivt uddrag fra leverandørens præsentation',
    quote: 'Løsningen kan indstilles til at slette optagelser efter 30 dage.',
    outcome: 'Materialet er en kilde til leverandørens udsagn. Kommunens valgte indstilling og aftale skal stadig afklares.',
  },
  {
    label: 'GPT', title: 'GPT omsætter materialet til forslag',
    description: 'GPT finder relevante oplysninger, knytter kildehenvisninger til dem og formulerer afklaringsspørgsmål og rapportudkast. En formulering kan blive mere sikker, end kilden giver belæg for.',
    quoteLabel: 'Eksempel på et udkast med en bevidst fejl',
    quote: 'Kommunens optagelser slettes automatisk efter 30 dage.',
    outcome: 'Her er en teknisk mulighed blevet beskrevet som en allerede indført praksis. Det er derfor et udkast til gennemgang.',
  },
  {
    label: 'JEV', title: 'JEV vurderer udsagnet mod kilden',
    description: 'JEV får kildegrundlaget, udkastet og konkrete kontrolspørgsmål. Kontrollen ser blandt andet efter udsagn uden belæg og foranstaltninger, som fremstilles som indført uden dokumentation.',
    quoteLabel: 'Det kontrolpunkt, eksemplet skal gøre tydeligt',
    quote: 'Kilden beskriver en mulighed for sletning. Den dokumenterer ikke kommunens faktiske opsætning.',
    outcome: 'En markering hjælper sagsbehandleren med at prioritere gennemgangen. JEV kan også overse fejlen. Eksemplet her er illustreret, ikke en aktuel modelkørsel.',
  },
  {
    label: 'Mennesket', title: 'Sagsbehandler og jura afklarer grundlaget',
    description: 'Sagsbehandleren undersøger aftalen og opsætningen med leverandør og IT. Jura eller DPO inddrages i den relevante vurdering. Svaret og den tilhørende dokumentation gemmes på sagen.',
    quoteLabel: 'Et mere præcist udkast, mens spørgsmålet er åbent',
    quote: 'Leverandøren oplyser, at sletning efter 30 dage kan konfigureres. Kommunens indstilling og aftalte slettefrist er endnu ikke dokumenteret.',
    outcome: 'Spørgsmålet forbliver åbent, indtil der er et tilstrækkeligt grundlag. Den udpegede godkender træffer beslutningen i sagens godkendelsesforløb.',
  },
];

export default function AboutPage() {
  const [step, setStep] = useState(0);
  const exampleHeading = useRef(null);
  const revealStep = useRef(false);
  const example = EXAMPLE_STEPS[step];

  useEffect(() => {
    if (!revealStep.current) return;
    revealStep.current = false;
    exampleHeading.current?.focus({ preventScroll: true });
    exampleHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [step]);

  const moveStep = nextStep => {
    revealStep.current = true;
    setStep(nextStep);
  };

  return (
    <Content>
      <PageHeader $stacked>
        <Intro>
          <Eyebrow>{BRAND.name} · Om løsningen</Eyebrow>
          <Title>AI hjælper med arbejdet. Mennesker tager stilling.</Title>
          <Lede>S.H.I.E.L.D. samler dokumentation om AI-løsninger og IT-løsninger med AI. Her bliver kommunens oplysninger, leverandørmateriale og faglige afklaringer til et samlet grundlag for risikovurderinger, konsekvensanalyser og dialog med jura.</Lede>
          <JumpLinks aria-label="Indhold på siden">
            <a href="#arbejdsgang">Se et eksempel</a>
            <a href="#arbejdsdeling">GPT, JEV og mennesker</a>
            <a href="#dokumentation">Dokumentation og modeller</a>
          </JumpLinks>
        </Intro>
      </PageHeader>

      <ReadingSection id="arbejdsgang" aria-labelledby="workflow-heading">
        <SectionHeader><div><h2 id="workflow-heading">Fra materiale til faglig stillingtagen</h2><p>Klik gennem et illustrativt eksempel om en AI-assistent til mødereferater.</p></div></SectionHeader>
        <Steps aria-label="Trin i eksemplet">
          {EXAMPLE_STEPS.map((item, index) => <StepButton key={item.label} type="button" $active={index === step} aria-pressed={index === step} aria-controls="workflow-example" onClick={() => setStep(index)}><span>0{index + 1}</span><strong>{item.label}</strong></StepButton>)}
        </Steps>
        <Example id="workflow-example">
          <div aria-live="polite" aria-atomic="true">
            <span className="example-label">ILLUSTRATIVT EKSEMPEL · TRIN {step + 1} AF 4</span>
            <h3 ref={exampleHeading} tabIndex="-1">{example.title}</h3>
            <p>{example.description}</p>
            <blockquote><span className="example-label">{example.quoteLabel}</span><p>“{example.quote}”</p></blockquote>
            <p className="outcome">{example.outcome}</p>
          </div>
          <ExampleActions>
            <small>Eksemplet ændrer ingen sager.</small>
            <SecondaryButton type="button" disabled={step === 0} onClick={() => moveStep(step - 1)}>Forrige trin</SecondaryButton>
            <Button type="button" onClick={() => moveStep(step === 3 ? 0 : step + 1)}>{step === 3 ? 'Se eksemplet igen' : 'Næste trin →'}</Button>
          </ExampleActions>
        </Example>
      </ReadingSection>

      <ReadingSection id="arbejdsdeling" aria-labelledby="roles-heading">
        <SectionHeader><div><h2 id="roles-heading">Hvem gør hvad?</h2><p>Arbejdsdelingen gælder både analysen af leverandørmateriale og arbejdet med den efterfølgende konsekvensanalyse.</p></div></SectionHeader>
        <RoleRow>
          <div><h3>GPT</h3><p className="role-description">Læser og udarbejder forslag</p></div>
          <div className="body">
            <p>GPT bearbejder den medsendte sagsbeskrivelse og tekst fra dokumenter og hjemmesider. Modellen foreslår oplysninger om blandt andet AI-funktion, personoplysninger, dataflow og sikkerhedsforanstaltninger med henvisninger til kildegrundlaget.</p>
            <p>I konsekvensanalysen hjælper GPT med at formulere rapportens afsnit, beskrive risici og synliggøre åbne spørgsmål. Rapporten følger løsningens indbyggede skabelon baseret på Datatilsynets materiale. Standardopsætningen bruger GPT-5.5.</p>
            <p>Modellen kan foreslå yderligere risici. Den ændrer ikke automatisk risikoscorer, fjerner blokeringer eller godkender sagen.</p>
          </div>
        </RoleRow>
        <RoleRow>
          <div><h3>JEV</h3><p className="role-description">Kontrollerer udkast mod grundlaget</p></div>
          <div className="body">
            <p>JEV er en evalueringsmodel fra TypeSafe AI. Den får udkastet, det medsendte kildegrundlag og konkrete kontrolspørgsmål. Resultatet bruges til at markere tekst, der kan kræve ekstra gennemgang.</p>
            <p>Kontrollen ser blandt andet efter manglende kildebelæg, udokumenterede juridiske konklusioner og forslag til foranstaltninger, der fejlagtigt beskrives som allerede gennemført.</p>
            <p>JEV foretager ikke selvstændig webresearch i denne arbejdsgang. En kilde kan være forkert eller ufuldstændig, selv om teksten stemmer med den. <a href="https://vercel.com/ai-gateway/models/jev" target="_blank" rel="noopener noreferrer">Læs om JEV hos Vercel ↗</a></p>
          </div>
        </RoleRow>
        <RoleRow>
          <div><h3>Human in the loop</h3><p className="role-description">Menneskelig gennemgang og beslutning</p></div>
          <div className="body">
            <p>Du vælger, hvilke oplysninger fra analysen der må indgå i vurderingsgrundlaget. Kildeuddrag og åbne spørgsmål kan gennemgås, og afklaringer kan få en ansvarlig, frist og et dokumenteret svar.</p>
            <ul>
              <li><strong>Sagsbehandler og fagansvarlig</strong> beskriver den konkrete anvendelse, efterprøver oplysninger og dokumenterer foranstaltninger sammen med relevante kolleger.</li>
              <li><strong>Jura og DPO</strong> kan gennemgå hjemmel, aftalegrundlag og konsekvenser for de registrerede og rådgive om de åbne spørgsmål.</li>
              <li><strong>Den udpegede godkender</strong> tager stilling i sagens særskilte godkendelsesforløb. Et AI-udkast eller et JEV-resultat udløser ingen automatisk godkendelse.</li>
            </ul>
          </div>
        </RoleRow>
        <Note><p><strong>JEV-kontrol er ikke en juridisk godkendelse.</strong></p><p>Også tekst uden markeringer kræver faglig gennemgang. Løsningens regelmotor beregner risikoscorer og status ud fra de registrerede oplysninger; resultatet afhænger af, at oplysningerne er rigtige og tilstrækkelige.</p></Note>
      </ReadingSection>

      <ReadingSection id="dokumentation" aria-labelledby="documentation-heading">
        <SectionHeader><div><h2 id="documentation-heading">Et grundlag, der kan følges tilbage</h2><p>Materiale, analyser, afklaringer og rapportversioner samles på den enkelte sag. Konsekvensanalyse og risikovurdering kan læses i løsningen og hentes som Word og Excel.</p></div></SectionHeader>
        <Details open>
          <summary>Hvad sker der, når et menneske retter rapporten?</summary>
          <div><p>En gemt tekstrettelse opretter en ny rapportversion med ændringsnotat og før/efter-historik. Tidligere versioner bevares. En tidligere JEV-kontrol markeres som forældet for den ændrede tekst.</p><p>Tekstrettelser ændrer ikke vurderingens input, risikoscorer, blokeringer eller godkendelser. Manglende oplysninger skal afklares i vurderingsgrundlaget; de kan ikke fjernes ved at omformulere rapporten.</p></div>
        </Details>
        <Details>
          <summary>Hvilke oplysninger sendes til AI?</summary>
          <div><p>Når AI-analysen startes, sendes de indtastede sagsoplysninger og de medtagne tekstuddrag til modeltjenesterne via Vercel AI Gateway. Ved rapportudarbejdelse indgår også de udfyldte vurderingsfelter og det gemte vurderingsgrundlag. JEV modtager udkastet og det relevante kildegrundlag til kontrol.</p><p>Felter og bilag kan indeholde personoplysninger. De anonymiseres ikke automatisk i denne arbejdsgang, og behandlingen foregår ikke kun i din browser. Beskriv datakategorier og arbejdsgange frem for konkrete borgeres personoplysninger.</p><p>Filer skal kunne læses som tekst; scannede sider, billeder og talenoter bliver ikke automatisk analyseret. Gennemgå det udtrukne materiale, før det bruges som grundlag.</p></div>
        </Details>
        <Details>
          <summary>Hvilken model er brugt i den enkelte analyse?</summary>
          <div><p>Den almindelige AI-arbejdsgang bruger GPT-5.5 til udkast og JEV til kontrol. Den gemte analyse indeholder oplysninger om den faktisk anvendte model, kilderne og kontrollen. En konfigureret forbindelse er ikke i sig selv dokumentation for en vellykket kørsel.</p><p>Den anvendte GPT-model fremgår af den enkelte rapportversion, fx GPT-5.5, GPT-5.6 Sol eller GPT-6 Astra. JEV kontrollerer tekstens støtte i kilderne. Kommunens fagpersoner vurderer oplysninger, risici og anbefalinger og træffer den endelige beslutning.</p></div>
        </Details>
        <Details>
          <summary>Hvilket skabelongrundlag bruger rapporterne?</summary>
          <div><p>Konsekvensanalysen og risikovurderingen bygger på den indbyggede tilpasning af <a href="https://www.datatilsynet.dk/Media/638519447926128212/Skabelon%20til%20konsekvensanalyse%20vedr%c3%b8rende%20AI.xlsx" target="_blank" rel="noopener noreferrer">Datatilsynets skabelon til konsekvensanalyse vedrørende AI ↗</a>. Den konkrete behandling, hjemmel, risici og foranstaltninger skal stadig dokumenteres af kommunen.</p><p>Gemte kildeversioner og henvisninger gør det muligt at efterprøve rapportens grundlag. Brug af skabelonen betyder ikke, at Datatilsynet har godkendt løsningen eller den enkelte vurdering.</p></div>
        </Details>
        <Closing><span>{BRAND.name} · {BRAND.version}</span><SecondaryButton as={Link} to="/sager">Åbn sager</SecondaryButton><Button as={Link} to="/anskaffelse">Opret AI-løsning →</Button></Closing>
      </ReadingSection>
    </Content>
  );
}
