# Kontrol af SHIELD v0.10.0

Dato: 25. september 2026. Kontrollen vedrører profilmenu, header, vurderingshistorik og upload af kommunal behovsbeskrivelse oven på det lyse v0.9.1-design.

## Automatiske kontroller

- Frontend: 438 tests i 44 suites bestået.
- Backend: 897 tests bestået med eksternt netværk blokeret. Ingen database-migration nødvendig.
- AI Gateway: 49 tests bestået; TypeScript-kontrol bestået. Modelkald er erstattet af kontrollerede testresultater i tests.
- Produktionsbuild bestået. Versionskontrol og `git diff --check` bestået.
- Den generelle Python-typekontrol har eksisterende baselinefejl; der hævdes ikke en fejlfri samlet mypy-kørsel.

## Browserkontrol

- Profilmenu: søgning, tema, værktøjer, guide og afslut session er samlet under Parthee. Primær navigation bevares på desktop og mobil.
- Header og profilmenu kontrolleret ved 1440, 390 og 320 pixels. Ingen vandret overflow; den lange mobilmenu kan scrolles inden for skærmen.
- Introduktionen på forsiden er åben ved indlæsning.
- Behovsfil valgt på første trin, bevaret ved skift af faneblad, uploadet ved oprettelse og læst igen efter genindlæsning. Tekstudtrækket svarer til den syntetiske fil. Filen vises som kommunens behovsbeskrivelse på både første trin og materialesiden.
- Uploadprøven kørte i en separat SQLite-database og dokumentmappe på localhost:8093/8003. Ingen prøvesag er tilføjet til den aktive sagsdatabase.
- Historik kontrolleret på den eksisterende Tailscale-adresse: Cleardox version 3 med 2 ældre versioner; Krisp version 6 med 5 ældre versioner. Udfoldning, søgning, typefilter og åbning af en konkret ældre vurdering fungerer.
- Gemmetid, sagens oprettelse og registreret starttid vises hver for sig. Ukendt start og aktør vises som ikke registreret; historiske oplysninger opfindes ikke.
- Det gentagne driftsoverblik på historiksiden er fjernet; funktionerne findes fortsat under driftsstatus og de relevante arbejdsrum.

## Databehandling og afgrænsning

Behovsbeskrivelsen lagres som `needs_description` og klassificeres som kommunens behov og planlagte krav. Den kan ikke alene dokumentere leverandøregenskaber eller faktiske driftsforhold. Klassifikationen følger kildegrundlag og Word-/Excel-eksport. Opdateret grundlag kræver ny analyse og menneskelig gennemgang.

Fejlforløb dækker delvis upload, genforsøg uden dubleret sag, skift af sag mens en forespørgsel kører samt bevarelse af resterende filer efter indlæsningsfejl.

Der er ikke kørt en ny betalt GPT-/JEV-analyse i denne ændringsrunde. Live readiness kontrollerer database, DPIA-lagring og skabelon. De eksisterende sagsdata og rapportversioner er bevaret.
