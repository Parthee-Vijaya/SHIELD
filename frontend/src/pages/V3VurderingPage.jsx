import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { pageLayout, pageTitleStyle, sectionTitleStyle, controlStyle } from '../theme/layout';
import { useMutation, useQuery } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { filterNoiseWarnings } from '../utils/warnings';
import DataOverview from '../components/data-overview/DataOverview';
import {
  ComplianceVerdict,
  EvidenceChecklist,
  SidenotesColumn,
  toSuperscript,
} from '../components/rules';

/**
 * V3VurderingPage — Design C "Editorial workspace" rendering of the v3
 * rule_engine output.
 *
 * Layout:
 *   - Form-card (single column) for input.
 *   - On result: 2-column shell (doc | sidenotes). The doc column renders
 *     each triggered rule as a document paragraph with inline ¹²³ footnote
 *     refs that anchor to the SidenotesColumn on the right.
 *   - Verdict is an off-white banner with a bronze left-border (no horizontal
 *     hero card) and a counter row: lov-kilder · artefakter · krav.
 *   - Krav-list uses § bullets in surface-alt (off-white-soft).
 *
 * The kilde citations live ONLY in the sidenotes — body text reads
 * uninterrupted.
 */

// ---- Sample inputs (3 examples — GO / BETINGET-GO / NO-GO) ---------------
//
// Each example is a complete, "as if a human had answered it" snapshot:
// description, signals, predicates, case metadata, and an explanation
// of why that combination produces its expected aggregate status.

const EXAMPLE_GO = {
  id: 'go',
  title: 'Internt journalsøgning',
  status: 'GO',
  summary: 'Lav-risiko: klassisk søgesystem uden AI eller afgørelser, fuld GDPR-dokumentation.',
  description:
    'Søgefunktion til intern journalisering. Sagsbehandlere kan slå op i ' +
    'tidligere afgørelser via fuldtekstsøgning. Systemet bruger ingen AI — ' +
    'det er klassisk Lucene-indeksering. Træffer ingen afgørelser, foretager ' +
    'ingen profilering af borgere. Personoplysninger behandles kun internt og ' +
    'kun af autoriserede sagsbehandlere. Alle GDPR-principper er dokumenteret ' +
    'inden idriftsættelse, sikkerhedsforanstaltninger på plads, gyldig DPIA findes.',
  case_id: 'K-2026-EX-GO',
  note: 'Eksempel: lav-risiko søgesystem (alle GDPR-krav opfyldt)',
  signals: {
    'system.uses_ai': false,
    'system.processes_personal_data': true,
    'system.makes_decisions_about_persons': false,
    'system.classifies_individuals': false,
    'system.scores_or_ranks_persons': false,
  },
  predicates: {
    // ai_act.art5 — ikke en forbudt praksis (uanset, system bruger ikke AI)
    anvendelse: 'intet_af_ovenstaaende',
    medicinsk_eller_sikkerheds_undtagelse: false,
    // gdpr.art5 — alle 5 principper opfyldt
    formaal_dokumenteret: true,
    dataminimering_vurderet: true,
    opbevaringsfrist_fastsat: true,
    korrekthedsproces: true,
    sikkerhedsforanstaltninger: true,
    // gdpr.art6 — gyldigt retsgrundlag
    retsgrundlag: 'samfundets_interesse_eller_offentlig_myndighed_e',
    behandler_saerlige_kategorier: false,
    nationalt_retsgrundlag_dokumenteret: true,
    // gdpr.art32 — sikkerhedsforanstaltninger på plads
    pseudonymisering_kryptering: true,
    integritet_og_fortrolighed: true,
    gendannelse_efter_haendelse: true,
    regelmaessig_test: true,
    brud_anmeldelses_proces: true,
    // gdpr.art35 — DPIA eksisterer
    dpia_eksisterer: true,
    art35_stk3_litra: 'intet_af_de_tre',
    paa_datatilsynets_liste: false,
    art35_stk1_hoj_risiko: false,
    // offentlighedsloven.par13 — ikke sammenstillinger
    laver_sammenstillinger: false,
    enkle_kommandoer: false,
    indeholder_personoplysninger: true,
    anonymiseringskapacitet: true,
  },
  explanation:
    'Systemet falder uden for AI-forordningens anvendelsesområde — det bruger ' +
    'ingen AI/ML-modeller. GDPR art. 22 (automatiserede afgørelser) udløses ikke ' +
    'fordi systemet ikke træffer afgørelser. GDPR art. 5, 6, 32 og 35 evalueres ' +
    'fordi systemet behandler personoplysninger, men alle forhold er dokumenteret: ' +
    'formål, dataminimering, opbevaringsfrist, sikkerhedsforanstaltninger, gyldigt ' +
    'retsgrundlag og DPIA — så hver regel resolverer til GO-branch (ingen krav). ' +
    'Reglerne giver GO på eksemplets forudsætninger. En faktisk idriftsættelse kræver kommunens særskilte faglige godkendelse.',
};

const EXAMPLE_BETINGET_GO = {
  id: 'betinget-go',
  title: 'Borgerassistent — pension',
  status: 'BETINGET-GO',
  summary:
    'Højrisiko-AI under AI Act + automatiseret afgørelse under GDPR — kan idriftsættes med kompenserende kontroller.',
  description:
    'Borgerassistent — pensionsansøgning. Systemet er en AI-drevet tjeneste der ' +
    'hjælper borgere med at udfylde pensionsansøgninger og foretager profilering ' +
    'af ansøgers risikoprofil. Det træffer skriftlige afgørelser om tildeling, og ' +
    'borgere kan bestride dem. Behandler personoplysninger i fuldt automatiseret flow.',
  case_id: 'K-2026-EX-BETINGET',
  note: 'Eksempel: typisk kommunal AI-case (pilot)',
  signals: {
    'system.uses_ai': true,
    'system.processes_personal_data': true,
    'system.makes_decisions_about_persons': true,
    'system.is_used_by_public_authority': true,
    'system.makes_administrative_decisions': true,
    'system.generates_decision_text': true,
    'system.classifies_individuals': true,
  },
  predicates: {
    // ai_act.art5
    anvendelse: 'intet_af_ovenstaaende',
    medicinsk_eller_sikkerheds_undtagelse: false,
    // ai_act.art6
    anvendelsesomraade: 'vaesentlige_offentlige_tjenester',
    kun_forberedende: false,
    profilering: true,
    // gdpr.art6
    retsgrundlag: 'samfundets_interesse_eller_offentlig_myndighed_e',
    behandler_saerlige_kategorier: false,
    nationalt_retsgrundlag_dokumenteret: true,
    // gdpr.art22
    er_helautomatiseret: true,
    har_retsvirkning_eller_betydelig_paavirkning: true,
    retsgrundlag_til_undtagelse: 'lov',
    omfatter_saerlige_kategorier: false,
    // gdpr.art35
    art35_stk3_litra: 'litra_a_systematisk_omfattende_evaluering_med_retsvirkning',
    paa_datatilsynets_liste: true,
    art35_stk1_hoj_risiko: true,
    dpia_eksisterer: false,
    // forvaltningsloven.par19
    traeffer_afgoerelse: true,
    bruger_oplysninger_om_part: true,
    parten_kender_oplysningerne: false,
    ufordelagtig_for_parten: true,
    // forvaltningsloven.par22
    meddeles_skriftligt: true,
    fuld_medhold: false,
    kan_systemet_generere_begrundelse: 'ja_delvist',
    // forvaltningsloven.par24
    genererer_begrundelse: true,
    indeholder_lovhenvisning: true,
    angiver_hovedhensyn_ved_skon: 'ja',
    angiver_faktiske_omstaendigheder: true,
    lovhenvisninger_verificerbare: true,
    // offentlighedsloven.par13
    laver_sammenstillinger: false,
    enkle_kommandoer: false,
    indeholder_personoplysninger: false,
    anonymiseringskapacitet: true,
  },
  explanation:
    'Systemet er højrisiko-AI under AI-forordningens artikel 6 (Bilag III: ' +
    'væsentlige offentlige tjenester + profilering). Afgørelsen er helautomatiseret ' +
    'og har retsvirkning, hvilket aktiverer GDPR artikel 22. Skriftlige afgørelser ' +
    'kræver lovlig begrundelse efter forvaltningslovens §22 og §24. Aggregat-status ' +
    'bliver BETINGET-GO fordi alle krav kan opfyldes med kompenserende kontroller ' +
    '(menneskelig kontrol, DPIA, ret til at bestride osv.) — systemet kan idriftsættes ' +
    'når disse er på plads.',
};

const EXAMPLE_NO_GO = {
  id: 'no-go',
  title: 'Social scoring af borgere',
  status: 'NO-GO',
  summary: 'Forbudt praksis under AI Act art. 5 — kan ikke idriftsættes.',
  description:
    'Social scoring af borgere — kommunalt prioriteringssystem. AI-system der ' +
    'genererer en "troværdighedsscore" for borgere baseret på deres adfærd i ' +
    'offentlige rum, sociale medier-aktivitet, og økonomiske transaktioner. ' +
    'Scoren bruges af kommunen til at prioritere ydelser og udvælge borgere til ' +
    'særlig screening. Profilerer borgere systematisk på tværs af kontekster.',
  case_id: 'K-2026-EX-NOGO',
  note: 'Eksempel: forbudt praksis (uddannelses-/test-formål)',
  signals: {
    'system.uses_ai': true,
    'system.processes_personal_data': true,
    'system.makes_decisions_about_persons': true,
    'system.classifies_individuals': true,
    'system.scores_or_ranks_persons': true,
    'system.is_used_by_public_authority': true,
    'system.makes_administrative_decisions': true,
  },
  predicates: {
    // ai_act.art5 — TRIGGER NO-GO via social scoring
    anvendelse: 'social_scoring_offentlig_myndighed',
    medicinsk_eller_sikkerheds_undtagelse: false,
    // ai_act.art6 (irrelevant fordi art5 = NO-GO)
    anvendelsesomraade: 'vaesentlige_offentlige_tjenester',
    profilering: true,
    // resten holdes minimal — art5 NO-GO dominerer aggregeret status
    er_helautomatiseret: true,
    har_retsvirkning_eller_betydelig_paavirkning: true,
    retsgrundlag: 'intet_retsgrundlag',
    omfatter_saerlige_kategorier: false,
    behandler_saerlige_kategorier: false,
  },
  explanation:
    'Systemet er en forbudt praksis under AI-forordningens artikel 5, stk. 1, ' +
    'litra c — social scoring foretaget af eller på vegne af offentlige myndigheder, ' +
    'der medfører ugunstig eller uberettiget behandling. Forbuddet er absolut: ingen ' +
    'kompenserende kontroller kan tillade systemet idriftsat. Aggregat-status bliver ' +
    'NO-GO uanset alle andre regler — art. 5 har precedens.',
};

const EXAMPLES = [EXAMPLE_GO, EXAMPLE_BETINGET_GO, EXAMPLE_NO_GO];

// ---- Layout shell --------------------------------------------------------

const Page = styled.div`
  ${pageLayout}
`;

const Eyebrow = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: ${(p) => p.theme.colors.inkFaded};
  margin-bottom: 0.6rem;
  font-weight: 600;
`;

const Title = styled.h1`
  ${pageTitleStyle}
`;

const Lede = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  margin: 0 0 2.5rem;
  color: ${(p) => p.theme.colors.inkSoft};
  font-size: 1.05rem;
  line-height: 1.65;
  max-width: 720px;
`;

// ---- Result-mode header (case-focused, mirroring Design C mockup) -------

const BackLink = styled.button`
  display: inline-block;
  font-family: ${(p) => p.theme.fonts.sans};
  margin-bottom: 1.5rem;
  font-size: 0.82rem;
  color: ${(p) => p.theme.colors.inkSoft};
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;

  &:hover { color: ${(p) => p.theme.colors.ink}; }
`;

const Breadcrumb = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.82rem;
  color: ${(p) => p.theme.colors.inkFaded};
  margin-bottom: 1.5rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;

  span.crumb-sep { color: ${(p) => p.theme.colors.borderSoft}; }
  span.crumb-current { color: ${(p) => p.theme.colors.inkSoft}; }
`;

const CaseId = styled.div`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.7rem;
  color: ${(p) => p.theme.colors.inkFaded};
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 0.6rem;
`;

const CaseTitle = styled.h1`
  ${pageTitleStyle}
`;

const CaseMeta = styled.p`
  font-family: ${(p) => p.theme.fonts.sans};
  color: ${(p) => p.theme.colors.inkSoft};
  font-size: 0.92rem;
  margin: 0 0 1.75rem;
  line-height: 1.55;
`;

const Shell = styled.div`
  display: grid;
  grid-template-columns: 1fr minmax(280px, 320px);
  column-gap: 3rem;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
    column-gap: 0;
  }
`;

const Doc = styled.article`
  max-width: 720px;
  min-width: 0;
`;

// ---- Form card -----------------------------------------------------------

const FormCard = styled.form`
  background: ${(p) => p.theme.colors.card};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 10px;
  padding: 1.75rem 1.85rem 1.5rem;
  margin-bottom: 2.5rem;
  box-shadow: 0 1px 3px rgba(20, 24, 31, 0.04);
  position: relative;

  /* Decorative top hairline accent in bronze */
  &::before {
    content: '';
    position: absolute;
    top: -1px;
    left: 1.85rem;
    right: 1.85rem;
    height: 2px;
    background: linear-gradient(
      to right,
      transparent,
      ${(p) => p.theme.colors.bronze} 50%,
      transparent
    );
    opacity: 0.4;
  }
`;

const Label = styled.label`
  display: block;
  font-family: ${(p) => p.theme.fonts.sans};
  font-weight: 500;
  font-size: 0.82rem;
  letter-spacing: 0.02em;
  color: ${(p) => p.theme.colors.inkSoft};
  margin-bottom: 0.5rem;
  text-transform: uppercase;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 130px;
  padding: 0.85rem 1rem;
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 6px;
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1rem;
  line-height: 1.6;
  resize: vertical;
  background: ${(p) => p.theme.colors.paper};
  color: ${(p) => p.theme.colors.ink};

  &:focus {
    outline: none;
    border-color: ${(p) => p.theme.colors.primary};
    box-shadow: 0 0 0 3px rgba(201, 68, 22, 0.12);
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 0.65rem 0.85rem;
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 6px;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.92rem;
  background: ${(p) => p.theme.colors.paper};
  color: ${(p) => p.theme.colors.ink};

  &:focus {
    outline: none;
    border-color: ${(p) => p.theme.colors.primary};
    box-shadow: 0 0 0 3px rgba(201, 68, 22, 0.12);
  }
`;

const MetaRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 1rem;
  margin-top: 1.25rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const MetaField = styled.div`
  display: flex;
  flex-direction: column;
`;

const Controls = styled.div`
  display: flex;
  gap: 0.85rem;
  margin-top: 1.25rem;
  flex-wrap: wrap;
  align-items: center;
`;

const PrimaryButton = styled.button`
  background: ${(p) => p.theme.colors.primary};
  color: white;
  border: none;
  padding: 0.7rem 1.4rem;
  ${controlStyle}
  cursor: pointer;
  transition: background ${(p) => p.theme.animations.transitionFast};

  &:hover { background: ${(p) => p.theme.colors.primaryDark}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  background: transparent;
  color: ${(p) => p.theme.colors.ink};
  border: 1px solid ${(p) => p.theme.colors.line};
  padding: 0.65rem 1.1rem;
  ${controlStyle}
  cursor: pointer;
  transition: border-color ${(p) => p.theme.animations.transitionFast},
              color ${(p) => p.theme.animations.transitionFast};

  &:hover {
    border-color: ${(p) => p.theme.colors.primary};
    color: ${(p) => p.theme.colors.primary};
  }
`;

const ToggleRow = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.85rem;
  color: ${(p) => p.theme.colors.inkSoft};
  cursor: pointer;
  margin-left: auto;
`;

// ---- Document drop-zone --------------------------------------------------

const DropZone = styled.label`
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 1.25rem;
  background: ${(p) => p.theme.colors.card};
  border: 1.5px dashed ${(p) => (p.$active ? p.theme.colors.primary : p.theme.colors.line)};
  border-radius: 10px;
  padding: 1.4rem 1.6rem;
  margin-bottom: 1.5rem;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.12s ease;
  text-align: left;
  position: relative;

  &:hover {
    border-color: ${(p) => p.theme.colors.primary};
    background: ${(p) => p.theme.colors.primaryShallow || 'rgba(13, 46, 84, 0.025)'};
  }

  &:focus-within {
    outline: 2px solid ${(p) => p.theme.colors.primary};
    outline-offset: 2px;
  }

  ${(p) =>
    p.$active &&
    `background: ${p.theme.colors.primaryBg}; border-style: solid;`}

  input[type="file"] { display: none; }

  @media (max-width: 540px) {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
`;

const DropIcon = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: ${(p) => p.theme.colors.bronzeSoft || 'rgba(176, 138, 74, 0.12)'};
  color: ${(p) => p.theme.colors.bronze};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  font-family: ${(p) => p.theme.fonts.display};
  font-weight: 600;
  flex-shrink: 0;

  &::before { content: '↑'; }
`;

const DropTitle = styled.div`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.08rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.ink};
  margin-bottom: 0.25rem;
`;

const DropHint = styled.div`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.9rem;
  color: ${(p) => p.theme.colors.inkSoft};
  line-height: 1.5;
`;

const DropMeta = styled.div`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.74rem;
  color: ${(p) => p.theme.colors.inkFaded};
  margin-top: 0.5rem;
  letter-spacing: 0.04em;
`;

// ---- Document chunks section in result-mode ----------------------------

const ChunksSection = styled.div`
  margin: 2.5rem 0 1rem;
  padding: 1.4rem 1.6rem;
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 8px;
`;

const ChunksHeader = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${(p) => p.theme.colors.inkFaded};
  font-weight: 600;
  margin-bottom: 0.85rem;
`;

const ChunkItem = styled.div`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.95rem;
  color: ${(p) => p.theme.colors.ink};
  padding: 0.65rem 0;
  border-bottom: 1px solid ${(p) => p.theme.colors.lineSoft};
  line-height: 1.55;

  &:last-child { border-bottom: none; }

  .label {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.75rem;
    text-transform: uppercase;
    color: ${(p) => p.theme.colors.primary};
    letter-spacing: 0.1em;
    margin-right: 0.6rem;
    font-weight: 600;
  }

  .preview {
    color: ${(p) => p.theme.colors.inkSoft};
    font-style: italic;
    margin-top: 0.3rem;
    font-size: 0.88rem;
  }

  .rules {
    margin-top: 0.4rem;
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.72rem;
    color: ${(p) => p.theme.colors.inkFaded};
  }
`;

// ---- Source-doc evidence panel (#9 PDF annotation) ---------------------

const SourceDocSection = styled.div`
  margin: 2.5rem 0 1rem;
  padding: 1.4rem 1.6rem;
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 8px;
`;

const SourceDocHeader = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${(p) => p.theme.colors.inkFaded};
  font-weight: 600;
  margin-bottom: 0.85rem;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
`;

const SourceDocToggle = styled.button`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${(p) => p.theme.colors.primary};
  background: transparent;
  border: 1px solid ${(p) => p.theme.colors.primary};
  border-radius: 3px;
  padding: 0.35rem 0.85rem;
  cursor: pointer;
  text-transform: uppercase;
  &:hover { background: ${(p) => p.theme.colors.primaryShallow}; }
`;

const SourceDocLayout = styled.div`
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 16px;
  margin-top: 1rem;
  min-height: 540px;
  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const SourceDocFrame = styled.iframe`
  width: 100%;
  min-height: 560px;
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 4px;
  background: #fff;
`;

const SourceDocSidebar = styled.aside`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.86rem;
  color: ${(p) => p.theme.colors.ink};
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
`;

const SourceDocRow = styled.div`
  border: 1px solid ${(p) => p.theme.colors.lineSoft};
  border-radius: 4px;
  padding: 0.55rem 0.7rem;

  .rid {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.74rem;
    color: ${(p) => p.theme.colors.primary};
    margin-bottom: 0.3rem;
  }
  .pages {
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.7rem;
    color: ${(p) => p.theme.colors.inkFaded};
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.3rem;
  }
  .preview {
    font-style: italic;
    color: ${(p) => p.theme.colors.inkSoft};
    font-size: 0.78rem;
  }
`;

// ---- Examples panel ------------------------------------------------------

const ExamplesPanel = styled.section`
  margin-top: 2.5rem;
`;

const ExamplesHeader = styled.div`
  margin-bottom: 1.25rem;
`;

const ExamplesTitle = styled.h2`
  ${sectionTitleStyle}
  margin: 0 0 0.4rem;
  color: ${(p) => p.theme.colors.ink};
`;

const ExamplesLede = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  color: ${(p) => p.theme.colors.inkSoft};
  font-size: 0.98rem;
  margin: 0;
  line-height: 1.6;
  font-style: italic;
`;

const ExamplesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: 1.25rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const STATUS_BORDER = {
  GO: 'rgba(45, 106, 49, 0.45)',
  'BETINGET-GO': 'rgba(201, 68, 22, 0.45)',
  'NO-GO': 'rgba(160, 32, 32, 0.45)',
};
const STATUS_PILL_BG = {
  GO: 'rgba(45, 106, 49, 0.10)',
  'BETINGET-GO': '#fdf2eb',
  'NO-GO': 'rgba(160, 32, 32, 0.10)',
};
const STATUS_PILL_FG = {
  GO: '#2d6a31',
  'BETINGET-GO': '#a03612',
  'NO-GO': '#a02020',
};

const ExampleCard = styled.div`
  background: ${(p) => p.theme.colors.card};
  border: 1px solid ${(p) =>
    p.$active ? STATUS_BORDER[p.$status] : p.theme.colors.line};
  border-radius: 8px;
  padding: 1.1rem 1.2rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  transition: border-color 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease;
  position: relative;
  overflow: hidden;

  /* Verdict-color top accent strip */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: ${(p) => STATUS_PILL_FG[p.$status]};
    opacity: ${(p) => (p.$active ? 1 : 0.6)};
  }

  &:hover {
    border-color: ${(p) => STATUS_BORDER[p.$status]};
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(20, 24, 31, 0.06);
  }

  ${(p) =>
    p.$active &&
    `box-shadow: 0 0 0 3px ${STATUS_PILL_BG[p.$status]}, 0 4px 12px rgba(20, 24, 31, 0.06);`}
`;

const ExamplePill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  background: ${(p) => STATUS_PILL_BG[p.$status]};
  color: ${(p) => STATUS_PILL_FG[p.$status]};
  border: 1px solid ${(p) => STATUS_BORDER[p.$status]};
  padding: 3px 10px;
  border-radius: 999px;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  align-self: flex-start;
`;

const ExampleTitle = styled.h3`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
  color: ${(p) => p.theme.colors.ink};
  letter-spacing: -0.01em;
`;

const ExampleSummary = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.9rem;
  line-height: 1.5;
  color: ${(p) => p.theme.colors.inkSoft};
  margin: 0;
`;

const ExampleActions = styled.div`
  display: flex;
  gap: 0.6rem;
  margin-top: auto;
  padding-top: 0.4rem;
  align-items: center;
`;

const ExampleLoadButton = styled.button`
  background: ${(p) => p.theme.colors.primary};
  color: white;
  border: none;
  padding: 0.45rem 0.95rem;
  border-radius: 6px;
  font-family: ${(p) => p.theme.fonts.sans};
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;

  &:hover { background: ${(p) => p.theme.colors.primaryDark}; }
`;

const ExampleExplainToggle = styled.button`
  background: transparent;
  border: none;
  color: ${(p) => p.theme.colors.inkSoft};
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.45rem 0.5rem;
  margin-left: auto;

  &:hover { color: ${(p) => p.theme.colors.primary}; }
`;

const ExampleExplanation = styled.div`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 0.9rem;
  line-height: 1.65;
  color: ${(p) => p.theme.colors.ink};
  background: ${(p) => p.theme.colors.paperSoft};
  border-left: 3px solid ${(p) => STATUS_BORDER[p.$status] || p.theme.colors.line};
  padding: 0.75rem 0.95rem;
  margin-top: 0.5rem;
  border-radius: 0 6px 6px 0;
`;

// ---- Verdict banner (Northern Modern: surface + bronze left-border) ---

/* Per-status verdict accent — pulled from the result aggregate. Falls back
   to BETINGET-GO styling. */
const VERDICT_ACCENT = {
  GO: { bar: '#2d6a31', tint: 'rgba(45, 106, 49, 0.08)', pillFg: '#fff', pillBg: '#2d6a31' },
  'BETINGET-GO': { bar: '#a03612', tint: '#fdf2eb', pillFg: '#fff', pillBg: '#b08a4a' },
  'NO-GO': { bar: '#a02020', tint: 'rgba(160, 32, 32, 0.08)', pillFg: '#fff', pillBg: '#a02020' },
};

const VerdictBanner = styled.div`
  --bar: ${(p) => (VERDICT_ACCENT[p.$status] || VERDICT_ACCENT['BETINGET-GO']).bar};
  --tint: ${(p) => (VERDICT_ACCENT[p.$status] || VERDICT_ACCENT['BETINGET-GO']).tint};

  background: var(--tint);
  border: 1px solid ${(p) => p.theme.colors.line};
  border-left: 4px solid var(--bar);
  border-radius: 0 8px 8px 0;
  padding: 1.25rem 1.5rem;
  margin: 1.75rem 0 2.75rem;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 1.25rem;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    gap: 0.85rem;
  }
`;

const VerdictPill = styled.div`
  background: ${(p) => (VERDICT_ACCENT[p.$status] || VERDICT_ACCENT['BETINGET-GO']).pillBg};
  color: ${(p) => (VERDICT_ACCENT[p.$status] || VERDICT_ACCENT['BETINGET-GO']).pillFg};
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 0.4rem 0.85rem;
  border-radius: 3px;
  text-transform: uppercase;
  white-space: nowrap;
`;

const VerdictStatus = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--bar);
  font-weight: 700;
  margin-bottom: 0.3rem;
  opacity: 0.85;
`;

const VerdictText = styled.div`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1.02rem;
  color: ${(p) => p.theme.colors.ink};
  line-height: 1.55;

  b, strong { color: var(--bar); font-weight: 700; }
`;

const VerdictMetric = styled.div`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.72rem;
  color: ${(p) => p.theme.colors.inkFaded};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  text-align: right;
  border-left: 1px solid ${(p) => p.theme.colors.line};
  padding-left: 1.25rem;

  .number {
    font-family: ${(p) => p.theme.fonts.display};
    font-size: 1.6rem;
    font-weight: 700;
    color: ${(p) => p.theme.colors.ink};
    letter-spacing: -0.01em;
    display: block;
    line-height: 1.05;
    margin-bottom: 0.2rem;
  }

  @media (max-width: 720px) {
    border-left: none;
    border-top: 1px solid ${(p) => p.theme.colors.line};
    padding-left: 0;
    padding-top: 0.85rem;
    text-align: left;
  }
`;

// ---- Section ------------------------------------------------------------

const SectionH = styled.h2`
  ${sectionTitleStyle}
  margin: 2.5rem 0 0.4rem;
  color: ${(p) => p.theme.colors.ink};
`;

const SectionLede = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1rem;
  font-style: italic;
  color: ${(p) => p.theme.colors.inkSoft};
  margin: 0 0 1.5rem;
  line-height: 1.55;
`;

// ---- Rule paragraph (document-style) ------------------------------------

const Rule = styled.div`
  padding: 1.85rem 0 2rem;
  border-top: 1px solid ${(p) => p.theme.colors.line};
  position: relative;

  &:last-child { border-bottom: 1px solid ${(p) => p.theme.colors.line}; }

  /* Number indicator in the negative space on the left */
  &::before {
    content: '${(p) => p.$num || ''}';
    position: absolute;
    top: 1.85rem;
    left: -3.2rem;
    font-family: ${(p) => p.theme.fonts.display};
    font-size: 1.5rem;
    font-weight: 300;
    color: ${(p) => p.theme.colors.bronze};
    opacity: 0.45;
    line-height: 1;

    @media (max-width: 1100px) { display: none; }
  }
`;

const RuleHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.7rem;
`;

const RuleMarker = styled.span`
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: ${(p) => p.theme.colors.inkFaded};
  font-weight: 600;
`;

const RuleTitle = styled.h3`
  font-family: ${(p) => p.theme.fonts.display};
  font-size: 1.32rem;
  font-weight: 600;
  letter-spacing: -0.012em;
  line-height: 1.32;
  margin: 0 0 1rem;
  color: ${(p) => p.theme.colors.ink};
`;

const FootnoteRef = styled.a`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.7rem;
  font-weight: 700;
  color: ${(p) => p.theme.colors.primary};
  text-decoration: none;
  margin-left: 2px;
  vertical-align: super;
  line-height: 1;

  &:hover { text-decoration: underline; }
`;

const RuleBody = styled.p`
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1.06rem;
  line-height: 1.7;
  color: ${(p) => p.theme.colors.ink};
  margin: 0 0 1rem;
`;

const KravBlock = styled.div`
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 6px;
  padding: 1rem 1.3rem 1.1rem;
  margin-top: 1rem;
  position: relative;

  /* Subtle bronze rule on the left edge */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 1rem;
    bottom: 1rem;
    width: 2px;
    background: ${(p) => p.theme.colors.bronze};
    opacity: 0.45;
  }
`;

const KravHeader = styled.div`
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: ${(p) => p.theme.colors.bronze};
  font-weight: 700;
  margin-bottom: 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .count {
    font-family: ${(p) => p.theme.fonts.mono};
    background: ${(p) => p.theme.colors.bronzeSoft || 'rgba(176, 138, 74, 0.14)'};
    color: ${(p) => p.theme.colors.bronze};
    border-radius: 999px;
    padding: 1px 8px;
    font-size: 0.62rem;
    letter-spacing: 0.08em;
  }
`;

const KravList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const KravItem = styled.li`
  display: grid;
  grid-template-columns: 1.4rem 1fr;
  gap: 0.6rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.92rem;
  line-height: 1.55;
  color: ${(p) => p.theme.colors.ink};
  padding: 0.4rem 0;
  border-bottom: 1px dotted ${(p) => p.theme.colors.lineSoft};

  &:last-child { border-bottom: none; }

  &::before {
    content: '§';
    font-family: ${(p) => p.theme.fonts.display};
    color: ${(p) => p.theme.colors.primary};
    font-weight: 700;
    font-size: 1.05rem;
    line-height: 1.4;
  }
`;

const NeedsInputBox = styled.div`
  background: rgba(184, 134, 11, 0.08);
  border: 1px solid rgba(184, 134, 11, 0.3);
  border-radius: 6px;
  padding: 0.85rem 1rem;
  margin-top: 1rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.85rem;
  color: ${(p) => p.theme.colors.inkSoft};

  ul {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
    font-family: ${(p) => p.theme.fonts.mono};
    font-size: 0.78rem;
  }
`;

// ---- Audit footer -------------------------------------------------------

const AuditFootnote = styled.div`
  margin-top: 4rem;
  padding: 1.1rem 1.3rem;
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px solid ${(p) => p.theme.colors.line};
  border-radius: 8px;
  font-family: ${(p) => p.theme.fonts.mono};
  font-size: 0.72rem;
  color: ${(p) => p.theme.colors.inkSoft};
  line-height: 1.85;

  b {
    color: ${(p) => p.theme.colors.ink};
    font-weight: 600;
  }
`;

// ---- Status messages ----------------------------------------------------

const Empty = styled.div`
  background: ${(p) => p.theme.colors.paperSoft};
  border: 1px dashed ${(p) => p.theme.colors.line};
  border-radius: 8px;
  padding: 2.5rem;
  text-align: center;
  color: ${(p) => p.theme.colors.inkSoft};
  font-family: ${(p) => p.theme.fonts.body};
  font-size: 1rem;
  font-style: italic;
`;

const ErrorBox = styled.div`
  background: ${(p) => p.theme.colors.dangerSoft};
  border: 1px solid ${(p) => p.theme.colors.danger};
  color: ${(p) => p.theme.colors.danger};
  padding: 1rem 1.25rem;
  border-radius: 8px;
  margin-bottom: 2rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.9rem;
`;

const Warnings = styled.div`
  background: rgba(184, 134, 11, 0.08);
  border-left: 3px solid ${(p) => p.theme.colors.warning};
  border-radius: 0 6px 6px 0;
  padding: 0.85rem 1.1rem;
  margin-bottom: 2rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.82rem;
  color: ${(p) => p.theme.colors.inkSoft};
  word-break: break-word;

  strong { color: ${(p) => p.theme.colors.ink}; }
  ul { margin: 0.4rem 0 0; padding-left: 1.25rem; }
`;

const FlaggedBanner = styled.div`
  background: rgba(160, 32, 32, 0.06);
  border-left: 3px solid #a02020;
  border-radius: 0 6px 6px 0;
  padding: 0.95rem 1.2rem;
  margin-bottom: 1.5rem;
  font-family: ${(p) => p.theme.fonts.sans};
  font-size: 0.88rem;
  color: ${(p) => p.theme.colors.ink};

  strong { color: #a02020; }
  ul { margin: 0.4rem 0 0; padding-left: 1.25rem; font-family: ${(p) => p.theme.fonts.mono}; font-size: 0.78rem; }
  a { color: ${(p) => p.theme.colors.primary}; font-weight: 500; }
`;

// ---- API + helpers ------------------------------------------------------

async function postAssess(body) {
  const res = await axios.post('/api/v3/assess', body);
  return res.data;
}

async function postDocumentAnalyze({ file, caseId, caseDbId, note }) {
  const fd = new FormData();
  fd.append('file', file);
  if (caseId) fd.append('case_id', caseId);
  if (caseDbId) fd.append('case_db_id', caseDbId);
  if (note) fd.append('note', note);
  const res = await axios.post('/api/v3/document/analyze', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000,
  });
  return res.data;
}

async function fetchFlaggedRuleIds() {
  const res = await axios.get('/api/v3/law/freshness/flagged');
  return res.data.flagged_rule_ids || [];
}

async function fetchDocumentHighlights(auditLogId) {
  if (!auditLogId) return null;
  const res = await axios.get(`/api/v3/documents/${auditLogId}/highlights`);
  return res.data;
}

const SourceDocViewer = ({ auditLogId, format }) => {
  const [open, setOpen] = useState(false);
  const { data: highlights, isFetching } = useQuery(
    ['v3-document-highlights', auditLogId],
    () => fetchDocumentHighlights(auditLogId),
    {
      enabled: !!auditLogId && open,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  );

  if (!auditLogId) return null;

  const sourceUrl = `/api/v3/documents/${auditLogId}/source`;
  const isPdf = (format || '').toLowerCase() === 'pdf';
  const ruleRows = highlights?.rules || [];
  const predikatRows = highlights?.predikates || [];

  return (
    <SourceDocSection>
      <SourceDocHeader>
        <span>
          Kildedokument · {highlights?.filename || 'uploaded fil'}
          {highlights?.page_count ? ` · ${highlights.page_count} side(r)` : ''}
        </span>
        <SourceDocToggle type="button" onClick={() => setOpen((v) => !v)}>
          {open ? 'Skjul kilde' : 'Vis kilde + bevis'}
        </SourceDocToggle>
      </SourceDocHeader>

      {!open && (
        <span style={{ fontFamily: 'inherit', fontSize: '0.86rem', color: 'inherit', fontStyle: 'italic', opacity: 0.75 }}>
          Klik "Vis kilde" for at se det originale dokument med side-numre per regel og predikat.
        </span>
      )}

      {open && (
        <SourceDocLayout>
          {isPdf ? (
            <SourceDocFrame
              src={sourceUrl}
              title="Kildedokument"
            />
          ) : (
            <SourceDocFrame
              as="div"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontStyle: 'italic',
              }}
            >
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                Download {highlights?.filename || 'kildefil'} (DOCX kan ikke vises inline)
              </a>
            </SourceDocFrame>
          )}

          <SourceDocSidebar>
            {isFetching && <div>Henter bevis-data…</div>}

            {!isFetching && ruleRows.length === 0 && predikatRows.length === 0 && (
              <div style={{ fontStyle: 'italic', color: '#888' }}>
                Ingen regler eller predikater er kortlagt til specifikke sider — dokumentet
                udløste ingen krav, eller LLM-extractoren fandt ikke nok signal.
              </div>
            )}

            {ruleRows.map((r) => (
              <SourceDocRow key={r.rule_id}>
                <div className="rid">{r.rule_id}</div>
                <div className="pages">
                  {r.pages.length > 0
                    ? `Side ${r.pages.join(', ')}`
                    : 'Ingen side fundet'}
                </div>
                {r.chunks?.[0]?.preview && (
                  <div className="preview">"{r.chunks[0].preview}"</div>
                )}
              </SourceDocRow>
            ))}

            {predikatRows.length > 0 && (
              <div style={{ marginTop: '0.6rem', fontWeight: 600, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888' }}>
                Predikat-bevis
              </div>
            )}
            {predikatRows.map((p) => (
              <SourceDocRow key={p.predikat_id}>
                <div className="rid">{p.predikat_id}</div>
                <div className="pages">
                  Værdi: {String(p.value)}
                  {p.pages.length > 0 && ` · side ${p.pages.join(', ')}`}
                </div>
              </SourceDocRow>
            ))}
          </SourceDocSidebar>
        </SourceDocLayout>
      )}
    </SourceDocSection>
  );
};

const buildEvidenceItems = (decisions, statusMap = {}) => {
  const all = new Set();
  decisions.forEach((d) => {
    (d.outcome?.evidens_påkrævet || []).forEach((e) => all.add(e));
  });
  return Array.from(all).map((id) => ({
    id,
    label: id.replace(/_/g, ' '),
    status: statusMap[id]?.status || 'pending',
    metadata: statusMap[id]?.metadata,
  }));
};

const ruleHumanTitle = (decision) => {
  // Fall back to artikel + lov when no nicer title is available.
  if (decision?.kilde?.artikel) {
    return `${decision.kilde.lov ? decision.kilde.lov + ' — ' : ''}${decision.kilde.artikel}`;
  }
  return decision?.rule_id || 'Ukendt regel';
};

// Noise-warning filter is shared with VurderingHistorikPage —
// imported above to avoid duplication.

// Derive a human-readable case title from the description's first sentence.
const deriveTitle = (description, caseId) => {
  if (description) {
    const first = description.split(/\.|\n/)[0].trim();
    if (first.length > 0 && first.length < 120) {
      return first.charAt(0).toUpperCase() + first.slice(1);
    }
  }
  return caseId ? `Vurdering ${caseId}` : 'Vurdering';
};

const STATUS_LABELS = {
  GO: 'GO',
  'BETINGET-GO': 'Betinget GO',
  'NO-GO': 'NO-GO',
  NEEDS_INPUT: 'Mangler input',
};
const statusLabel = (s) => STATUS_LABELS[s] || s || 'Mangler input';

const formatDanishDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
};

// ---- Page ---------------------------------------------------------------

const V3VurderingPage = () => {
  const [searchParams] = useSearchParams();
  const caseDbId = searchParams.get('case') || '';
  const [description, setDescription] = useState('');
  const [caseId, setCaseId] = useState('');
  const [note, setNote] = useState('');
  // When an example is loaded, its signals/predicates are sent to the API.
  // For free-form input, we send empty signals/predicates and let the LLM
  // signal-extractor (if configured) infer them from the description.
  const [loadedExample, setLoadedExample] = useState(null);
  const [expandedExplanations, setExpandedExplanations] = useState({});

  const mutation = useMutation(postAssess);
  const documentMutation = useMutation(postDocumentAnalyze);
  // Background fetch of which rules are flagged for juridisk review
  // (citation-verifier output). Used to draw a warning-banner if a
  // *triggered* rule sits on top of a flagged citation.
  const { data: flaggedRuleIds = [] } = useQuery(
    'v3-flagged-rules',
    fetchFlaggedRuleIds,
    { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({
      system_description: description.trim() || undefined,
      signals: loadedExample?.signals || {},
      predicates: loadedExample?.predicates || {},
      use_llm_extraction: !loadedExample,
      case_db_id: caseDbId || undefined,
      case_id: caseId.trim() || undefined,
      note: note.trim() || undefined,
    });
  };

  const handleFileDrop = (file) => {
    if (!file) return;
    documentMutation.mutate({
      file,
      caseDbId: caseDbId || undefined,
      caseId: caseId.trim() || undefined,
      note: note.trim() || `Document analysis: ${file.name}`,
    });
  };

  const onFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileDrop(file);
  };

  const loadExample = (ex) => {
    setDescription(ex.description);
    setCaseId(ex.case_id);
    setNote(ex.note);
    setLoadedExample(ex);
  };

  const clearExample = () => {
    setDescription('');
    setCaseId('');
    setNote('');
    setLoadedExample(null);
  };

  const resetAll = () => {
    mutation.reset();
    documentMutation.reset();
  };

  const toggleExplanation = (id) => {
    setExpandedExplanations((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Result is either from /api/v3/assess (form) or /api/v3/document/analyze
  // (drop-zone). Both endpoints return decisions/aggregate_status/audit.
  const result = documentMutation.data || mutation.data;
  const isDocumentResult = !!documentMutation.data;
  const decisions = useMemo(
    () => (result?.decisions || []).filter((d) => d.triggered),
    [result],
  );
  // Only show rules that actually require something — GO triggers (rules
  // that evaluated but resolved to "no krav") clutter the page without
  // adding value to a sagsbehandler reading the verdict.
  const requiringDecisions = useMemo(
    () => decisions.filter((d) => d.status === 'BETINGET-GO' || d.status === 'NO-GO'),
    [decisions],
  );
  const evidenceItems = useMemo(
    () => buildEvidenceItems(requiringDecisions),
    [requiringDecisions],
  );
  const totalKrav = requiringDecisions.reduce(
    (sum, d) => sum + (d.outcome?.krav?.length || 0),
    0,
  );

  // Build sidenotes only for requiring decisions (citations for rules
  // the reader needs to action, not advisory ones).
  const sidenotes = useMemo(
    () =>
      requiringDecisions
        .filter((d) => d.kilde)
        .map((d) => ({
          id: d.rule_id,
          citat: d.kilde.citat,
          lov: d.kilde.lov,
          artikel: d.kilde.artikel,
          url: d.kilde.url,
          sidst_verificeret: d.kilde.sidst_verificeret,
        })),
    [requiringDecisions],
  );

  // Result mode: the form is hidden entirely, replaced by a case-focused
  // document layout. The user can still trigger a new assessment via the
  // "Ny vurdering" back-link. Enter result-mode for ANY successful response
  // — including GO (0 triggered) — so the user sees what was evaluated.
  const hasResult = !!result;

  // Filter out infrastructure/config noise warnings — only show warnings
  // that are relevant to the legal output.
  const relevantWarnings = filterNoiseWarnings(result?.warnings || []);

  // Derive case display fields. For document-mode, fall back to the
  // filename if no description was provided.
  const displayTitle = isDocumentResult && result?.filename
    ? result.filename.replace(/\.(pdf|docx)$/i, '')
    : deriveTitle(description, caseId);
  const displayCaseId = caseId || (result?.audit_log_id ? result.audit_log_id.slice(0, 8) : '');
  const evaluatedDate = formatDanishDate(result?.evaluated_at);

  // ----- FORM MODE -----
  if (!hasResult) {
    return (
      <Page>
        <Eyebrow>S.H.I.E.L.D. · juridisk screening</Eyebrow>
        <Title>Indledende juridisk screening</Title>
        <Lede>
          Beskriv den planlagte AI-løsning, eller upload et dokument. Screeningen
          peger på relevante regelkrav og viser de kilder, reglerne bygger på.
          Brug resultatet til den første afklaring med jura. Det erstatter ikke
          konsekvensanalysen eller en faglig godkendelse.
        </Lede>

        <DropZone $active={documentMutation.isLoading}>
          <input
            type="file"
            aria-label="Dokument til juridisk screening"
            accept=".pdf,.docx"
            onChange={onFileInputChange}
            disabled={documentMutation.isLoading}
          />
          <DropIcon aria-hidden="true" />
          <div>
            <DropTitle>
              {documentMutation.isLoading
                ? 'Analyserer dokument…'
                : 'Upload kontrakt, DPIA eller policy'}
            </DropTitle>
            <DropHint>
              Træk en PDF eller DOCX hertil — eller klik for at vælge en fil.
              AI udleder oplysninger fra teksten, som kontrolleres mod regelgrundlaget.
              Du skal gennemgå de udledte oplysninger og konklusionen.
            </DropHint>
            <DropMeta>
              .pdf · .docx · max 10 MB · tekst skal være søgbar (ikke scannet billede)
            </DropMeta>
          </div>
        </DropZone>

        {documentMutation.isError && (
          <ErrorBox>
            Dokument-analyse fejlede:{' '}
            {String(
              documentMutation.error?.response?.data?.detail ||
                documentMutation.error?.message ||
                documentMutation.error,
            )}
          </ErrorBox>
        )}

        <FormCard onSubmit={handleSubmit}>
          <Label htmlFor="desc">Beskriv systemet</Label>
          <TextArea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Fx: chatbot der hjælper borgere med pension, foretager profilering og afgørelser…"
          />

          <MetaRow>
            <MetaField>
              <Label htmlFor="caseId">Sags-ID (valgfrit)</Label>
              <Input
                id="caseId"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                placeholder="K-2026-…"
              />
            </MetaField>
            <MetaField>
              <Label htmlFor="note">Note (valgfri)</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Fx: pilot-vurdering, opdatering efter modeludskift…"
              />
            </MetaField>
          </MetaRow>

          <Controls>
            <PrimaryButton type="submit" disabled={mutation.isLoading}>
              {mutation.isLoading ? 'Vurderer…' : 'Vurder'}
            </PrimaryButton>
            {loadedExample && (
              <SecondaryButton type="button" onClick={clearExample}>
                Ryd eksempel
              </SecondaryButton>
            )}
            {loadedExample && (
              <ToggleRow as="span" style={{ marginLeft: 'auto', cursor: 'default' }}>
                Eksempel indlæst: <strong style={{ marginLeft: 4, color: STATUS_PILL_FG[loadedExample.status] }}>
                  {loadedExample.status}
                </strong>
              </ToggleRow>
            )}
          </Controls>
        </FormCard>

        {mutation.isError && (
          <ErrorBox>
            Kunne ikke kalde /api/v3/assess: {String(mutation.error?.message || mutation.error)}
          </ErrorBox>
        )}

        {result && !hasResult && (
          <Empty>
            Vurderingen returnerede status <strong>{result.aggregate_status}</strong>. Ingen regler udløste krav for denne case.
          </Empty>
        )}

        <ExamplesPanel>
          <ExamplesHeader>
            <ExamplesTitle>Eksempler — pilot-vurderinger</ExamplesTitle>
            <ExamplesLede>
              Tre konkrete cases som de kunne se ud, hvis en sagsbehandler havde
              udfyldt formularen. Klik <strong>Indsæt</strong> for at hente ind, eller
              fold forklaringen ud for at se hvorfor reglerne ender på det resultat.
            </ExamplesLede>
          </ExamplesHeader>

          <ExamplesGrid>
            {EXAMPLES.map((ex) => {
              const expanded = !!expandedExplanations[ex.id];
              const isActive = loadedExample?.id === ex.id;
              return (
                <ExampleCard key={ex.id} $status={ex.status} $active={isActive}>
                  <ExamplePill $status={ex.status}>{ex.status}</ExamplePill>
                  <ExampleTitle>{ex.title}</ExampleTitle>
                  <ExampleSummary>{ex.summary}</ExampleSummary>
                  <ExampleActions>
                    <ExampleLoadButton type="button" onClick={() => loadExample(ex)}>
                      {isActive ? 'Indlæst ✓' : 'Indsæt'}
                    </ExampleLoadButton>
                    <ExampleExplainToggle
                      type="button"
                      onClick={() => toggleExplanation(ex.id)}
                      aria-expanded={expanded}
                    >
                      {expanded ? '▾ Skjul forklaring' : '▸ Hvorfor?'}
                    </ExampleExplainToggle>
                  </ExampleActions>
                  {expanded && (
                    <ExampleExplanation $status={ex.status}>
                      {ex.explanation}
                    </ExampleExplanation>
                  )}
                </ExampleCard>
              );
            })}
          </ExamplesGrid>
        </ExamplesPanel>
      </Page>
    );
  }

  // ----- RESULT MODE -----
  return (
    <Page>
      <Shell>
        <Doc>
          <BackLink type="button" onClick={resetAll}>
            ← Ny vurdering
          </BackLink>

          <Breadcrumb>
            <span>Sager</span>
            <span className="crumb-sep">/</span>
            <span>{displayTitle}</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">Vurdering</span>
          </Breadcrumb>

          {displayCaseId && <CaseId>Sag {displayCaseId}</CaseId>}
          <CaseTitle>{displayTitle}</CaseTitle>
          <CaseMeta>
            {note && <>{note} · </>}
            {evaluatedDate && <>Vurderet {evaluatedDate}</>}
            {evaluatedDate && ' · '}
            rule_engine {result.rule_engine_version}
          </CaseMeta>

          {relevantWarnings.length > 0 && (
            <Warnings>
              <strong>Bemærkninger:</strong>
              <ul>
                {relevantWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Warnings>
          )}

          {(() => {
            const triggeredFlagged = decisions
              .filter((d) => flaggedRuleIds.includes(d.rule_id))
              .map((d) => d.rule_id);
            if (triggeredFlagged.length === 0) return null;
            return (
              <FlaggedBanner>
                <strong>⚠ Lov-citater kræver juridisk review</strong>
                <p style={{ margin: '0.4rem 0 0' }}>
                  {triggeredFlagged.length === 1
                    ? 'Én af de udløste regler bygger på et lov-citat der ikke kunne verificeres ordret i kilden ved seneste tjek. Verificér manuelt at lovteksten stadig understøtter konklusionen.'
                    : `${triggeredFlagged.length} af de udløste regler bygger på lov-citater der ikke kunne verificeres ordret i kilden ved seneste tjek. Verificér manuelt at lovteksten stadig understøtter konklusionen.`}
                  {' '}
                  <a href="/lov-overvaagning">Se status →</a>
                </p>
                <ul>
                  {triggeredFlagged.map((rid) => <li key={rid}>{rid}</li>)}
                </ul>
              </FlaggedBanner>
            );
          })()}

          <VerdictBanner $status={result.aggregate_status}>
            <VerdictPill $status={result.aggregate_status}>{statusLabel(result.aggregate_status)}</VerdictPill>
            <div>
              <VerdictStatus>Samlet vurdering</VerdictStatus>
              <VerdictText>
                {result.aggregate_status === 'GO' && (
                  <>
                    Ingen lovartikler udløser krav før idriftsættelse — systemet kan
                    tages i brug uden særlige compliance-tiltag.
                  </>
                )}
                {result.aggregate_status === 'BETINGET-GO' && (
                  <>
                    <b>{requiringDecisions.length} af {result.rules_loaded}</b> lovartikler udløser krav før idriftsættelse.
                    {evidenceItems.length > 0 && (
                      <> {evidenceItems.length} konkrete artefakter skal etableres; {totalKrav} dokumentationskrav skal opfyldes.</>
                    )}
                  </>
                )}
                {result.aggregate_status === 'NO-GO' && (
                  <>
                    Systemet er klassificeret som <b>forbudt praksis</b>. {requiringDecisions.length} regler giver NO-GO eller udløser krav. Systemet kan ikke idriftsættes i sin nuværende form.
                  </>
                )}
              </VerdictText>
            </div>
            {result.aggregate_status === 'BETINGET-GO' && requiringDecisions.length > 0 && (
              <VerdictMetric>
                <span className="number">{requiringDecisions.length}/{result.rules_loaded}</span>
                Regler udløst
              </VerdictMetric>
            )}
            {result.aggregate_status === 'GO' && (
              <VerdictMetric>
                <span className="number">{result.rules_loaded}</span>
                Regler evalueret
              </VerdictMetric>
            )}
            {result.aggregate_status === 'NO-GO' && (
              <VerdictMetric>
                <span className="number">{requiringDecisions.length}</span>
                Blokerende regler
              </VerdictMetric>
            )}
          </VerdictBanner>

            {isDocumentResult && Object.keys(result.extracted_predicates || {}).length > 0 && (
              <ChunksSection>
                <ChunksHeader>
                  LLM-udtrukne predikater · {Object.keys(result.extracted_predicates).length} felter (M1.5)
                </ChunksHeader>
                <ChunkItem>
                  <span style={{ display: 'block', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                    Disse predikat-svar er udtrukket fra dokumentet af LLM som best-effort.
                    Sagsbehandler bør verificere de mest kritiske felter (helbredsdata,
                    retsgrundlag, automatisering) manuelt før idriftsættelse.
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem 1rem', marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                    {Object.entries(result.extracted_predicates).map(([k, v]) => (
                      <span key={k}><strong>{k}</strong> = {String(v)}</span>
                    ))}
                  </div>
                </ChunkItem>
              </ChunksSection>
            )}

            {isDocumentResult && result.chunks?.length > 0 && (
              <ChunksSection>
                <ChunksHeader>
                  Dokument-afsnit · {result.format?.toUpperCase()} · {result.chunk_count} chunk(s)
                </ChunksHeader>
                {result.chunks.map((c) => (
                  <ChunkItem key={c.index}>
                    <span className="label">{c.label}</span>
                    {c.triggered_rules?.length > 0
                      ? `udløser ${c.triggered_rules.length} regel(er)`
                      : 'ingen regler udløst'}
                    <div className="preview">"{c.preview}"</div>
                    {c.triggered_rules?.length > 0 && (
                      <div className="rules">
                        {c.triggered_rules.join(' · ')}
                      </div>
                    )}
                  </ChunkItem>
                ))}
              </ChunksSection>
            )}

            {isDocumentResult && result.audit_log_id && (
              <SourceDocViewer
                auditLogId={result.audit_log_id}
                format={result.format}
              />
            )}

            {requiringDecisions.length > 0 && (
              <>
                <SectionH>Vurderingens grundlag</SectionH>
                <SectionLede>
                  {requiringDecisions.length === 1
                    ? 'Én lovartikel udløser krav. Læs grundlaget her — kilden står i marginen til højre.'
                    : `${requiringDecisions.length} lovartikler regulerer tilsammen denne anvendelse. Hvert grundlag begrundes i sin egen sammenhæng — kilde-citatet står i marginen til højre.`}
                </SectionLede>

                {requiringDecisions.map((decision, idx) => {
                  const num = idx + 1;
                  const fnSup = toSuperscript(num);
                  return (
                    <Rule key={decision.rule_id} $num={String(num).padStart(2, '0')}>
                      <RuleHead>
                        <RuleMarker>Lovartikel {num} af {requiringDecisions.length}</RuleMarker>
                        <ComplianceVerdict status={decision.status || 'NEEDS_INPUT'} size="sm" />
                      </RuleHead>
                      <RuleTitle>
                        {ruleHumanTitle(decision)}
                        <FootnoteRef href={`#sn${num}`}>{fnSup}</FootnoteRef>
                      </RuleTitle>

                      {decision.outcome?.begrundelse && (
                        <RuleBody>
                          {decision.outcome.begrundelse}
                          <FootnoteRef href={`#sn${num}`}>{fnSup}</FootnoteRef>
                        </RuleBody>
                      )}

                      {decision.outcome?.krav && decision.outcome.krav.length > 0 && (
                        <KravBlock>
                          <KravHeader>
                            Krav for compliance
                            <span className="count">{decision.outcome.krav.length}</span>
                          </KravHeader>
                          <KravList>
                            {decision.outcome.krav.map((krav, i) => (
                              <KravItem key={i}>
                                <span>{krav}</span>
                              </KravItem>
                            ))}
                          </KravList>
                        </KravBlock>
                      )}

                      {decision.needs_input && decision.needs_input.length > 0 && (
                        <NeedsInputBox>
                          <strong>Mangler svar på {decision.needs_input.length} predikat(er):</strong>
                          <ul>
                            {decision.needs_input.map((pid) => (
                              <li key={pid}>{pid}</li>
                            ))}
                          </ul>
                        </NeedsInputBox>
                      )}
                    </Rule>
                  );
                })}
              </>
            )}

            {evidenceItems.length > 0 && (
              <>
                <SectionH>Evidens-checkliste</SectionH>
                <SectionLede>
                  {evidenceItems.length} artefakter er identificeret på tværs af de ramte regler.
                </SectionLede>
                <EvidenceChecklist items={evidenceItems} />
              </>
            )}

            <AuditFootnote>
              <b>Audit-spor</b>
              <br />
              rule_engine {result.rule_engine_version} · evalueret {result.evaluated_at}
              <br />
              rules_loaded={result.rules_loaded} · triggered={decisions.length} · aggregate=<b>{result.aggregate_status}</b>
              <br />
              deterministisk afgørelse · LLM blev ikke brugt til selve afgørelsen
              {result.audit_log_id && (
                <>
                  <br />
                  audit_log_id: <b>{result.audit_log_id}</b>
                </>
              )}
            </AuditFootnote>
          </Doc>

        <SidenotesColumn notes={sidenotes} />
      </Shell>
      <DataOverview scope="vurdering" />
    </Page>
  );
};

export default V3VurderingPage;
