# Sektorlove — placeholder + jurist-spec

Status: **BLOKERET PÅ JURIST-INPUT** (per HANDOFF.md Step 5).

## Kontekst

v3-rule_engine dækker pt. tværgående lovgrundlag:

| Område | Lov | Antal regler |
|---|---|---|
| `ai_act/` | EU AI-forordningen 2024/1689 | 5 |
| `gdpr/` | Databeskyttelsesforordningen 2016/679 | 5 |
| `forvaltningsloven/` | Forvaltningsloven (lbk. 433/2014) | 4 |
| `offentlighedsloven/` | Offentlighedsloven (lov 606/2013) | 1 |

Sektorlove er den **kommune-specifikke** lovgrundlag der gælder afhængigt af, hvilken sektor en AI-vurdering rammer (jobcenter, social, sundhed, beskæftigelse, undervisning).

## Hvad mangler

For at kunne tilføje sektorlove til regelmotoren skal en jurist hos Kalundborg Kommune levere følgende per sektor (~5-10 paragraffer i alt):

### 1. Servicelov (LBK nr. 1089/2025)
**Relevant for:** Børn og Familie, Voksenspecialenheden, Sundhed og Myndighed.

**Spørgsmål til jurist:**
- Hvilke 3-5 paragraffer rammer hyppigst i AI-cases (visitation, indstilling, beslutning om foranstaltning)?
- Er § 11 (kommunal forsørgelsespligt), § 50 (børneundersøgelser), § 102 (særlig støtte til voksne) i scope?
- Hvilke afgørelser er klassisk anke-bare og kræver derfor begrundelses-kontrol?

### 2. Lov om aktiv beskæftigelsesindsats (LBK nr. 701/2024)
**Relevant for:** Jobcenter, Borgerservice (kontanthjælp).

**Spørgsmål til jurist:**
- Hvilke paragraffer styrer profilering af ledige (kontaktforløb, jobplan, visitation til indsats)?
- § 11 (ret/pligt til samtaler), § 27 (jobplan), § 30a (digital selvbetjening) — relevante?
- Hvor er grænsen mellem "AI-assist" og "automatisk afgørelse" i beskæftigelseslov?

### 3. Sundhedslov (LBK nr. 248/2024)
**Relevant for:** Sundhed og Myndighed (triagering, hjælpemidler).

**Spørgsmål til jurist:**
- § 23 (information til patient), § 26 (samtykke), § 41 (videregivelse af helbredsoplysninger)?
- Hvilke AI-cases falder under "diagnose-støtte" (medicinsk udstyr efter MDR/IVDR — ikke service) vs "myndighedsbeslutning" (servicelov)?

## Sådan bidrager juristen

For hver ny regel skal følgende felter udfyldes (samme JSON Schema som de eksisterende — se `../_schema.json`):

```yaml
id: servicelov.par11.kommunal_forsorgelsespligt
kilde:
  lov: "Lov om social service (LBK nr. 1089/2025)"
  artikel: "§ 11"
  citat: "Direkte citat fra lovteksten (1-3 sætninger)"
  url: "https://www.retsinformation.dk/eli/lta/2025/1089"
  sidst_verificeret: "2026-05-07"

trigger:
  any_of:
    - signal: system.makes_decisions_about_persons
    # eller mere specifikt
    - predicate:
        field: sektor
        equals: "social"

predikater:
  - id: visiteres_til_foranstaltning
    spørgsmål: "Træffes afgørelsen om en konkret foranstaltning efter § 11?"
    type: boolean

decision:
  if: "visiteres_til_foranstaltning"
  then:
    status: BETINGET-GO
    krav:
      - "Krav 1 baseret på lovens ordlyd"
      - "Krav 2 ..."
    evidens_påkrævet: ["dokumentation_X", "dokumentation_Y"]
  ellers:
    status: GO

metadata:
  forfatter: "[Jurist-navn]"
  version: "1.0.0"
  tags: ["servicelov", "social", "kommunalt"]
```

## Foreslået arbejdsproces

1. **30-min interview** med jurist hos Kalundborg → identificer top 5-10 paragraffer der hyppigst rammer
2. **Workshop** (~1 time) hvor regelforfatteren (efter `docs/RULE_AUTHORING.md`) sammen med juristen skriver YAML-filer
3. **Test mod casebase** — kør hver ny regel mod `tests/regression/cases.yaml` for at verificere afgørelseslogik
4. **Sign-off** — jurist verificerer citater og sidst_verificeret-dato før release

Når sektorlove er på plads, slettes denne README og erstattes med en `INDEX.md` der oplister de leverede regler.

## Aktuel struktur (templates klar — alpha.13)

```
rules/sektorlove/
├── README.md
├── servicelov/
│   ├── _template_par11_raadgivning.yaml
│   ├── _template_par50_boernefaglig_undersoegelse.yaml
│   └── _template_par102_voksenstoette.yaml
├── beskaeftigelseslov/
│   ├── _template_par11_kontaktforloeb.yaml
│   └── _template_par27_jobplan.yaml
└── sundhedslov/
    └── _template_par23_patientinformation.yaml
```

**Filer med `_template_`-prefix skippes af `RuleLoader`** — regelmotoren ignorerer dem indtil prefix fjernes. Det betyder vi kan have draft-regler i repository uden at de udløses i vurderinger.

## Workflow for jurist-aktivering

1. **Læs** [docs/JURIST_BRIEFING.md](../../docs/JURIST_BRIEFING.md) (5 min)
2. **Mød** med Tyr-team — gennemgå [docs/JURIST_INTERVIEW.md](../../docs/JURIST_INTERVIEW.md)
3. **Udfyld** TODO-felter i hver template:
   - `kilde.citat`: ordret tekst fra paragraffen (min. 10 tegn)
   - `kilde.artikel`: præciser stk./litra/nr.
   - `kilde.sidst_verificeret`: opdater til dagens dato
   - `predikater`: justere/tilføje spørgsmål til sagsbehandler
   - `afgørelse.hvis`: verificer logik
   - `afgørelse.så.krav`: skift TODO-bullets ud med konkrete kommunale krav
   - `metadata.forfatter`: dit navn
4. **Gennemgå** med Tyr-team — vi tester regel-evalueringen mod sample-cases
5. **Aktiver** ved at fjerne `_template_`-prefix fra filnavnet (én ad gangen)
6. **Verificer** at citation-verifier kan finde dit citat i Retsinformation:
   ```
   curl -X POST http://hjemmel-host/api/v3/law/freshness/run
   ```
   Hvis flagget rød, juster citatet til at matche den faktiske webside-tekst.

## Skema-krav

Templates skal være valid YAML der opfylder [`rules/_schema.json`](../_schema.json). De vigtigste krav:

| Felt | Krav |
|---|---|
| `id` | Unik streng på formen `<lovkilde>.par<nummer>.<beskrivelse>` |
| `kilde.citat` | Min. 10 tegn (placeholder OK i template) |
| `kilde.url` | Valid URI |
| `kilde.sidst_verificeret` | ISO-dato YYYY-MM-DD |
| `trigger` | Mindst ét signal eller predicate |
| `predikater[].id` | Lowercase, snake_case |
| `predikater[].type` | `boolean` eller `enum` |
| `afgørelse.hvis` | Boolean expression over predikat-id'er |

Hvis du tilføjer nye predikater eller signal-navne, skal de også føjes til signal-liste i [src/rule_engine/signal_extractor.py](../../src/rule_engine/signal_extractor.py)'s `expected_signals`-mængde — så LLM kan udtrække dem fra fritekst-beskrivelser.

## Spørgekatalog

Per template har jeg forberedt 3-4 specifikke spørgsmål i [docs/JURIST_INTERVIEW.md](../../docs/JURIST_INTERVIEW.md). Læs disse igennem inden mødet så vi kan komme hurtigt igennem alle 6 paragraffer.
