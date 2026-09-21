# Jurist-briefing — Tyr v3 sektorlov-arbejde

*5 min læsning før interview*

## Hvad er Tyr?

Tyr er Kalundborg Kommunes interne AI-compliance-platform der vurderer kommunale AI-projekter mod EU AI Act, GDPR og dansk lov inden idriftsættelse.

Den nuværende version (v3) har 15 deklarative regler dækkende:
- **AI Act:** art. 5 (forbud), art. 6 (højrisiko), art. 13 (transparens), art. 14 (menneskelig overvågning), art. 50
- **GDPR:** art. 5, 6, 22, 32, 35
- **Forvaltningsloven:** § 3, 19, 22, 24
- **Offentlighedsloven:** § 13

**Hvad mangler:** Sektorlove. Hver paragraf-regel hjemles i en konkret lovartikel + ordret citat. Det er det vi har brug for din hjælp til.

## Hvordan virker reglerne?

Hver regel er en YAML-fil med tre hoveddele:

```yaml
kilde:
  lov: "Lov om social service (LBK 1089/2025)"
  artikel: "§ 50, stk. 1"
  citat: "Direkte ordret citat fra lovteksten…"
  url: https://www.retsinformation.dk/eli/lta/2025/1089
  sidst_verificeret: 2026-05-07

trigger:        # hvornår overhovedet kører reglen
  any_of:
    - signal: system.makes_decisions_about_persons

predikater:     # spørgsmål til sagsbehandler om systemet
  - id: anvendes_paa_boern
    spørgsmål: "Anvendes systemet i forbindelse med vurdering af børn?"
    type: boolean

afgørelse:      # GO / BETINGET-GO / NO-GO baseret på predikat-svarene
  hvis: "anvendes_paa_boern AND NOT dpia_eksisterer"
  så:
    status: BETINGET-GO
    krav: ["Gennemfør DPIA", "Bias-evaluering", …]
  ellers:
    status: GO
```

Sagsbehandleren udfylder predikat-svarene, regelmotoren returnerer en afgørelse. **LLM må ikke ændre afgørelsen** — kun udtrække signaler fra fritekst-beskrivelser.

## Hvad bidrager du med?

Jeg har lavet 6 templates klar (3 servicelov + 2 beskæftigelseslov + 1 sundhedslov). Per template har jeg gættet:
- Hvilken paragraf vi skal hjemle (best-effort baseret på kommunal-AI-domæne)
- Hvilke trigger-signaler er relevante
- Hvilke predikater juristen skal stille
- Hvilke krav vi gætter på er rimelige

**Du skal:**
1. Verificere paragraf-valget — er det den rigtige?
2. Levere ordret citat (min. 10 tegn) — vi bruger det til daglig auto-verifikation mod Retsinformation
3. Justere predikater og krav til kommunal praksis
4. Fortælle hvilke andre paragraffer vi mangler

## Citation-verifier

Vi kører et dagligt job der henter `kilde.url` og tjekker at `citat` stadig findes ordret. Hvis ikke, flagges reglen til "juridisk review". Det betyder:

- Når en lov-revision ændrer ordlyden, ved du det dagen efter
- Sagsbehandlere ser et advarsels-banner i vurderingen: "denne regel bygger på et citat der ikke længere findes — review påkrævet"
- Ingen risiko for at en gammel citat bliver brugt som hjemmel uden review

Det er hvorfor vi har brug for **ordret citat**. Parafraser virker ikke — de bliver flagget umiddelbart efter de skrives.

## Hvad sker der efter interviewet?

1. Jeg renskriver YAML'erne med dine citater og ændringer
2. Jeg sender dem til dig til endelig godkendelse
3. Når du siger god — vi fjerner `_template_`-prefix og reglerne aktiveres
4. Citation-verifier kører dagligt og overvåger
5. Sagsbehandlere kan udfylde predikat-svar i Tyr og få afgørelser hjemlet i din arbejde

Det betyder også: når du siger noget i et interview-svar, ender det som **bindende krav** i Tyr-systemet. Det er den modsatte af "uforpligtende rådgivning" — vi koder din juridiske vurdering ind i et produktionssystem.

## Tidsramme

- **30-45 min** interview (sammen)
- **1-2 timer** efterfølgende review af mine renskrevne YAML'er
- Total: ~2,5 timer fra dig

Foreslået format: en time afsat tid hvor vi sidder sammen og går templaterne igennem på skærm. Jeg taster ændringer ind direkte. Du afklarer praksis-detaljer.

---

**Spørgsmål inden interviewet?** Send mig en mail så afklarer vi inden mødet.

— Tyr-team / Digitalisering og IT
