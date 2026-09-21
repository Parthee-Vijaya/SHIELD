# Forbedringer af sagens dokumentarbejde

Den eksisterende opbygning, navigation, vurderingsgrundlag, juridiske kontroller,
risikomodel og rapportskabeloner er bevaret. Formålet er fortsat at samle,
dokumentere og udarbejde konsekvensanalyser og risikovurderinger af AI-løsninger
og IT-løsninger med AI-funktioner til faglig og juridisk gennemgang. Både
selvstændige AI-værktøjer og konkrete AI-funktioner i eksisterende IT-løsninger
er omfattet. Produktet er ikke en generel anskaffelsesportal for fagsystemer.

## Inspiration

AIlex beskriver faste dokumentforløb, arbejde på tværs af sagens dokumenter,
kildehenvisninger og redigerbare dokumentudkast på sine offentlige produktsider:

- [Dokumentforløb](https://ailex.dk/#workflows-showcase)
- [Sagerum og dokumentanalyse](https://ailex.dk/#vaults-showcase)
- [Dokumentudarbejdelse](https://ailex.dk/#document-showcase)

Den offentlige beskrivelse og demonstration er undersøgt. Selve produktet bag
login er ikke afprøvet. Inspirationen vedrører funktionerne i arbejdsgangen.

## Implementeret

1. **Dokumentgrundlag for AI-vurderingen.** Oversigt over vedlagte materialetyper og læsbarhed,
   genvej til upload og søgning på tværs af dokumenternes gemte tekstuddrag.
   Placeringer og versioner følger kilden. Bilag er ikke automatisk godkendte.
2. **Afklaringsliste.** Gemte analysespørgsmål kan oprettes som sagsopgaver med
   ansvarlig, frist, svar og status. De samme opgaver findes under
   Foranstaltninger. Gentagen oprettelse giver ingen dubletter. Modstridende
   samtidige ændringer afvises, og afslutning kræver et dokumenteret svar.
3. **Rapportredigering.** Redigering af resumé, afgrænsning, afsnit og risikotekst
   med kilder ved siden af. Gemning skaber en ny rapportversion med begrundelse
   og før/efter-historik. Risikoscorer, hjemmelskontrol og manglende oplysninger
   kan ikke tilsidesættes via teksteditoren. Word og Excel viser ændringerne.

Tidligere JEV-kontrol gælder ikke automatisk en ny formulering. Berørte
kildekontroller markeres derfor som forældede. Historiske rapporter bevares.
En AI-kørsel kan ikke gemme over en medarbejderrettelse, der blev gemt undervejs.
Leverandørmaterialet skal beskrive den konkrete AI-funktion, input, output,
modelbrug, dataflow og menneskelige kontrol. Udokumenterede AI-egenskaber skal
stå som afklaringspunkter; de må ikke udledes af produktnavnet eller af, at
løsningen er SaaS.

## Kontrol

Backendtests dækker blandt andet isolation mellem sager, versionskonflikter,
genforsøg, samtidige gemninger, rollback, kilde-id'er og uændrede risikoscorer.
Brugerfladen er gennemgået ved mobil- og desktopbredde samt lyst og mørkt tema.

Live-afprøvningen brugte de eksisterende illustrative sager. På Acadre-sagen er
11 afklaringsopgaver gemt; spørgsmålet om databehandleraftalen er markeret som
under afklaring med svar og frist. Dette er en historisk afprøvning af
dokumentarbejdsgangen og er ikke dokumentation for, at Acadre indeholder AI.
Historiske sagsoplysninger bevares uden at få tilføjet udokumenterede
AI-egenskaber. På eksempelsagen om interne mødenoter er en
præcisering gemt som version 2. Alle 13 tidligere rapportposter er kontrolleret
uændrede. Word og Excel er hentet via brugerfladen.

Der er ikke udført nye AI- eller JEV-kørsler som led i denne funktionstest.
Afklaringssvar indgår ikke automatisk som bekræftede fakta i en ny analyse.
