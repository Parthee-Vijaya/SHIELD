# SHIELD — fælles UI- og layoutregler

Denne fil beskriver den aktuelle SHIELD-brugerflade. Den erstatter det tidligere Tyr-design, som ikke længere svarede til den kørende løsning.

## Identitet og formål

SHIELD samler materiale, dokumenterer faglige afklaringer og udarbejder konsekvensanalyser og risikovurderinger af AI-løsninger og IT-løsninger med AI. Kalundborg-branding bevares, mens sagens egen organisation altid skal fremgå tydeligt. AI-output er et arbejdsgrundlag til menneskelig gennemgang.

Brug eksisterende logoer og farver fra `frontend/src/theme.js`. Den primære farve er teglrød `#bc4d30`, baggrunden `#f5f5f1`, overflader `#fffefb`, teksten `#252525`. Mørkt tema bruger sine egne semantiske farver. Undgå hårdkodede lyse farver i nye komponenter.

## Typografi og mål

- Geist Variable bruges til overskrifter, brødtekst, felter og knapper. Geist Mono bruges kun til tekniske identifikatorer og tilsvarende metadata.
- Sidens ramme og overskrifter følger `frontend/src/theme/layout.js`: maksimalt 1320 px, vandret margen indeni på 32 px, 20 px på mobil og 14 px på helt små skærme.
- H1 er `clamp(2rem, 3.5vw, 2.75rem)`. H2 er 1.5rem. Brug underoverskrifter til at dele teksten op; gør ikke hele afsnit til store overskrifter.
- Primære handlinger og almindelige formularfelter er mindst 44 px høje. Knapper bruger 0.875rem tekst. Små ikonknapper og filterchips kan være mindre, hvis formålet og fokusmarkeringen er tydelige.
- Forside, sagsoversigt, formularer, dokumentbank og faglige værktøjer flugter på samme venstre kant. Lange rapporter og persondatapolitik kan have en smallere intern læsespalte.
- Overskrifter og lange navne skal ombrydes. Flex- og gridbørn skal kunne krympe (`min-width: 0`); skjul ikke nødvendige oplysninger for at undgå overflow.

## Hierarki og funktioner

Startsiden prioriterer søgning, fortsættelse af sager og én tydelig oprettelseshandling. Introduktion og materialehjælp er tilgængelig efter behov. Undgå gentagne statistikfelter eller dekorative kort, som skubber brugerens opgave ned.

Søgning på forsiden og via ⌘K er samme funktion. Resultater opdeles i sager, vurderinger, dokumenter og sider/vejledning. En søgning efter dokumentation er ikke en AI-analyse eller juridisk vurdering.

Der er ét primært indgangsforløb for nye AI-løsninger. Selvstændige vurderinger bevares til eksisterende sager og faglige specialopgaver. Supplerende værktøjer grupperes i fælles arbejdsrum med navne, som beskriver forskellen. Bevar eksisterende sager, URL'er og historik ved sammenlægning.

## Login og ansvar

Loginvisningen låner DGITAs tydelige todeling mellem formål og adgang. Brug SHIELDs egen identitet. Vis kun adgangsmuligheder, der understøttes af den aktuelle installation.

Lokal fremvisning må hedde “Fortsæt som Parthee”, når det er serverens konfigurerede navn. Det må ikke fremstilles som verificeret organisationslogin. Roller og aktøridentitet kommer fra serveren. Historiske aktører må ikke omskrives ved ændring af den lokale profil.

## Formularer og katalog

Katalogfelter skal kunne søges og betjenes med tastatur samt acceptere ukendte navne. Rettighedshaver, databehandler og aftalepart er forskellige roller. Et katalogvalg må ikke tavst erstatte et allerede indtastet leverandørnavn eller opfinde en AI-funktion i et system.

Vis hjælpetekst tæt på feltet, konkrete valideringsfejl og tydelige loading-/tom-/fejltilstande. Brug én main-region pr. side. Bevar formulararbejde ved navigation mellem trin.

## Kontrol før levering

Kontrollér desktop og mobil gennem den faktisk kørende løsning, ikke kun en mockup. Afprøv tastatur, mørkt tema, lange danske navne, søgning, navigation tilbage og reload. Kontrollér synlig produktversion efter build. Nye funktioner skal kunne spores i CHANGELOG, mens private katalogfiler, sagsdata og secrets holdes uden for Git.
