# Tyr — præsentationsnoter

*Til intern fremlæggelse: Digitalisering og IT, juridisk afdeling, ledelse*

**Sidst opdateret:** 7. maj 2026 (alpha.13)

---

## Elevator pitch (30 sek)

Tyr er Kalundborg Kommunes interne AI-compliance-platform. Hver vurdering hjemles i en konkret lovartikel — ordret citat, dagligt verificeret mod kilden, deterministisk regelmotor. Sagsbehandlere kan beskrive et AI-system i fri tekst eller uploade en kontrakt; LLM ekstraherer juridisk relevante signaler og predikater; regelmotoren afgør GO / BETINGET-GO / NO-GO med fuld kilde-dokumentation. Workflow-styres som kanban over sagernes livscyklus.

---

## Hvorfor vi bygger det selv (vs. fx ailex.dk)

| Behov | Generisk AI-jurist | Tyr |
|---|---|---|
| Lov-citater | Hentet ad-hoc fra databaser | Hånd-curated YAML-regler med ordret citat + URL |
| Citat-friskhed | Ukendt — beror på indeks | Daglig verificering at citatet stadig findes ordret i kilden |
| Kommunal kontekst | Generisk juridisk analyse | Forvaltningslov + sektorlove (via jurist-input) |
| LLM-rolle | Skriver afgørelsen | LLM må aldrig ændre afgørelse — kun extraherer signaler/predikater |
| Audit-spor | Variabel | Append-only log; hver vurdering kan reproduceres komplet |

**Kerneprincip:** Reglerne er fundamentet. LLM er hjælper, ikke beslutter. Det betyder at en jurist kan sige "denne afgørelse er hjemlet i § 22 stk. 1 og dette er præcis hvad der står" — uden at skulle stole på en black-box.

---

## Den centrale arkitektur (1 minut)

```
[Sagsbehandler]
    |
    v
[Vurdering-side] ----- (a) fritekst eller (b) PDF/DOCX upload
    |
    v
[LLM signal-extractor]    udtrækker hvilke regler der trigges
    |
    v
[LLM predikat-extractor]  udtrækker svar på rule-specifikke spørgsmål (M1.5)
    |
    v
[Deterministisk rule_engine]   kører 15+ YAML-regler mod input
    |
    v
[Audit-log]                 append-only persistering
    |
    v
[Resultat: GO / BETINGET-GO / NO-GO]
    + krav per regel
    + kilde-citat per regel (med direkte EUR-Lex/Retsinformation-link)
    + sidenotes-kolonne med fuld lov-tekst
```

I baggrunden: Citation-Verifier kører dagligt og verificerer at hver regels citat stadig findes ordret i kildens HTML. Hvis ikke, flagges den til juridisk review og sagsbehandleren får et advarsels-banner i resultatet.

---

## Hvad er bygget (alpha.7 → alpha.13)

### alpha.7 — Design C global rebrand
Hele appen er omdesignet til "editorial workspace"-stil: cream-paper baggrund, Lora body, Source Serif Pro display, sidenotes-kolonne for lov-citater. Designvalget er taget for at signalere autoritet og læsbarhed til kommunale jurister.

### alpha.8 — Vurderingshistorik
Append-only audit-log over alle vurderinger. Filtrerbar per status. Klik for fuld reproduktion.

### alpha.9 — Sammenlign-mode + tech debt
Endpoint `/api/v3/compare` der kører både legacy `ComplianceController` og v3 rule_engine på samme input → side-om-side diff. Bruges til at validere at v3 dækker alt før legacy slettes.

### alpha.10 — 3 case-eksempler med foldable forklaringer
Sagsbehandlere kan klikke "Indsæt" på et af tre realistiske eksempler (GO / BETINGET-GO / NO-GO) og se hele flowet med forklaringer på hvorfor reglerne giver det resultat. Lærings-værktøj.

### alpha.11 — M1 Document-analyse
Træk-og-slip PDF eller DOCX ind på vurderings-siden. Backend chunker, kører LLM signal-extraction per chunk, evaluerer regelmotoren mod den samlede signal-mængde. Returnerer aggregeret vurdering plus per-chunk attribution (hvilken side udløste hvilken regel).

### alpha.12 — M2 Sager-kanban + M3 Citation-verifier
- **Sager** (`/sager`) — workflow med 6 statuses, drag-drop mellem kolonner, audit-trail per skift
- **Lov-overvågning** (`/lov-overvaagning`) — daglig job verificerer hver regels citat mod kilde-URL, flagger til juridisk review hvis fejlet, viser warning-banner i vurderinger der bygger på flagget regel

### alpha.13 — M4 forberedelse + M1.5 + Forside-rebrand
- **6 sektorlov-templates** klar til jurist-interview (servicelov §§ 11, 50, 102; beskæftigelseslov §§ 11, 27; sundhedslov § 23). Jurist-pakke i `docs/JURIST_INTERVIEW.md` + `docs/JURIST_BRIEFING.md`
- **M1.5 predikat-extraction** — LLM ekstraherer ikke kun signaler, men også predikat-svar fra dokumenter. Upload alene giver fuld vurdering uden manuelt predikat-step
- **Forside rebranded** til Tyr

---

## Hvad mangler

| Status | Punkt |
|---|---|
| ⏳ Klar til møde | M4 — sektorlov-templates udfyldes med jurist (~2,5 timer fra jurist) |
| ⏸ Afventer beslutning | M5 — Auth + Entra ID SSO (kræver Microsoft tenant + IT-koordinering) |
| ⏸ Afventer M4 + 10-15 test-cases | Sletning af Kategori A backend (~4 800 linjer legacy) |

---

## Tre konkrete demos man kan vise

### Demo 1 — "Hvordan virker en vurdering" (5 min)
1. Åbn `/vurdering`
2. Klik **Indsæt** på "Borgerassistent — pension" (BETINGET-GO eksempel)
3. Klik **Vurder**
4. Vis result-mode: case-titel, breadcrumb, verdict, regler med inline ¹²³ fodnoter, sidenotes-kolonne med lov-citater, audit-spor med audit_log_id
5. Pege på at hver regel har en `Læs kilden →`-knap der går direkte til EUR-Lex

### Demo 2 — "Upload en kontrakt" (3 min)
1. Åbn `/vurdering`
2. Træk en PDF eller DOCX ind i drop-zonen
3. Vis at backend chunker dokumentet og kører LLM-extraction over hver del
4. Vis "LLM-udtrukne predikater"-sektion: 26 felter LLM gættede ud fra dokumentet
5. Vis "Dokument-afsnit"-sektion: hvilken side udløste hvilke regler
6. Pointer: dokument-upload alene giver fuld BETINGET-GO/NO-GO uden at sagsbehandler skal udfylde noget manuelt

### Demo 3 — "Lov-overvågning" (2 min)
1. Åbn `/lov-overvaagning`
2. Vis stat-kort: 2 verificeret, 13 flagget
3. Pointer: 13 flagget fordi EUR-Lex/Retsinformation er JS-renderede SPAs — substring-match finder ikke citatet ordret. Det er en *feature*, ikke en bug: defaulten er "kan ikke verificere → flag for jurist"
4. Klik "Kør verifikation nu" for at vise det er en levende status
5. Naviger til `/vurdering` og kør et eksempel — vis at hvis en triggered regel er flagget, dukker advarsels-banner op

---

## Tre risici værd at nævne (proaktivt)

1. **LLM-fejl** — Vi er afhængige af gemma-4-26b-a4b lokalt eller GPT-4 i Azure. Hvis LLM-ekstraktion er forkert, vurderingen er forkert. Mitigation: deterministisk rule_engine på toppen; LLM kan aldrig ændre afgørelsen, kun feed signaler ind.

2. **Citat-friskhed på SPA-renderede lovsider** — 13/15 regler flagges fordi `httpx` ikke får renderet HTML. Løsning: tilføj Playwright/headless browser i v1.1. Indtil da: jurist skal manuelt verificere én gang om måneden.

3. **Sektorlove mangler** — Servicelov, beskæftigelseslov og sundhedslov er kun templates. Indtil jurist har udfyldt dem, dækker Tyr ikke fuldt ud kommunale sager. Mitigation: tværgående regler (AI Act, GDPR, Forvaltningslov) er allerede aktive og fanger de fleste compliance-problemer.

---

## Spørgsmål man kan forvente

**"Hvorfor ikke bare bruge ChatGPT?"**
ChatGPT kan hallucinere lov-citater. Tyr kan ikke — citaterne er statisk hånd-curated og verificeres dagligt. Vi spilder LLM på det den er god til (læse fritekst og fortolke signaler) og bruger deterministisk kode til det den er dårlig til (juridisk afgørelse).

**"Er det godkendt af DPO/jurist?"**
Reglerne i `rules/`-mappen er forfattet af IT, ikke af jurister endnu. Sektorlovene afventer jurist-interview. Ingen rule er aktiv produktionsmæssigt før jurist har sagt god — `_template_`-prefix i filnavnet skipper dem fra rule-engine indtil aktivering.

**"Hvad sker der når en lov ændres?"**
Citation-Verifier opdager ændringen dagen efter — den kan ikke længere finde det gamle citat. Reglen flages og sagsbehandlere får advarsels-banner. Jurist opdaterer YAML'en og citation-verifier accepterer den nye tekst.

**"Hvor opbevares data?"**
Lokal SQLite under dev. Til produktion: Postgres on-prem hos Kalundborg. LLM-kald kan gå til lokal LM Studio (ingen data forlader maskinen) eller Azure OpenAI (EU West Europe data residency). Aldrig til OpenAI direkte i prod.

**"Hvad koster det at drifte?"**
Backend + database: standard kommunal Linux-server (~50 kr/måned). LLM-kald: hvis Azure OpenAI EU, ~5-10 øre per vurdering (~100 vurderinger/måned = ~10-20 kr). LM Studio på dev-maskine: 0 kr. Total drift: << kr/borger/år.

---

## Kontakt
- Kode: github.com/Parthee-Vijaya/Judge_dredd (privat repo)
- Domæne: Digitalisering og IT (Parthee Vijaya / pavi@kalundborg.dk)
- Juridisk: TODO — kommunens juridiske afdeling efter første jurist-interview
