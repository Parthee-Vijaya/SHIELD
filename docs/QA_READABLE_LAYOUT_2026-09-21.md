# Kontrol af den læsevenlige vurdering

Kontrolleret lokalt den 21. september 2026.

## Ændringen

- Historiske resuméer får tydelige statusoverskrifter. Nye rapportudkast
  instrueres i overskrifter, korte afsnit og adskilte emner.
- Alle 39 skabelonafsnit kan læses via otte emner. Personoplysninger, hosting,
  databehandleraftale, sikkerhed og sletning har separate visninger.
- Risici viser hændelse, årsag, konsekvens, forslag til tiltag og opfølgning.
  Alle øvrige risici og anbefalinger kan foldes ud samme sted.
- Emnernes kildelinks åbner det tilsvarende afsnit i den fulde rapport.
- Word-eksport gengiver overskrifter, fed tekst og lister.

## Verifikation

- Hele frontendpakken: **335 tests i 34 testsuiter bestået**. Efter sidste
  justering blev de fire berørte suites kørt igen: **66 tests bestået**;
  sideintegrationens sidste fokusrettelse: **31 tests bestået**.
- AI-rapportkontrakt: **48 tests bestået** samt TypeScript-kontrol. Testene
  bruger syntetiske model- og JEV-svar; ingen nye modelkald blev udført.
- Word og læsevenlig eksport: **18 tests bestået** i projektets lokale miljø.
- Produktionsbuild gennemført. Readiness bekræfter database, rapportlager og
  skabelon. Ingen browserkonsolfejl ved gennemgangen.
- En eksisterende vurdering blev åbnet i browseren ved 1440 × 1000 og
  390 × 844. Emneskift, kildelink, overskrifter og mobilvælger blev afprøvet.
  Dokumentbredden oversteg ikke skærmbredden.
- Den faktiske Word-download lykkedes. Dokumentets tre historiske
  statusoverskrifter er Word-overskrifter, ikke almindelige tekstlinjer.
- Den gemte vurderings resumé, 39 afsnit, 33 risici, anbefalinger,
  afklaringer og kontrolgrundlag var uændrede efter gennemgangen.

Den brede Python-typekontrol har fortsat de samme **361 eksisterende fejl i
60 filer** som før denne ændring; ingen fejl blev rapporteret i den ændrede
Word-eksport. Typekontrollen er derfor ikke en grøn projektkontrol.

Skærmbilleder og den hentede rapport blev kun gemt i lokal, Git-ignoreret
kontrolmappe. Kundemateriale og rapportindhold indgår ikke i denne ændring.
