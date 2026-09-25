# SHIELD v0.9.1 — lyst redesign

Verificeret 24. september 2026. Den godkendte lyse preview-retning er overført til den eksisterende React-applikation med oprindelige SHIELD-farver og Geist-typografi. Previewets fiktive indhold er ikke overført.

## Omfang og bevaring

Login, startside, navigation, søgning, procesoverblik, sagsfaner, oprettelsesformular, konsekvensanalyse og risikovurdering har fået fælles afrundede kontroller, paneler og roligere afstande. Ingen ripple-effekt eller dekorativ baggrundsanimation. Den eksisterende brugerpræference for mørkt tema er bevaret.

Backend, database, API-kontrakter, adgangsroller, modelopsætning og vurderingsindhold er uændret. Datakilder, handlers og arbejdsgange er bevaret; login/startside har også præsentationsændringer i JSX. Foranstaltninger, versioner, JEV-kontrol, dokumentation, historik, godkendelse og eksport er fortsat tilgængelige.

## Kontrol

| Kontrol | Resultat |
| --- | --- |
| Frontend regression | 418 af 418 tests bestået i 44 suiter. |
| Produktionsbuild | Bestået; eksisterende lintadvarsler i ældre kode er fortsat til stede. |
| Versionsmetadata | BRAND, begge pakkefiler, lockfil og README stemmer overens på v0.9.1. |
| Login og startside | Parthee, lokal sessionsforklaring, søgning, filtre, sagslister og genveje kontrolleret i browser. |
| Fuzzy søgning | “Krips” finder Krisp under Sager, Vurderinger og Dokumenter; piletast/Enter åbner sagen. |
| Sagsfaner | Alle syv faner på Krisp og relevante faner på Cleardox åbnet uden fejlpaneler eller sideoverløb. |
| Ny AI-løsning | Alle fire trin kan besøges uden at oprette sagen. Indtastning bevares mellem trin. DUBU-katalogforslag og dokumenterede relationsroller vises. |
| Læsevenlig vurdering | Emnevalg, aftalegrundlag, status, kildehenvisninger, forbehold og anbefalinger bevares. |
| Eksport | Word og Excel for både Krisp og Cleardox returnerede HTTP 200 og gyldige Office/ZIP-filer. Browserens download-event blev ikke pålideligt fanget; filvalideringen er foretaget på de samme eksportendpoints via frontend-proxyen. |
| Responsivitet | Kontrolleret ved 1440, 1120, 390 og 320 px. Ingen vandret sideoverløb på de undersøgte sider. Mobilmenuens sidste handling kan nås via intern rulning. |
| Øvrige sider | Dokumentbank, juridisk arbejdsrum og vidensbase åbnet på mobil uden fejlpaneler. |
| Tema | Lys standard bevaret; eksisterende mørkt tema kan vælges og skiftes tilbage. |
| Drift | Readiness for database, vurderingslager og skabelon er OK. Lokal frontend og eksisterende private Tailscale-adresse serverer det nye build; v0.9.1 er verificeret i den faktiske brugerflade. |

## Rettelser fra gennemgangen

- Headerens dropdown placeres nu under den faktiske header. Mobilnavigation bruges også ved mellembredde for at give plads til alle handlinger.
- En eksisterende timingfejl i introduktionsguidens fokusretur blev fundet under fuld regression. Fokus, inert og scroll-lås frigives nu synkront ved lukning via useLayoutEffect. Den eksisterende strenge fokustest er uændret og består.

## Drift og afgrænsning

Build og tests er kørt i en lokal cache uden iCloud-pladsholdere, med de ændrede kildefiler fra den eksisterende checkout. Den tidligere frontend er sikkerhedskopieret under brugerens lokale cache, og de gamle hash-navngivne assets er bevaret, så allerede åbne faner kan hente deres eksisterende kode. API-serveren og sagsdatabasen er ikke udskiftet.

Der er ikke kørt en ny betalt AI/JEV-analyse eller gemt nye vurderinger som del af designgennemgangen. Eksisterende regressionstests dækker de uændrede upload-, formular-, vurderings- og godkendelseshandlers; browserkontrollen er ikke en ny juridisk validering af vurderingsindholdet.
