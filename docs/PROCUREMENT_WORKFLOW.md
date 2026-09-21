# AI-løsninger fra leverandørmateriale til konsekvensanalyse

Løsningen samler, dokumenterer og udarbejder konsekvensanalyser og
risikovurderinger af selvstændige AI-løsninger og IT-løsninger med AI-funktioner.
**Ny AI-løsning** og forsidens **Opret AI-løsning** åbner `/anskaffelse`.
Brugeren registrerer løsningens navn, leverandør, fagområde, ansvarlig og
kommunens konkrete anvendelse af AI. Der oprettes en almindelig vurderingssag
med den eksisterende FS-reference. Eksisterende vurderinger og sager bevares.

## Arbejdsgang

1. Opret vurderingssagen, og beskriv den AI-funktion og kommunale arbejdsgang,
   som skal undersøges. En generel beskrivelse af IT-systemet er ikke nok til
   at dokumentere AI-funktionen.
2. Upload PPTX, DOCX, PDF eller TXT, eller tilføj en offentlig hjemmeside.
3. Gennemgå AI-forslag, kildecitater, JEV-markeringer og afklaringsspørgsmål om
   blandt andet AI-funktionens input og output, modeller, dataflow, modeltræning
   og menneskelig kontrol.
4. Vælg de oplysninger, som må indgå i vurderingsgrundlaget, og gem et notat.
5. Hent et Word-dialoggrundlag, opret en opgave til jura eller fortsæt til
   konsekvensanalysen. Den etablerede vurderingsfunktion leverer Word og Excel,
   når de nødvendige oplysninger er udfyldt.

Ukendte svar bliver ikke automatisk til nej. Konsekvensanalysen kræver fortsat
oplysninger om konkret databehandling, hjemmel og kontroller. AI kan ikke udfylde
juridisk godkendelse, verificeret hjemmel eller implementerede kontroller.
JEV kontrollerer udsagn i forhold til kilderne; ingen markering er ikke en
garanti for korrekthed eller lovlighed. Kommunens formål overstyrer altid
leverandørens generelle produktformål.

Analyseinstruktionen kræver kildegrundlag for AI-egenskaber. At et produkt er
SaaS eller bruges i en kommune dokumenterer ikke AI. Hvis materialet ikke
beskriver den relevante AI-funktion, skal det fremgå som et uafklaret forhold
med spørgsmål til den konkrete funktion og leverandørdokumentationen. Model-
og promptversion gemmes fortsat sammen med analysen.

## Dokumentation og historik

Sagens organisation står eksplicit ved titlen gennem hele anskaffelsesforløbet
og på den samlede sag. Rapporten viser sin egen gemte dataansvarlige organisation.
Kalundborg-brandingen i navigationen ændrer ikke sagens organisation.

Større dokumentpakker behandles automatisk i **flere delanalyser**, som samles
til ét resultat. En delpakke har højst 25 dokumentversioner, 500.000 tegn og
1.000 kildeuddrag; tekst og metadata kan medføre mindre delpakker. Hele forløbet
kan omfatte op til 100 dokumentversioner, 5 millioner kildetegn og 10.000 uddrag,
fordelt over højst 20 delpakker. Disse samlede grænser beskytter driften og
kontrolleres før modelkald; materiale udelades ikke i stilhed.

AI gennemgår hver delpakke og udarbejder et kildebaseret delresultat. Derefter
samles oplysninger, konflikter og afklaringspunkter. Forskellige svar om blandt
andet hosting, modeltræning, sletning og leverandør
bevares som uafklarede forskelle med begge kilder. De bliver ikke til et entydigt
faktum ved sammenfatningen. Fritekst om formål og supplerende datakategorier kan
være forenelige og sammenfattes med AI; semantiske modstrid kræver fortsat faglig
gennemgang. Spørgsmål og konflikter registreret i delanalyserne bevares.
Konsekvensanalysen bruger samme princip: delanalyser af kilderne efterfulgt af
rapportens afsnit og risici. Låste mangler, risikoscorer og godkendelsesstatus
bevares. JEV kontrollerer de endelige tekster mod de oprindelige henviste kilder.

Samlingen bygger på delresultater; den er ikke et modelkald med alle originale
kilder samtidig. JEV kan også dele sit kildegrundlag op. Delkontroller markerer
uafklarede sammenhænge til faglig gennemgang og udgør ikke en juridisk godkendelse.
Hvis et nødvendigt deltrin eller den endelige kontrol fejler, gemmes ingen ny
færdig analyse. Den eksisterende vurdering bevares. Kildegrundlaget kontrolleres
igen før lagring, så samtidige ændringer kræver en ny analyse.

Antal delpakker, dækkede kilder, tekstmængde og gemte delresuméer følger nye
kørsler under **Teknisk kørsel**. Ældre vurderinger får ikke efterkonstrueret
batchhistorik. Materialetrinnet viser, at større pakker opdeles automatisk.

Filgrænsen er fortsat 5 MB. Hvert dokument kan tekstudtrækkes op til 2 millioner
tegn og 5.000 afsnit eller PDF-sider. Lange tekstafsnit deles i kildeuddrag med
placering og tegnintervaller. Dokumenter, der overstiger udtræksgrænsen, kræver
opdeling; de må ikke analyseres som om hele originalen indgår. Skannede sider
og billedindhold kræver stadig tekstgenkendelse eller manuel gennemgang.

Tidligere rapportversioner og deres kildegrundlag omskrives ikke. Når en ny
udtrækning indeholder mere tekst, markeres den tidligere materialeanalyse som
forældet, og oplysninger skal gennemgås på det nye grundlag.

På materialetrinnet viser dokumentgrundlaget, hvilke typer bilag der er vedlagt,
og om teksten kunne læses. En vedlagt fil er ikke en godkendelse af indholdet.
Kildenavigatoren søger på tværs af tekstuddrag og kan afgrænses til et dokument.
Den viser kildeplacering og den gemte dokumentversion.

Analysens spørgsmål kan oprettes som en afklaringsliste med ansvarlig, datovælger,
status og dokumenterede svar. Opgaverne genbruges under sagens Foranstaltninger.
Oprettelse kræver et eksplicit klik; gentagelser skaber ikke dubletter. Et svar
ændrer ikke automatisk analysens fakta eller udgør en juridisk godkendelse.

I en gemt konsekvensanalyse åbner **Redigér rapportudkast** en editor med kilder
ved siden af teksten. Gemning opretter en ny, uforanderlig rapportversion med
ændringsnotat og før/efter-historik. Input, risikoscorer, blokeringer og
hjemmelskontrol bevares. Manglende oplysninger kan ikke skrives væk i editoren.
Tidligere JEV-kontrol markeres som forældet for ændrede tekster, også i Word og
Excel. Ældre versioner kan læses og downloades, men redigering tager altid
udgangspunkt i den nyeste version.

Originalfiler og hjemmesideudtræk gemmes som ikke-godkendt materiale med checksum,
dokumentversion og kildeplacering. Word-tabeller og PowerPoint-slides læses med.
Gemte analyser og gennemgange er uforanderlige. Ændret profil eller kildemateriale
kræver ny analyse før oplysningerne kan overføres til vurderingen. Historiske
Word-notater kan fortsat hentes med markering af ændret grundlag.

Formularkladder holdes adskilt pr. sag og gennemgang i browseren. Det oprindelige
fælles kladdeformat anvendes fortsat ved en manuel vurdering uden sag.

## Lokal afprøvning gennem Codex

Gateway-knappen bruger den serverkonfigurerede model og faktisk JEV-kontrol.
Adgang til den valgte model kræver tilgængelige Gateway-kreditter. Fejl gemmer
ingen ny analyse og erstatter ikke et eksisterende resultat.

Den lokale testbro kan klargøre en kildepakke og importere et faktisk Codex-udkast:

```sh
python scripts/run_codex_procurement.py --db data/shield-review.db prepare \
  --case-id CASE_UUID --output .cache/procurement/source-pack.json \
  --schema .cache/procurement/draft-schema.json
python scripts/run_codex_procurement.py --db data/shield-review.db import \
  --source-pack .cache/procurement/source-pack.json \
  --draft .cache/procurement/draft.json --model gpt-5.6-sol --run-id UNIQUE_RUN_ID
```

Udkastet skal faktisk være udarbejdet med den angivne model. Importen validerer
feltværdier, ordrette citater og kildeændringer, kører JEV og gemmer resultatet
med model- og kørselsproveniens. Samme kørsels-ID er idempotent. Kun Node-processen
indlæser den ignorerede `.env.local`; nøgler må ikke læses eller udskrives.

## Aktuel afgrænsning

- Filer højst 5 MB; ingen OCR, billeder, talenoter eller JavaScript-rendering.
- Hjemmesider skal være offentligt tilgængelige. Private adresser, usikre
  omdirigeringer, makroer og indlejret eksekverbar kode afvises.
- Eksisterende roller og én konfigureret organisation genbruges. Der er ikke
  etableret isolation mellem flere kommunale kunder eller betalingsabonnementer.
- Referenceeksempler bruger reelle produktkilder, men illustrativ kommunal
  anvendelse. De er ikke faktiske indkøbsbeslutninger. Den historiske Acadre-sag
  dokumenterer en afprøvning af materialearbejdsgangen; den dokumenterer ikke,
  at Acadre eller den beskrevne anvendelse indeholder AI. Eksisterende
  produktnavne og rapportfakta omskrives ikke til AI-egenskaber.
- Tekniske E2E-sager er skjult i de almindelige lister; direkte historiske links
  virker fortsat.
