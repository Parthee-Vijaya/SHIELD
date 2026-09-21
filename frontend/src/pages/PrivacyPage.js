import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import ReactMarkdown from 'react-markdown';

const Page = styled.article`
  max-width: 760px;
  margin: 0 auto;
  padding: 3rem 2.5rem 5rem;
  color: ${(p) => p.theme.colors.ink};

  h1 {
    font-family: ${(p) => p.theme.fonts.display};
    font-size: 2.4rem;
    font-weight: 700;
    letter-spacing: -0.022em;
    margin: 0 0 1rem;
  }

  h2 {
    font-family: ${(p) => p.theme.fonts.display};
    font-size: 1.55rem;
    font-weight: 600;
    margin: 2.5rem 0 0.6rem;
    letter-spacing: -0.01em;
  }

  h3 {
    font-family: ${(p) => p.theme.fonts.sans};
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: ${(p) => p.theme.colors.bronze};
    margin: 1.6rem 0 0.5rem;
  }

  p, li {
    font-family: ${(p) => p.theme.fonts.body};
    line-height: 1.7;
    font-size: 1rem;
    color: ${(p) => p.theme.colors.ink};
  }

  ul {
    padding-left: 1.5rem;
  }

  hr { border: none; border-top: 1px solid ${(p) => p.theme.colors.line}; margin: 2.5rem 0; }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1rem 0;
    font-size: 0.92rem;
  }
  th, td {
    border-bottom: 1px solid ${(p) => p.theme.colors.lineSoft};
    padding: 0.55rem 0.7rem;
    text-align: left;
    vertical-align: top;
  }
  th {
    font-family: ${(p) => p.theme.fonts.sans};
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: ${(p) => p.theme.colors.inkFaded};
    border-bottom: 2px solid ${(p) => p.theme.colors.line};
  }

  a { color: ${(p) => p.theme.colors.primary}; text-decoration: none; }
  a:hover { text-decoration: underline; }

  code {
    font-family: ${(p) => p.theme.fonts.mono};
    background: ${(p) => p.theme.colors.paperSoft};
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.88em;
  }
`;

// Markdown loaded inline so the page works without a backend round-trip and
// the privacy policy stays version-locked with the frontend bundle.
const PRIVACY_POLICY_MD = `# Persondatapolitik — S.H.I.E.L.D. (intern beta)

**Senest opdateret:** 2026-08-30
**Version:** intern-beta-2
**Dataansvarlig:** Kalundborg Kommune, Digitalisering & IT
**Kontakt:** ServicePortalen@kalundborg.dk

---

## Hvad er S.H.I.E.L.D.?

S.H.I.E.L.D. er Kalundborg Kommunes interne værktøj til konsekvensanalyse af AI og persondata. Platformen hjælper projekt- og procesejere med at dokumentere behandling, risici og foranstaltninger og anvendes lige nu i intern beta.

## Hvilke persondata behandler S.H.I.E.L.D.?

### Kategorier af registrerede

- **Medarbejdere** der bruger S.H.I.E.L.D. (navn, brugernavn fra netværket, IP-adresse, tidsstempel for handlinger)
- **Borgere** der nævnes i fritekst (sags-beskrivelser, uploadede DPIA'er, kontrakter) — i form af det sagsbehandleren selv indtaster eller uploader

### Datakategorier

- **Audit-logs** — sagsbeskrivelser, signaler, regelmotorens afgørelse. Bruges til auditspor på lovbaserede afgørelser.
- **Cases + transitions** — kommunalt sags-id, titel, noter, status, ansvarlig sagsbehandler. Bruges til workflow-styring af compliance-vurderinger.
- **Uploadede dokumenter** — DPIA, policy, kontrakt. Bruges til at kunne henvise tilbage til kilden for AI-udledte signaler.
- **Audit-access-log** — hvem har set hvilke audit-logs hvornår. Bruges til selv-revidérbarhed af persondata-tilgang (artikel 32).

### Følsomme persondata

S.H.I.E.L.D. er **ikke designet til** at modtage konkrete CPR-numre, helbredsoplysninger eller sagsakter om enkeltpersoner. Brugeren skal beskrive systemet og datakategorierne, ikke indsætte personoplysninger om konkrete personer. Teknisk redaktion kan ikke stå alene og må ikke betragtes som en garanti.

## Retsgrundlag

- **GDPR artikel 6(1)(e)** — udførelse af opgave i samfundets interesse
- **GDPR artikel 6(1)(f)** — legitim interesse: dokumentation af afgørelser jf. forvaltningsloven §§ 22 og 24
- **Forvaltningsloven** — pligt til notatførsel og begrundelse

## Hvor længe gemmes data?

- **Audit-logs** — 5 år fra oprettelse
- **Aktive cases** — indtil status = "arkiveret" + 10 år
- **Arkiverede cases** — 10 år efter arkivering
- **Uploadede dokumenter** — 5 år eller indtil tilknyttet audit-log slettes
- **Audit-access-log** — 5 år

Disse perioder kan tilpasses via miljøvariabler.

## Hvor opbevares data?

Hvor data opbevares og behandles afhænger af den aktive driftskonfiguration. Løsningen kan anvende en lokal sprogmodel eller en godkendt ekstern modeltjeneste, herunder Azure/OpenAI. Før idriftsættelse skal den konkrete hosting, modelprovider, databehandleraftale og eventuelle tredjelandsoverførsler dokumenteres og godkendes. Den aktive konfiguration kan ses på driftssiden.

Når lovkilder verificeres, sendes HTTP-anmodninger til offentligt tilgængelige juridiske kilder (eur-lex.europa.eu og retsinformation.dk). Disse anmodninger må ikke indeholde persondata.

## Sikkerhedsforanstaltninger

- **Adgangskontrol:** netværksgrænse via Tailscale (kun autoriserede klientcertifikater)
- **Pseudonymisering:** fritekst kører gennem PII-redaktion før den persisteres (CPR, email, telefonnumre, sandsynlige navne erstattes af placeholders)
- **Audit:** alle tilgange til audit-logs logges separat
- **Backup:** dagligt versioneret backup, opbevares lokalt i adskilt mappe
- **Retention:** automatisk daglig sletning per ovenstående perioder

## Dine rettigheder

- **Indsigt (artikel 15)** — få udleveret en kopi af alle persondata S.H.I.E.L.D. har om dig
- **Berigtigelse (artikel 16)** — få rettet forkerte oplysninger
- **Sletning (artikel 17)** — få slettet dine oplysninger
- **Begrænsning (artikel 18)** — få behandlingen begrænset
- **Dataportabilitet (artikel 20)** — få oplysningerne i struktureret JSON-format
- **Indsigelse (artikel 21)** — gøre indsigelse mod behandlingen

For at udøve disse rettigheder skriv til **ServicePortalen@kalundborg.dk** med dit sags-id eller andre identificerende oplysninger.

## Klage

Du har ret til at klage til **Datatilsynet** hvis du mener Kalundborg Kommunes behandling af dine persondata er ulovlig: [datatilsynet.dk](https://www.datatilsynet.dk).
`;

const PrivacyPage = () => (
  <Page>
    <ReactMarkdown>{PRIVACY_POLICY_MD}</ReactMarkdown>
  </Page>
);

export default PrivacyPage;
