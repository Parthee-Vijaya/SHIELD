# Verifikation af SHIELD v0.7.3

Kontroldato: **21. september 2026**.

## Det kontrollerede forløb

- Den eksisterende arbejdsversion blev kontrolleret med 581 backendtests, 201 frontendtests og 27 AI Gateway-kontrakttests samt AI-typekontrol.
- SHIELD blev oprettet som et separat repository med den aktuelle kode. Den gamle Git-historik og lokale databaser, uploads, rapporter, nøgler og runtimefiler indgår ikke.
- Personlige standardoplysninger for udviklingslogin og mail blev fjernet i SHIELD. Tre yderligere regressionstests kontrollerer generisk udviklingsidentitet og at manglende mailkonfiguration ikke opretter en SMTP-forbindelse. Disse tests og de relevante adgangs- og sagskontroller bestod (21 tests).
- Repositoryets eneste npm-lockfil ligger i roden og dækker begge workspaces. Den er med i Git, så installationen kan gentages med `npm ci`.
- Otte skærmbilleder blev taget direkte i den kørende brugerflade og gennemgået visuelt: startside, procesoverblik, dokumentgrundlag, resumé, risici, anbefalinger, upload og JEV-kontrol.
- Den viste Krisp-vurdering blev før publiceringen udarbejdet med en faktisk lokal Sol-kørsel og kontrolleret med faktiske JEV-kald. Det er ikke et nyt modelkald udført som del af repositoryets automatiske tests. Rapporten står fortsat til faglig gennemgang.
- Word og Excel for den viste vurdering blev kontrolleret separat: 56 Word-sider uden konstateret tekstoverløb eller tomme sider; Excel åbnet med 9 ark og 144 formler. Dokumenterne og den tilhørende database publiceres ikke i Git.

## Verifikation af den nye kopi

- Frisk `npm ci` gennemført. Frontendens TypeScript er fastlåst til 4.9.5 af hensyn til CRA 5; AI Gateway beholder sin separate TypeScript 7.0.2. ESLint er fortsat aktiv med ES2020-miljø.
- `npm run build:frontend`: bestået. Der er eksisterende lintadvarsler om ubrugte symboler og hooks.
- Hele frontendpakken: 201 tests bestået. En timingfølsom tutorial-test fejlede først under samtidig build-belastning; den efterfølgende komplette kørsel bestod uden ændringer i testen.
- AI Gateway: 27 tests og typekontrol bestået.
- Hele backendpakken i SHIELD: 584 tests bestået mod isolerede databaser, uden indlæsning af lokale miljøfiler.
- Den nye frontendbygning blev åbnet i browseren med lokal udviklingsidentitet. Startside, sagsoversigt, materialetrin og rapportfaner blev gennemgået; ingen browserfejl blev registreret. Alle otte README-billeder er fra denne bygning.

## Sikkerhed ved publicering

Kandidatfilerne blev kontrolleret for databasefiler, miljøfiler, private nøglefiler og almindelige tokenmønstre. Ingen faktiske adgangsnøgler blev konstateret i publiceringsgrundlaget. Dette er en afgrænset kontrol af snapshotfilerne, ikke en fuld sikkerhedsrevision af produktet.

Datatilsynets oprindelige XLSX-skabelon er bevaret med SHA-256:

```text
6cbb2fca543426eefca005db9dd2a09516d629e9ef8ef3d5ca7e4583ccef9976
```

## Grænser for kontrollen

- Tests og JEV er ikke en juridisk godkendelse.
- Skærmbillederne dokumenterer en arbejdsversion, ikke kommunal drift eller anskaffelse.
- Der er ikke foretaget produktionsdeployment, verificeret multi-tenant-isolation eller certificering.
- Dockerfilerne er historiske og pakker endnu ikke hele den aktuelle AI Gateway-arbejdsgang.
- Readiness-kontrollen bekræfter database og rapportskabelon, ikke adgang til modeller.
