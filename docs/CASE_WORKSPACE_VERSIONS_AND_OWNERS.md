# Versioner, ansvar og opfølgning på sagen

Sagens arbejdsrum samler vurderinger, dokumenter, foranstaltninger og historik. En gemt vurdering er fortsat et låst beslutningsgrundlag. Ansvar og menneskelig opfølgning registreres særskilt, så det er muligt at følge arbejdet uden at omskrive tidligere AI- eller JEV-resultater.

## Versioner og downloads

Vurderinger vises med kategori, oprettelsestidspunkt, registreret ejer og oprindelse: AI, menneskelig revision eller regelbaseret vurdering. Den seneste version inden for hver kategori står først; historiske versioner vises mere afdæmpet og kan stadig åbnes og downloades.

- Word og Excel fra samme vurdering samles i én eksportgruppe med fælles vurderings-ID og versionsbetegnelse.
- Et faktisk versionsnummer vises, når det er registreret. Ældre vurderinger uden versionsnummer identificeres med deres gemte snapshot-ID; der opfindes ingen historisk rækkefølge.
- En menneskelig rapportrevision vises som en revision. Den oprindelige AI-model kan vises særskilt som AI-grundlag, uden at revisionen fremstilles som et nyt modelkald.
- En AI-model vises kun, når den er registreret. Historiske importoplysninger kan vise AI-assisteret oprindelse med ukendt model. Manglende aktør, model eller dato markeres som ikke registreret.

Eksportgrupper bygger på kategori og eksplicit snapshot-ID, ikke på ens titler eller datoer. Produktversionen i sidens top er adskilt fra vurderingens version.

## Ejer og revisionsspor

En vurderings ejer gemmes som supplerende metadata i `CaseWorkspaceReference.details.workspace_metadata`. Denne *sidecar* ligger uden for vurderingens oprindelige input og resultat. En ejerændring ændrer derfor ikke vurderingsteksten, dens kilder eller dens JEV-kontrol.

Ændringer registreres med før/efter-værdi, tidspunkt og faktisk aktør. API'et henter aktøren fra den aktuelle bruger; klienten kan ikke indsende en anden ændringsaktør. Intern registrering af et AI-foreslået ansvar kan desuden angive den faktisk anvendte model. Et rolleforslag er ikke dokumentation for en formel udpegning, og forslagets model vises særskilt fra rapportens model.

Foranstaltningers ejer og frist kan ændres eller ryddes. En udeladt frist bevares; en udtrykkelig tom frist fjerner datoen. Ændringer og audit gemmes i samme transaktion. Gentagen lagring af uændrede værdier skaber ikke en ny ændringshændelse.

Sagens historik skelner mellem ejer og den, som udførte ændringen. En gammel ejeroplysning bruges aldrig som bevis for, hvem der afsluttede en opgave. Nye ejere føres heller ikke tilbage på historiske vurderingsversioner.

## Menneskelig opfølgning på JEV

Under **Teknisk kørsel** kan brugeren følge op på et oprindeligt JEV-kontrolpunkt eller oprette et selvstændigt kontrolpunkt til en bestemt vurderingsversion. Spørgsmål, notat, ansvarlig og status gemmes som menneskelig opfølgning.

Hver ændring får en ny kontrolpunktversion og en uforanderlig revisionspost med hele indholdet, aktør og tidspunkt. Punktet vises i den fælles sagshistorik med før/efter-oplysninger. Den oprindelige vurdering, JEV-score, markering og kontrollerede tekst bevares.

Et afsluttet menneskeligt kontrolpunkt er fortsat markeret `origin: human`, `jev_reviewed: false` og `requires_new_review: true`. Afslutning udgør hverken en ny JEV-kontrol eller en juridisk godkendelse. En ny modelkontrol kræver et særskilt forløb.

Opdatering kræver `expected_version`. Hvis en anden har gemt punktet siden åbningen, afvises den forældede ændring med HTTP 409; brugeren skal genindlæse, før der gemmes igen. Kontrolpunkt og revisionspost gemmes atomisk.

## Dokumenter og samlet sagspakke

Dokumentoversigten viser dokumentkategori samt uploaddato og uploader for den konkrete filversion. Det er adskilt fra tidspunktet og aktøren for tilknytning til sagen. Ukendte historiske uploadoplysninger udfyldes ikke ud fra sagens ejer eller den, der senere tilknyttede filen.

Den komplette JSON-sagspakke indeholder blandt andet vurderingssnapshots, dokumentmetadata og downloadhenvisninger, foranstaltninger, godkendelser, lovafhængigheder, historik samt menneskelige kontrolpunkter med alle deres revisioner. Originalfilernes binære indhold er ikke indlejret i JSON-filen.

Sagspakken er et aktuelt udtræk. Den får en indholdsbaseret `revision_id`, som også indgår i filnavnet. Uændret sagsindhold giver samme revision; ejerændringer eller nye kontrolpunktrevisioner giver en ny. Selve downloadtidspunktet ændrer ikke revisionen. Hvis sagen ændres efter visning af eksportoversigten, kan den downloadede pakke derfor have en nyere revision end den viste.

## API og lagring

| Handling | Endpoint |
| --- | --- |
| Hent samlet arbejdsrum | `GET /api/v3/cases/{case_db_id}/workspace` |
| Skift vurderingens ejer | `PATCH /api/v3/cases/{case_db_id}/assessments/{assessment_type}/{assessment_id}/metadata` |
| Opret menneskeligt kontrolpunkt | `POST /api/v3/cases/{case_id}/technical-controls` |
| Opdater kontrolpunkt med versionskontrol | `PATCH /api/v3/cases/{case_id}/technical-controls/{control_id}` |
| Hent komplet sagspakke | `GET /api/v3/cases/{case_db_id}/export.json` |

Arbejdsrummets readmodel har `schema_version: "1.1"`. Vurderingsejere og ændringshændelser bruger den eksisterende referencetabel. Menneskelige kontrolpunkter bruger `technical_control_points` og `technical_control_point_revisions` og er knyttet til både sag og vurderings-ID. Adgang følger sagens eksisterende rollekrav.

## Databasemigration

Migrationen [`e7a4b9c2d610`](../alembic/versions/e7a4b9c2d610_add_human_technical_controls.py) følger `f3b12c9a74e0` og opretter de to tabeller til menneskelig opfølgning. Den omskriver ingen eksisterende vurderinger eller JEV-resultater og tåler, at tabellerne allerede er oprettet i en lokal installation.

Tag en databasebackup, kontrollér at installationens databasekonfiguration peger på den ønskede database, og anvend migrationen før den nye backend tages i brug:

```sh
alembic current
alembic upgrade e7a4b9c2d610
alembic current
```

En nedgradering fjerner kontrolpunkt- og revisionstabellerne og dermed deres indhold. Den bør ikke bruges som almindelig fortrydelse af brugerændringer.

## Verificeret den 21. september 2026

- 365 frontendtests i 37 testfiler bestod.
- 62 backendtests bestod i `test_case_workspace_backend`, `test_workspace_api`, `test_technical_controls` og `test_technical_runs`.
- I den faktiske brugerflade mod en isoleret SQLite-kopi blev et menneskeligt kontrolpunkt oprettet og redigeret. Ændringerne blev straks vist i den fælles historik, og ejer samt frist blev gemt.
- De oprindelige vurderingssnapshots blev sammenlignet før og efter og var uændrede. Denne kontrol dokumenterer arbejdsgangen; den er ikke en ny AI- eller JEV-kørsel.

Produktionsbygningen består. Den samlede typekontrol er fortsat ikke ren på grund af eksisterende typefejl i projektet (350 fejl i 60 filer); de nye kontrolpunktfiler har ingen typefejl. Standardlintens linjelængde er ikke afstemt med Black og melder fortsat formateringsafvigelser. De ændrede backendfilers kontrol for ubrugte imports og syntaksfejl består.
