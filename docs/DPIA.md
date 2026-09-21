# Data Protection Impact Assessment (DPIA) — Tyr

> **Status:** UDKAST · v0.1 · Skal valideres af kommunens DPO/jurist før beta-go-live.

**Dataansvarlig:** Kalundborg Kommune, Digitalisering & IT
**Behandlingens ansvarlige:** [Indsæt navn på ansvarlig]
**Udarbejdet af:** Parthee Vijaya
**Senest opdateret:** 2026-05-08

---

## 1. Behandlingens karakter, omfang, sammenhæng og formål

### 1.1 Hvad er Tyr?

Tyr er en intern kommunal AI-compliance-platform der hjælper sagsbehandlere med systematisk at vurdere AI-systemer mod EU AI Act, GDPR og dansk forvaltningsret. Platformen kombinerer en deterministisk regelmotor (15 lov-baserede regler) med LLM-baseret signal-extraction fra fritekst og uploadede dokumenter.

### 1.2 Formål

- Sikre dokumenteret, hjemlet compliance-vurdering af AI-systemer kommunen overvejer at idriftsætte
- Reducere risikoen for at ulovlige AI-systemer kommer i drift
- Give et auditspor over alle vurderinger der kan fremlægges for tilsyn

### 1.3 Omfang og sammenhæng

- **Brugere:** ca. 5-10 personer i digitaliseringsteamet (intern beta-fase)
- **Hyppighed:** ca. 5-20 vurderinger pr. måned
- **Adgang:** kun bag kommunens netværk via Tailscale-VPN
- **Geografi:** alle data forbliver lokalt på Mac Studio i Kalundborg

### 1.4 Behandlingsaktiviteter

| Aktivitet | Persondata-relevans | Retsgrundlag |
|---|---|---|
| Sagsbehandler beskriver AI-system i fritekst | Mulig (CPR/navn/email kan optræde i tekst om eksisterende borgersager) | art. 6(1)(e) |
| Upload af DPIA, kontrakt, policy-PDF | Mulig (navn/CPR i bilag) | art. 6(1)(e) |
| LLM ekstraherer signaler fra fritekst | Behandling af det indtastede | art. 6(1)(e) + art. 22(2)(b) menneskeligt review opretholdt |
| Regelmotor evaluerer signaler → afgørelse | Auto-genereret beslutning, men IKKE bindende — sagsbehandler accepterer eller afviser | art. 6(1)(e) |
| Audit-log gemmer fuld request + response | Persistering | art. 6(1)(e) + forvaltningslovens journalpligt |
| Lov-assistent besvarer juridiske spørgsmål | Spørgsmål må ikke indeholde persondata; teknisk filter advarer hvis CPR/email opdages i prompt | art. 6(1)(e) |
| Citation-verifier henter offentlige lovkilder | Ingen persondata | n/a |

---

## 2. Vurdering af nødvendighed og proportionalitet

### 2.1 Nødvendighed

Kommunal pligt til at sikre lovligheden af IT-anvendelse (forvaltningsloven, persondataforordningen). Tyr automatiserer en proces der ellers kræver manuel juridisk gennemgang af hver AI-anskaffelse — proportionalt til behovet.

### 2.2 Dataminimering

- Sagsbehandlere instrueres i at undgå at indtaste persondata om borgere; Tyr er en *meta*-platform om AI-systemer, ikke en sagsbehandlings-platform
- PII-redaktion (regex-baseret CPR/email/telefon/navn) køres på fritekst før persistering
- Dokumenter gemmes i original form, men auto-slettes per retention-policy

### 2.3 Proportionalitet

Risikoen ved Tyrs eksistens (audit-log med PII-rester) er væsentligt mindre end risikoen ved ikke at have systematisk compliance-styring (idriftsættelse af ulovlige AI-systemer der berører borgerne direkte).

---

## 3. Risici for de registreredes rettigheder

### 3.1 Identificerede risici

| ID | Risiko | Sandsynlighed | Konsekvens | Score |
|---|---|---|---|---|
| R1 | Sagsbehandler indtaster CPR/navn i fritekst → persisteres trods PII-redaktion | Middel | Lav (kun internt synligt, ingen overførsel) | 4/10 |
| R2 | Uploadet DPIA-dokument indeholder borger-data der ikke er nødvendige for compliance-vurderingen | Middel | Lav-middel | 5/10 |
| R3 | Audit-log opbevares for længe → utidssvarende | Lav (auto-retention er aktiv) | Lav | 2/10 |
| R4 | Uautoriseret adgang via netværksgrænse-bypass (Tailscale-bug, fejlkonfig) | Lav | Middel-høj | 5/10 |
| R5 | LLM (LM Studio lokalt) lækker prompt eller fritekst hvis modellen byttes til skybaseret | Lav (lokal-only nu) | Høj | 4/10 |
| R6 | DSAR-endpoint slettes ved fejl, dokumentation går tabt | Lav | Middel | 3/10 |
| R7 | Backup-snapshot kopieres til usikker placering | Middel (manuel backup-rotation) | Middel | 5/10 |

### 3.2 Afbødning

| Risiko | Implementeret afbødning | Restansvar |
|---|---|---|
| R1 | PII-redaktion via regex (CPR, email, telefon, sandsynlige navne); 16 enhedstests | Sagsbehandler-træning i ikke at indtaste borger-data |
| R2 | Privacy-banner ved første brug; instruerer i ikke at uploade unødige bilag | Stikprøve-review af uploadede dokumenter |
| R3 | Daglig retention-sweep (kl. 02:00) sletter logs > 5 år, dokumenter > 5 år, arkiverede sager > 10 år | Periodisk verificering af at sweepet kører |
| R4 | Tailscale ACL-konfiguration; netværksisolering; ingen offentlig IP | Quarterly Tailscale-konfig-review |
| R5 | LLM_PROVIDER låst til lokal LM Studio; deploy-tjek udelukker cloud-providere i intern beta | Når M5 (Azure OpenAI) tages i brug, ny DPIA-iteration |
| R6 | Audit-access-log gemmer hver DSAR-handling; sletninger logges separat (`target_type=dsar_delete`) | Manuel verificering af at DSAR-logikken sletter alt forventet |
| R7 | Backup-script gemmer kun lokalt på adskilt disk; ingen cloud-backup i intern beta | Manuel test af restore én gang i kvartalet |

### 3.3 Restrisiko-vurdering

Efter afbødning vurderes restrisikoen som **lav til middel** for de identificerede områder, hvilket anses for acceptabelt for intern beta-anvendelse med 5-10 brugere bag netværksgrænse.

---

## 4. Tekniske og organisatoriske foranstaltninger

### 4.1 Tekniske

- PII-redaktion (`src/utils/pii_redaction.py`) — regex-baseret, dansk-specifik
- Retention-job (`src/services/retention_service.py`) — daglig kl. 02:00
- Audit-access-log (`src/database/audit_access_log.py`) — append-only
- DSAR-endpoints (`/api/v3/admin/dsar/*`) — eksport + sletning
- Backup-script — daglig pg_dump + dokumenter-snapshot
- Netværksgrænse via Tailscale — ingen offentlig IP, klientcertifikater krævet

### 4.2 Organisatoriske

- Privacy-banner ved første brug — bekræfter forståelse af "indtast ikke borger-data"
- Brugerguide indeholder advarsel mod indtastning af persondata
- DPO/jurist gennemgår denne DPIA og godkender før intern beta starter
- Quarterly review af denne DPIA og eventuelle hændelser

---

## 5. Konsultation af DPO og registrerede

- **DPO:** Denne DPIA er forelagt kommunens DPO d. [DATO] og godkendt med [evt. forbehold/anbefalinger].
- **Registrerede:** Da intern beta primært involverer sagsbehandlere som registrerede (ikke borgere), og borger-data kun kan optræde indirekte gennem fejlbrug, er der ikke gennemført separat borger-konsultation. Privacy-banneret giver de registrerede sagsbehandlere informeret samtykke til behandlingen.

---

## 6. Beslutning

**Vurdering:** Risikoen for de registreredes rettigheder og frihedsrettigheder er identificeret og afbødet. Tyr kan tages i brug til intern beta under følgende betingelser:

- [ ] DPO godkender denne DPIA (signatur + dato)
- [ ] Privacy-banner er live på alle pages
- [ ] Retention-job verificeret kørende i 7 dage
- [ ] DSAR-endpoints er testet end-to-end på en dummy-sag
- [ ] Backup-restore er testet på en dummy-sag
- [ ] Brugerguide udsendt til de 5-10 sagsbehandlere

**Næste DPIA-iteration:** Skal udarbejdes hvis nogle af følgende sker:
- Tyr tages i brug af mere end 20 brugere
- LLM-provider byttes til en cloud-tjeneste (Azure OpenAI mv.)
- Auth integreres (Entra ID SSO) — ny vurdering af brugeridentifikation
- Tyr åbnes for borgervendt brug
- Større ændringer i dataarkitekturen eller retention-perioder

---

## 7. Bilag

- A. Datakategori-inventar — tabeller og deres kolonner (se `docs/PRIVACY_POLICY.md` afsnit "Hvilke persondata behandler Tyr?")
- B. Test af PII-redaktion (`tests/test_pii_redaction.py` — 16 test-cases)
- C. Liste over admin-endpoints (`/api/v3/admin/*`) og deres adgangskontrol-status
- D. Risikovurdering-matrix (sandsynlighed × konsekvens)
