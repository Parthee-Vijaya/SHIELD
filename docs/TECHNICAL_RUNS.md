# Teknisk kørsel

Fanen **Teknisk kørsel** i sagens arbejdsrum viser, hvad der er registreret om en materialeanalyse, en konsekvensanalyse eller en manuel rapportrevision. Fra en gemt rapport kan man åbne fanen med den pågældende vurderingsversion valgt.

## Det kan læseren undersøge

- Hvilken gemt kørsel eller rapportversion der vises, tidspunktet og den angivne model.
- Om teksten blev udarbejdet via AI Gateway, importeret fra en lokal Codex-kørsel, genereret af regler eller redigeret af et menneske.
- Kommunens gemte input, leverandørens kildeuddrag og de kontrolsummer, der foreligger.
- De gemte tekstafsnit, risici, anbefalinger eller udtrukne oplysninger og deres kildehenvisninger.
- JEVs kontrolpunkter, markeringer, grænseværdi og versionsnummer for kontrolkriterierne.
- Oplyst tokenforbrug og tekniske begrænsninger, når de er gemt.

Vælg først en kørsel. Gennemgå overblikket, og fold derefter det relevante kontrolpunkt, tekstafsnit eller kildeuddrag ud. Kilderne er de gemte versioner fra kørslen; de hentes ikke på ny fra leverandørens hjemmeside, når fanen åbnes.

## Sådan læses JEV-kontrollen

JEV bliver spurgt, om der er et væsentligt kvalitetsproblem ved det kontrollerede indhold. Et højere problemsignal betyder derfor større behov for gennemgang — det betyder ikke, at teksten er mere korrekt. Ved den gemte grænseværdi markeres punktet til opfølgning.

Hvis en kørsel har delt kildegrundlaget op i flere kald, kan værdien være det højeste problemsignal fra delkontrollerne. Den er ikke en samlet eller kalibreret sandsynlighed for juridisk korrekthed. Henviste kilder under et tekstafsnit er ikke nødvendigvis en komplet log over hvert JEV-kalds kontekst; flere afsnit og kilder kan være behandlet i samme batch.

Den aktuelle evaluering gemmer score og markering, men ingen individuel fritekstbegrundelse fra JEV. Fanen viser derfor det gemte resultat og kontrolgrundlaget uden at opfinde en begrundelse. En beskrivelse af behandlingsforløbet er heller ikke modellens interne tankegang eller en log over dens skjulte overvejelser.

## Ældre versioner og menneskelig redigering

Manglende model-, forbrugs- eller kørselsoplysninger vises som ikke registreret. Der indsættes ikke opdigtede værdier i historiske sager. En grundvurdering uden AI bliver vist som regelbaseret.

Ved en manuel rapportrevision er den redigerede tekst ikke en ny AI-kørsel. Arvede JEV-resultater kan være forældede for de ændrede afsnit og anbefalinger. Den oprindelige vurderingsversion og revisionens metadata bevares, og fanen skal gøre forskellen synlig.

Ved lokal Codex-import er model og kørsels-ID angivet af den lokale operatør. Importen starter ikke i sig selv modellen; oplysningerne skal læses med denne oprindelse.

## Teknisk afgrænsning

`GET /api/v3/cases/{case_id}/technical-runs` læser de gemte vurderinger og materialeanalyser for den valgte sag. Endpointet bruger samme rollekrav som sagens arbejdsrum. Fanen genererer ikke nye vurderinger, foretager ikke modelkald og omskriver ikke de historiske rapporter.

Visningen er et revisionsgrundlag baseret på gemte data. Den er ikke en komplet log over fejlede modelkald, afbrudte forsøg, køtid eller fakturerede omkostninger, hvis disse hændelser ikke er registreret i datamodellen. Adgang til dokumentation er ikke en faglig eller juridisk godkendelse af indholdet.
