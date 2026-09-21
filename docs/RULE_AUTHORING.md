# Sådan skriver du en regel — vejledning for jurister

Dette dokument er til dig der skal skrive en compliance-regel uden at skulle skrive Python-kode. En regel er en YAML-fil under `rules/<lovområde>/` der binder en konkret lovartikel sammen med:

1. **Hvornår reglen overhovedet er relevant** (trigger)
2. **Hvilke spørgsmål sagsbehandleren skal svare på** (predikater)
3. **Hvilken konklusion (GO / BETINGET-GO / NO-GO) der følger af svarene** (afgørelse)

Selve afgørelsen er deterministisk — det vil sige: samme input giver altid samme svar, og en LLM kan ikke ændre status fra `BETINGET-GO` til `GO`. LLM'en assisterer kun med at fortolke fritekst-beskrivelser til de signaler reglen lytter efter.

## Mappe-struktur

```
rules/
├── _schema.json                   # Maskine-validering (rør ikke)
├── ai_act/                        # EU AI Act
├── gdpr/                          # Databeskyttelsesforordningen
├── forvaltningsloven/             # Forvaltningsloven
├── offentlighedsloven/            # Offentlighedsloven
└── sektorlove/                    # Serviceloven, beskæftigelseslov, sundhedslov m.fl.
```

Læg din nye regel i den mappe der bedst svarer til kilden. Filer der starter med `_` (fx `_draft.yaml`) bliver IKKE indlæst — brug det til kladder.

## Skabelon

```yaml
id: <lov>.<artikel>.<kort_emne>
kilde:
  lov: "<Lovens fulde navn med eventuel forordnings-/bekendtgørelses-nummer>"
  artikel: "<Artikel- eller paragraf-reference>"
  citat: "<Direkte citat fra lovteksten der hjemler reglen>"
  url: "<Officiel URL: EUR-Lex eller Retsinformation>"
  sidst_verificeret: "YYYY-MM-DD"

trigger:
  any_of:
    - signal: <signal.identifier>
    # eller all_of: hvis flere skal være sande samtidigt

predikater:
  - id: <kort_id>
    spørgsmål: "<Det faktiske spørgsmål til sagsbehandleren>"
    type: boolean        # eller enum (kræver enum_values)
    hjælp: "<Valgfri hjælpetekst — gerne med EDPB- eller datatilsyn-vejledning>"

afgørelse:
  hvis: "<boolean-udtryk over predikat-id'er>"
  så:
    status: BETINGET-GO  # eller GO eller NO-GO
    begrundelse: "<Kort forklaring til brugeren>"
    krav:
      - "<Konkret krav 1>"
      - "<Konkret krav 2>"
    evidens_påkrævet:
      - <evidens_id_1>
      - <evidens_id_2>
  ellers:                # valgfri "hvis ikke"-gren
    status: GO
    begrundelse: "<...>"
    krav: []
    evidens_påkrævet: []

llm_fortolkning:        # valgfri — kun hvis fritekst-input giver mening
  rolle: "<Hvad må LLM'en — og hvad må den IKKE>"
  prompt_template: |
    <Template med {placeholders}>

metadata:
  forfatter: "<dit navn>"
  version: "1.0.0"
  tags: [...]
```

## Felt for felt

### `id`
Unik dotted-id'er på formen `<lov>.<artikel>.<emne>`, fx `gdpr.art22.automatiseret_individuel_afgorelse`. Kun små bogstaver, tal og underscore. Mindst 3 dele adskilt af punktum.

### `kilde`
Det vigtigste felt. **Hver afgørelse vises sammen med kilde-objektet til både sagsbehandler og auditor**, så det skal være hjemlet og opdateret.

- **`lov`** — fulde navn. Eksempler: "Forordning 2024/1689 (EU AI Act)", "Forvaltningsloven (lovbekendtgørelse nr. 433 af 22. april 2014 med senere ændringer)".
- **`artikel`** — så præcist som muligt: "Artikel 22, stk. 1", "§ 22", "§ 24, stk. 2".
- **`citat`** — direkte citat fra lovteksten. Mindst 10 tegn. Brug ikke ellipsis (...) hvis det forvansker meningen.
- **`url`** — officiel kilde. Foretrukne domæner: `eur-lex.europa.eu`, `retsinformation.dk`. Brug deep-link til artiklen hvis muligt (`#art_22`).
- **`sidst_verificeret`** — den dato du har verificeret citatet mod kilden. ISO-format. Opdaterer du citatet, opdater også datoen.

### `trigger`
Hvornår skal denne regel overhovedet evalueres? Du angiver en eller flere **signaler** — det er korte identifikatorer som `system.outputs_decision_about_person`. Listen over signaler er fælles på tværs af alle regler og dokumenteres i `docs/SIGNALS.md` (kommer i Fase 1).

- `any_of`: mindst ét signal skal være sandt
- `all_of`: alle signaler skal være sande

Brug `any_of` med mindre du virkelig mener at flere uafhængige forhold skal være sande samtidigt.

### `predikater`
De spørgsmål sagsbehandleren skal svare på. Hvert predikat har et lokalt id der bruges i `afgørelse.hvis`.

- **`type: boolean`** — ja/nej
- **`type: enum`** — flere mulige værdier; angiv `enum_values: [val_a, val_b, ...]`
- **`type: text`** og **`type: number`** — IKKE direkte brugbare i `afgørelse.hvis` (de bruges kun til dokumentation/eksport)

Skriv predikater så de kan besvares uden juridisk fortolkning hvis muligt — eller giv solid `hjælp` der peger på den fortolkningskilde du forventer (EDPB Guidelines, Datatilsynets vejledning, Højesteretsdom).

### `afgørelse.hvis`
Et boolean-udtryk over predikat-id'erne. Tilladte operatorer:

| Operator | Betydning |
|---|---|
| `AND` | begge skal være sande |
| `OR` | mindst én skal være sand |
| `NOT` | inverter |
| `==` | enum-predikat lig værdi |
| `!=` | enum-predikat ulig værdi |
| `( )` | gruppering |

`AND` binder tættere end `OR`. Eksempler:

```yaml
hvis: "er_helautomatiseret AND har_retsvirkning_eller_betydelig_paavirkning"
hvis: "anvendelsesomraade != intet_af_ovenstaaende AND (NOT kun_forberedende OR profilering)"
hvis: "traeffer_afgoerelse AND meddeles_skriftligt AND NOT fuld_medhold"
```

`==` og `!=` kan **kun** stå med et enum-predikat på venstre side. Højresiden er en bareword (uden anførselstegn): den værdi du sammenligner med, fx `intet_af_ovenstaaende` eller `samtykke`.

### `afgørelse.så` og `afgørelse.ellers`
- `så` (påkrævet) bruges når `hvis`-udtrykket er sandt
- `ellers` (valgfri) bruges når det er falsk
- Hvis du udelader `ellers`, betyder det "denne regel udløser ikke en afgørelse i den situation"

`status` skal være præcis én af: `GO`, `BETINGET-GO`, `NO-GO`.

`krav` er konkrete handlinger sagsbehandleren skal foretage. Skriv dem som imperativer.

`evidens_påkrævet` er identifikatorer for dokumenter/artefakter — disse samles på tværs af alle ramte regler i en samlet evidens-checkliste.

### `llm_fortolkning`
Valgfri. Hvis sat, bruges den i Fase 1 til at hjælpe LLM'en med at læse en fritekst-beskrivelse og foreslå hvilke trigger-signaler der matcher. **LLM'en må aldrig ændre selve afgørelsen.**

Skriv `rolle` så den er restriktiv: hvad LLM'en MÅ foreslå, og hvad den IKKE må. `prompt_template` skal returnere ren JSON.

## Verificering

Efter du har skrevet en regel, kør:

```bash
python -m src.rule_engine validate rules/
```

Den fortæller dig om YAML'en er syntaktisk gyldig, om den matcher schema, og om alle predikat-id'er du refererer i `afgørelse.hvis` faktisk er defineret i `predikater`.

Du kan også teste reglen mod et konkret input:

```bash
python -m src.rule_engine evaluate <rule_id> input.json
```

hvor `input.json` har formen:

```json
{
  "signals": {"system.makes_decisions_about_persons": true},
  "predicates": {"er_helautomatiseret": true, "har_retsvirkning_eller_betydelig_paavirkning": true}
}
```

## Test-krav (vores interne baseline)

Hver regel skal have mindst 3 test-cases i `tests/rules/test_<lov>_<artikel>.py`:

1. **Trigger-gating** — uden signal er reglen ikke aktiv
2. **Positiv sti** — kanonisk input der rammer `så`-grenen (typisk BETINGET-GO eller NO-GO)
3. **Negativ sti** — kanonisk input der rammer `ellers`-grenen (typisk GO)

Se `tests/rule_engine/test_executor.py` for eksempler på alle tre pilot-regler.

## Hyppige fejl

| Fejl | Årsag | Løsning |
|---|---|---|
| `decision expression references undefined predicate` | Du bruger et id i `hvis` der ikke er listet under `predikater` | Tjek stavning. Tilføj predikatet eller ret udtrykket. |
| `predicate '<x>' is type=enum but enum_values has <2 entries` | Glemt `enum_values` på et enum-predikat | Tilføj listen med mindst 2 mulige værdier. |
| `at kilde/url: ... is not a 'uri'` | URL'en mangler `https://` eller er forkert format | Brug fuld URL med protokol. |
| `at id: ... pattern` | Reglens id er på forkert format | Skal være `<a>.<b>.<c>` med kun små bogstaver, tal, underscore. |

## Et minimalt komplet eksempel

```yaml
id: forvaltningsloven.par19.partshoring
kilde:
  lov: "Forvaltningsloven (lovbekendtgørelse nr. 433 af 22. april 2014 med senere ændringer)"
  artikel: "§ 19, stk. 1"
  citat: "Kan en part i en sag ikke antages at være bekendt med, at myndigheden er i besiddelse af bestemte oplysninger om en sags faktiske grundlag eller eksterne faglige vurderinger, må der ikke træffes afgørelse, før myndigheden har gjort parten bekendt med oplysningerne eller vurderingerne og givet denne lejlighed til at fremkomme med en udtalelse."
  url: "https://www.retsinformation.dk/eli/lta/2014/433"
  sidst_verificeret: "2026-05-07"

trigger:
  any_of:
    - signal: system.makes_administrative_decisions

predikater:
  - id: bruger_oplysninger_om_part
    spørgsmål: "Anvender systemet faktiske oplysninger eller eksterne faglige vurderinger om parten?"
    type: boolean
  - id: parten_kender_oplysningerne
    spørgsmål: "Kan parten med rimelighed antages at kende oplysningerne på forhånd?"
    type: boolean

afgørelse:
  hvis: "bruger_oplysninger_om_part AND NOT parten_kender_oplysningerne"
  så:
    status: BETINGET-GO
    begrundelse: "Partshøring er påkrævet før afgørelse træffes."
    krav:
      - "Send oplysningerne til parten med rimelig frist for udtalelse"
      - "Dokumentér modtagelse og evt. svar i sagen"
    evidens_påkrævet:
      - partshoringsbrev
      - frist_dokumentation
  ellers:
    status: GO
    begrundelse: "Ingen partshøring påkrævet i denne situation."
```

## Kontakt

Spørgsmål om regelmotorens kapabiliteter eller om hvordan en konkret juridisk situation skal modelleres? Skriv til Tyr core team.
