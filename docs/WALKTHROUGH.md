# Tyr — visuel walkthrough

*5 min hands-on tour through alpha.13. Følg med i appen mens du læser.*

**Forudsætninger:**
- Backend kører på `http://localhost:8001`
- Frontend kører på `http://localhost:8090`
- LLM (LM Studio eller Azure OpenAI) er konfigureret i `.env`

---

## Trin 1 — Forside (`/`)

Åbn http://localhost:8090. Du ser:

- **Sidebar venstre:** Tyr-brand med rød prik, "AI-KOMPLIANCE · KALUNDBORG", aktive nav-links
- **Hero:** "Tyr" h1 i Source Serif Pro, badge "Tyr · v3 — kommunal AI-compliance", lede-tekst om hjemling og lov-citater
- **CTA-knapper:** "Start vurdering" (rød) → `/vurdering`, "Sag-overblik" (ghost) → `/sager`
- **Højre version-kort:** version + system-status (backend, database, søgning, LLM)
- **Educational cards nedenunder:** Forbudt AI · GPAI · Højrisiko og menneskeligt tilsyn

> 📸 Screenshot-tip: Resize til 1280×900 for bedst layout. Kalundborg-logoet skal være synligt.

---

## Trin 2 — Vurdering med eksempel (`/vurdering`)

Klik på **Vurdering** i sidebaren.

### Form-mode (når intet resultat)
- Eyebrow "HJEMMEL · V3 RULE_ENGINE"
- Titel "Vurdering"
- Beskriv-formular (ledig)
- Sags-ID + Note felter
- "Vurder"-knap (disabled hvis tom)
- **Drop-zone over formularen:** "Upload kontrakt, DPIA eller policy"
- **Eksempler-panel under formularen** med 3 cards:
  - GO: Internt journalsøgning (grøn pill)
  - BETINGET-GO: Borgerassistent — pension (rød pill)
  - NO-GO: Social scoring af borgere (mørkrød pill)

Klik **Indsæt** på BETINGET-GO-eksemplet. Formularen fyldes ud. Klik **Vurder**.

### Result-mode (efter Vurder)
- Form forsvinder
- "← Ny vurdering" back-link
- Breadcrumb: `Sager / Borgerassistent — pensionsansøgning / Vurdering`
- "SAG K-2026-EX-BETINGET" eyebrow i monospace
- h1: "Borgerassistent — pensionsansøgning" (Source Serif Pro)
- Case-meta: note · vurderet-dato · rule_engine version
- **Verdict-banner** (cream + rød venstre-border): "BETINGET GO" + besked om hvor mange artikler der udløser krav
- **Vurderingens grundlag** sektion med italic lede
- **Lovartikel 1 af N** med statuspille + h3 "EU AI-forordningen — Artikel X¹" med fodnote-marker
- Body i Lora med inline ¹²³ fodnoter
- Krav-block med § bullets i rødt
- **Sidenotes-kolonne højre:** "LOV-KILDER · MARGINALIA" med ¹²³ citater

> 📸 Screenshot-tip: Den fulde højde er ~3000px med 15+ regler. Tag screenshot af top-fold for hovedindtryk.

### Vis fold-out forklaring
Tilbage til form-mode (klik "Ny vurdering"). Klik **▸ Hvorfor?** på et af eksempel-kortene. Forklaringen folder ud — tekst om hvorfor reglerne giver det resultat.

---

## Trin 3 — Upload et dokument

Tilbage på `/vurdering`. Træk filen `tests/fixtures/documents/borgerassistent_pension.docx` ind på drop-zonen — eller klik på drop-zonen for at vælge.

- Drop-zone bliver rød + viser "Analyserer dokument…"
- Backend tager 30-60 sekunder (LLM signal-extraction over chunks + LLM predikat-extraction over triggered rules)
- Result-mode dukker op med:
  - h1 = filnavnet (uden .docx)
  - **LLM-udtrukne predikater** sektion med 20+ felter LLM gættede fra dokumentet
  - **Dokument-afsnit** sektion: "Side 1 udløser N regel(er)"
  - Resten som normal vurdering

> 📸 Screenshot-tip: "LLM-udtrukne predikater"-blokken med to kolonner predicates er den mest unikke feature.

---

## Trin 4 — Sager-kanban (`/sager`)

Klik **Sager** i sidebaren.

- Header: "Sager" h1 + lede + "+ Ny sag"-knap øverst-højre
- 6 kolonner: **Kladde · Vurderet · Remediation · Godkendt · Idriftsat · Arkiveret**
- Hver kolonne har:
  - Status-label i farvet caps (Remediation = rød accent, Godkendt = grøn, etc.)
  - Tæller for antal sager
  - Kort: monospace case_id + serif titel + status-pill + (evt.) review-dato
- **Drag-drop:** træk et kort fra Kladde til Vurderet → POST /transition + audit-trail
- Klik på kort → seneste vurdering i historikken

Klik **+ Ny sag**:
- Modal: Sags-ID + Titel + Note (alle påkrævede)
- Opretter case i kladde-kolonnen

> 📸 Screenshot-tip: 1440px bred for at vise alle 6 kolonner. Sørg for et par kort i Kladde + Vurderet kolonnerne.

---

## Trin 5 — Historik (`/historik`)

Klik **Historik**.

- Filter-chips: Alle / GO / Betinget GO / NO-GO
- "X vurderinger fundet" tæller
- Tabel: Tidspunkt (mono) · Sag (mono case_id + italic note) · Status (pille) · Engine (rule_engine version + antal regler)
- Klik på række → detail-view (samme document-style som vurdering, fuld reproduktion fra audit-log)

Test filter: klik **GO** chip → kun GO-sager. Klik **Alle** for at nulstille.

> 📸 Screenshot-tip: Få mange historik-rækker frem ved at lave 5-10 vurderinger først.

---

## Trin 6 — Lov-overvågning (`/lov-overvaagning`)

Klik **INDSTILLINGER** sektion → **Lov-overvågning**.

- Header: titel + lede om "fitness-funktion"
- **Stat-kort:** Verificeret (grøn) · Flagget (rød) · Ukendt (grå)
- "Kør verifikation nu"-knap (manuel trigger)
- **Tabel:** dot-status · rule_id (mono) + URL + fejlbesked hvis flagget · status-tekst · sidst tjekket

Klik **Kør verifikation nu** → ~30-60 sek arbejde mod EUR-Lex/Retsinformation. Tabellen opdateres med ny status pr. regel.

> 📸 Screenshot-tip: Vis blandet GRØN/RØD så det er tydeligt hvad værktøjet leverer.

### Effekt i Vurdering
Tilbage på `/vurdering`. Lav en vurdering hvor en regel der er flagget (fx ai_act.art14) udløses. I result-mode dukker en **rød advarsels-banner** op:

> ⚠ Lov-citater kræver juridisk review
> N af de udløste regler bygger på lov-citater der ikke kunne verificeres ordret i kilden ved seneste tjek. Verificér manuelt at lovteksten stadig understøtter konklusionen. [Se status →]

---

## Trin 7 — Sammenlign engines (`/sammenlign`)

Klik ⌘K → skriv "sammen" → enter (eller ⌘K → "g c").

- Validation-only side med disclaimer i lede
- Form med beskrivelse + Sammenlign-knap
- Klik **Sammenlign**
- Verdict-banner viser ✓ ENGINES ER ENIGE eller UENIGHED (grøn/rød)
- 2-kolonne grid: v3 rule_engine venstre, Legacy ComplianceController højre
- Hver kolonne: status-pille, engine-version, antal regler, lov-områder, triggered regler

> 📸 Screenshot-tip: Brug et af eksemplerne fra vurdering for at få samme input — så får du sandsynligvis "engines er enige".

---

## Trin 8 — ⌘K command palette + g-shortcuts

Tryk **⌘K** (eller Ctrl+K). Palette åbner med søgefelt.

- Skriv "vur" → ser "Vurdering" + "Vurderingshistorik". Pile-op/ned for valg, Enter for navigation.
- Tryk Esc for at lukke.

**g-prefix shortcuts** (vim-style):
- `g h` → Forsiden
- `g v` → Vurdering
- `g i` → Historik
- `g s` → Sager
- `g c` → Sammenlign

Tryk g, vent < 700ms, tryk anden tast. Skip når du er i et input-felt.

---

## Trin 9 — API endpoints (terminal)

```bash
# Liste regler
curl http://localhost:8001/api/v3/rules | jq '.count'  # 15

# Kør en vurdering
curl -X POST http://localhost:8001/api/v3/assess \
  -H 'Content-Type: application/json' \
  -d '{
    "system_description": "AI-system der profiler borgere",
    "predicates": {"er_helautomatiseret": true}
  }' | jq '.aggregate_status'

# Audit-log
curl 'http://localhost:8001/api/v3/audit?limit=5' | jq '.items[].aggregate_status'

# Citation freshness
curl http://localhost:8001/api/v3/law/freshness | jq '.items | length'

# Cases
curl http://localhost:8001/api/v3/cases | jq '.items[] | {case_id, status}'
```

---

## Hvis noget går galt

| Symptom | Sandsynlig årsag | Løsning |
|---|---|---|
| `/vurdering` er tom | LLM-extraktion timeout | Tjek at LM Studio kører + model er loaded; eller forhøj LM_STUDIO_TIMEOUT i `.env` |
| Citation-verifier flagger ALT | Default — EUR-Lex er JS-rendered | Forventet adfærd indtil v1.1 (Playwright) |
| Sager-kanban er tom | Ingen cases oprettet | Klik "+ Ny sag" eller lad attach_assessment auto-oprette en når du laver en vurdering med case_id |
| Drop-zone reagerer ikke | Filformat | Kun .pdf og .docx accepteres. Max 10 MB. |
| Backend 500 ved /api/v3/document/analyze | Scannet PDF uden tekst | Kør PDF gennem OCR først eller brug DOCX |

---

For at re-skabe screenshots: brug Chrome DevTools → device-mode → 1440×900, eller resize browser-vinduet manuelt. Brug `?compact=true` query-string hvis sidebaren skal foldes (kommer i v1.1).
