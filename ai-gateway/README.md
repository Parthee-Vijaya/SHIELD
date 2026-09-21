# AI-udkast til konsekvensanalyse og risikovurdering

`generate-report.mts` danner et kildeunderbygget udkast til de eksisterende skabelonafsnit og risici. Den afsluttende JEV-kontrol gennemgår både den nye tekst og dens oprindelige kildehenvisninger. Resultatet kræver fortsat menneskelig gennemgang; et AI-udkast er ingen godkendelse.

## Læsevenlig tekst i nye udkast

Skrivekontrakten ligger i `REPORT_WRITING_GUIDANCE`. Promptversionen `datatilsynet-dpia-draft-2026-09-21-v5-structured-prose` bruger:

- `##` til resuméets hovedoverskrifter: Konklusion, Dokumenteret grundlag, Skal afklares og Før en beslutning.
- `###` til relevante emner inden for et skabelonafsnit.
- Korte afsnit, blanke linjer og enkle `-` punktlister med ét forhold pr. punkt.
- Højst 4.000 tegn pr. afsnit og 5.000 tegn i resuméet. Grænserne er lofter, ikke mål for tekstlængden.

Et afsnit om en databehandleraftale skal, når indholdet er relevant, holde personoplysninger, hosting og behandlingssteder, underdatabehandlere, sikkerhed, sletning, aftalevilkår og AI-/modelafklaringer adskilt. Der oprettes ikke nye skabelon-ID'er. Et enkelt emne kræver ikke en række tomme standardoverskrifter.

En konstateret oplysning, et leverandørudsagn og en dokumentationsmangel skal kunne skelnes. En leverandøradresse beviser eksempelvis ikke dataplacering; et certifikat beviser ikke alle sikkerhedskontroller; og manglende dokumentation beviser ikke, at en kontrol ikke findes. Modstridende aftaleversioner og forskellige vilkår for forskellige datatyper bevares som afklaringer.

## Fakta, anbefalinger og kontrol

Valgfrie forslag ligger fortsat i den særskilte `recommendations`-liste med begrundelse, forudsætninger og efterprøvning. De bliver ikke til dokumenterede kontroller og ændrer ikke scorer, blokeringer eller status. Hvert forslag får sin egen JEV-kontrol med markering af, at det hverken er en implementeret kontrol eller en juridisk godkendelse.

Afsnit markeret `missing_information` eller `not_applicable` bevares ordret. Også hele den formaterede tekst i øvrige afsnit sendes til JEV; overskrifter og mere detaljeret prosa må ikke omgå kildekontrollen. Historiske rapporter omskrives ikke ved denne promptændring.

## Lokal validering uden modelkald

Kør `npm run ai:test` og `npm run ai:typecheck`. Testene bruger syntetiske svar og kontrollerer blandt andet, at emneopdelt tekst over den tidligere grænse på 2.500 tegn bevares gennem rapport- og JEV-forløbet, at låste afsnit forbliver uændrede, og at anbefalinger stadig er særskilte forslag. Tests dokumenterer kontrakten og kontrollernes opførsel, ikke kvaliteten af en faktisk modelbesvarelse.
