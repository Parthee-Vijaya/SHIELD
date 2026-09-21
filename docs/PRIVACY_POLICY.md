# Persondatapolitik — Tyr (intern beta)

**Senest opdateret:** 2026-05-08
**Version:** intern-beta-1
**Dataansvarlig:** Kalundborg Kommune, Digitalisering & IT
**Kontakt:** ServicePortalen@kalundborg.dk

---

## Hvad er Tyr?

Tyr er Kalundborg Kommunes interne AI-compliance-platform der hjælper sagsbehandlere med at vurdere AI-systemer mod EU AI Act, GDPR og dansk forvaltningsret. Platformen anvendes lige nu i intern beta af digitaliseringsteamet.

## Hvilke persondata behandler Tyr?

### Kategorier af registrerede

- **Sagsbehandlere** der bruger Tyr (navn, brugernavn fra netværket, IP-adresse, tidsstempel for handlinger)
- **Borgere** der nævnes i fritekst (sags-beskrivelser, uploadede DPIA'er, kontrakter) — i form af det sagsbehandleren selv indtaster eller uploader

### Datakategorier

| Hvor | Hvad | Hvorfor |
|---|---|---|
| `V3AssessmentLog` (audit-logs) | Sagsbeskrivelser, signaler, regelmotorens afgørelse | Krav til auditspor på lovbaserede afgørelser |
| `Case` + `case_transitions` | Kommunalt sags-id, titel, noter, status, ansvarlig sagsbehandler, dato | Workflow-styring af compliance-vurderinger |
| `data/documents/<id>.pdf\|docx` | Originale uploadede dokumenter (DPIA, policy, kontrakt) | At kunne henvise tilbage til kilden for AI-udledte signaler |
| `audit_access_log` | Hvem har set hvilke audit-logs hvornår | Selv-revidérbarhed af persondata-tilgang (artikel 32) |
| `rule_freshness` | Status på lov-citater (ingen persondata) | Daglig verificering af lovkilder |

### Følsomme persondata

Tyr er **ikke designet til** at behandle særlige kategorier (artikel 9): helbreds-, race-, religiøse, politiske, fagforenings- eller seksualitetsoplysninger. Sagsbehandlere må ikke indtaste sådanne oplysninger. Hvis det alligevel sker, vil det blive fanget af PII-redaktion (CPR + navn-detektion) og loggers ikke i klar form. Følsomme dokumenter (fx fulde sundhedsjournaler) må ikke uploades.

## Retsgrundlag

Behandlingen sker med hjemmel i:

- **GDPR artikel 6(1)(e)** — udførelse af opgave i samfundets interesse / som led i offentlig myndighedsudøvelse: kommunal compliance-vurdering af AI-systemer
- **GDPR artikel 6(1)(f)** — legitim interesse: dokumentation af afgørelser jf. forvaltningsloven §§ 22 og 24
- **Forvaltningsloven** — pligt til notatførsel og begrundelse

## Hvor længe gemmes data?

| Datatype | Opbevaringsperiode | Slettet hvordan |
|---|---|---|
| Audit-logs (`V3AssessmentLog`) | 5 år fra oprettelse | Auto-slettes natligt af retention-job |
| Aktive cases | Indtil status = "arkiveret" + 10 år | Auto-slettes natligt |
| Arkiverede cases | 10 år efter arkivering | Auto-slettes natligt |
| Uploadede dokumenter | 5 år eller indtil tilknyttet audit-log slettes | Auto-slettes natligt |
| Audit-access-log | 5 år | Auto-slettes natligt |
| Lov-citater (`rule_freshness`) | Så længe regelen er aktiv | Auto-slettes når regel fjernes |

Disse perioder kan tilpasses via `.env` (`ASSESSMENT_LOG_RETENTION_DAYS`, `CASE_RETENTION_DAYS`, `DOCUMENT_RETENTION_DAYS`).

## Hvor opbevares data?

Tyr kører lokalt på Kalundborg Kommunes Mac Studio i Digitalisering & IT-afdelingen. Data forlader **ikke** kommunens netværk. Adgang sker kun via Tailscale-VPN. LLM-kald (sprogmodel-kald) går til en **lokal** instans af LM Studio — ikke til skytjenester.

**Undtagelse:** Når lov-citatfriskhed verificeres dagligt kl. 04:00, sender Tyr HTTP-anmodninger til offentligt tilgængelige juridiske kilder (eur-lex.europa.eu, retsinformation.dk). Disse anmodninger indeholder ingen persondata.

## Modtagere

Persondata deles ikke med tredjeparter. Tyr har ingen integration mod eksterne systemer i intern beta.

## Sikkerhedsforanstaltninger

- **Adgangskontrol:** netværksgrænse via Tailscale (kun autoriserede klientcertifikater)
- **Pseudonymisering:** fritekst kører gennem PII-redaktion før den persisteres (CPR, email, telefonnumre, sandsynlige navne erstattes af placeholders)
- **Audit:** alle tilgange til audit-logs logges i `audit_access_log`
- **Backup:** dagligt versioneret backup, opbevares lokalt i adskilt mappe
- **Retention:** automatisk daglig sletning per ovenstående perioder

## Dine rettigheder

Som registreret har du ret til:

- **Indsigt (artikel 15)** — få udleveret en kopi af alle persondata Tyr har om dig
- **Berigtigelse (artikel 16)** — få rettet forkerte oplysninger
- **Sletning / "right to be forgotten" (artikel 17)** — få slettet dine oplysninger
- **Begrænsning (artikel 18)** — få behandlingen begrænset
- **Dataportabilitet (artikel 20)** — få oplysningerne i struktureret JSON-format
- **Indsigelse (artikel 21)** — gøre indsigelse mod behandlingen

For at udøve disse rettigheder skriv til **ServicePortalen@kalundborg.dk** med dit sags-id eller andre identificerende oplysninger.

Tyrs admin-API har endpoints der gennemfører disse rettigheder operationelt:
- `GET /api/v3/admin/dsar/export/{case_id}` — eksport
- `DELETE /api/v3/admin/dsar/case/{case_id}` — sletning

(Disse endpoints er kun tilgængelige for kommunens IT-administratorer.)

## Klage

Du har ret til at klage til **Datatilsynet** hvis du mener Kalundborg Kommunes behandling af dine persondata er ulovlig: [datatilsynet.dk](https://www.datatilsynet.dk).

## Ændringer

Denne politik opdateres når Tyr ændres væsentligt. Senest opdaterede versioner findes på Tyrs interne dokumentations-side.
