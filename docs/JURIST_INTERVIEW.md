# Jurist-interview — sektorlov-regler til Tyr v3

**Formål:** Få identificeret og verificeret de kommunale sektorlove der hyppigst rammer AI-vurderinger hos Kalundborg, så de kan bygges ind i Tyr-regelmotoren ud over de tværgående regler (AI Act, GDPR, Forvaltningslov, Offentlighedslov).

**Tidsramme:** 30-45 min. interview + 1-2 timer review af templates bagefter.

**Forberedelse til jurist:**
- Læs [JURIST_BRIEFING.md](./JURIST_BRIEFING.md) (5 min)
- Have de aktuelle lov-tekster ved hånden (Retsinformation):
  - [Lov om social service (LBK 1089/2025)](https://www.retsinformation.dk/eli/lta/2025/1089)
  - [Lov om en aktiv beskæftigelsesindsats (LBK 701/2024)](https://www.retsinformation.dk/eli/lta/2024/701)
  - [Sundhedsloven (LBK 248/2024)](https://www.retsinformation.dk/eli/lta/2024/248)

**Format for interviewet:** Vi går igennem 6 templates sammen. Per paragraf besvarer juristen 4 spørgsmål; jeg noterer/fixer i YAML undervejs.

---

## Generelle spørgsmål (5 min)

1. **Hvilke kommunale fagområder rammer AI-cases hyppigst hos Kalundborg pt.?**
   Mit gæt: Børn og Familie, Jobcenter, Voksenspecialenheden, Sundhed og Myndighed.
   Korrekt prioritering?

2. **Er der sektorlove jeg har overset?** Fx folkeskoleloven, dagtilbudsloven, dagpengeloven, integrationsloven?

3. **Hvad er Kalundborgs holdning til "AI som sagsbehandler-hjælp" vs. "AI der træffer afgørelse"?**
   Den tværgående regel er klar (GDPR art. 22), men hvordan tegnes grænsen i praksis hos jer?

---

## Servicelov (LBK 1089/2025) — 3 paragraffer (15 min)

### § 11 — Rådgivning og vejledning

Template: [`rules/sektorlove/servicelov/_template_par11_raadgivning.yaml`](../rules/sektorlove/servicelov/_template_par11_raadgivning.yaml)

**Spørgsmål:**

1. **Eksakt citat?** Hvilken konkret tekst i § 11 (eller stk.) er den vi skal hjemle reglen i? Vi har brug for ordret citat (10+ tegn) til citat-verifier.

2. **Hvornår triggers reglen?** Er det:
   - (a) AI der genererer faktisk vejledning til borger?
   - (b) AI der assisterer sagsbehandleren?
   - (c) Begge?

3. **Krav for compliance?** Hvad skal kommunen kunne dokumentere når man tager systemet i drift? (Min hypotese: sagsbehandler-godkendelse + vejledningsproces. Korrekt?)

4. **Er der noget særlig praksis fra Ankestyrelsen** vi bør indarbejde som ekstra evidens-krav?

### § 50 — Børnefaglig undersøgelse

Template: [`rules/sektorlove/servicelov/_template_par50_boernefaglig_undersoegelse.yaml`](../rules/sektorlove/servicelov/_template_par50_boernefaglig_undersoegelse.yaml)

**Spørgsmål:**

1. **Eksakt citat fra § 50, stk. 1?**

2. **Visiterende vs. advisory:** Min skabelon skelner mellem AI-screening der **fortæller** sagsbehandler om bekymring vs. AI der **udløser** § 50-undersøgelse. Er det den rigtige skelnen, eller er der yderligere niveauer?

3. **Bias-evaluering — kommunalt krav eller AI-Act-krav?** Min skabelon har bias-evaluering som krav. Er det Kalundborgs faste krav, eller udelukkende AI Act art. 10?

4. **Er der dokumentationspligt vi skal indarbejde?** (Fx journalisering når AI har haft input på en § 50-vurdering — vigtig for partshøring?)

### § 102 — Særlig støtte til voksne

Template: [`rules/sektorlove/servicelov/_template_par102_voksenstoette.yaml`](../rules/sektorlove/servicelov/_template_par102_voksenstoette.yaml)

**Spørgsmål:**

1. **Eksakt citat?**

2. **Hvor går grænsen mellem "AI-assist til funktionsvurdering" og "AI træffer faktisk visitering"?** Hvilke konkrete teknik-træk gør at det vipper fra GO til BETINGET-GO?

3. **Når særlige kategorier (helbredsdata) er i spil:** Er der særlige kommunale praksis-krav ud over GDPR art. 9? Fx krav om DPO-udtalelse for hver vurdering?

---

## Lov om aktiv beskæftigelsesindsats (LBK 701/2024) — 2 paragraffer (10 min)

### § 11 — Kontaktforløbet

Template: [`rules/sektorlove/beskaeftigelseslov/_template_par11_kontaktforloeb.yaml`](../rules/sektorlove/beskaeftigelseslov/_template_par11_kontaktforloeb.yaml)

**Spørgsmål:**

1. **Eksakt citat fra § 11 om kontaktforløbet?**

2. **Chatbot-erstatter-samtale:** Er chatbot-vejledning juridisk OK, eller skal samtalen være menneskelig? Hvordan tester I dette i praksis?

3. **Profilering der visiterer:** Hvis AI scorer ledige og påvirker hvilken indsats de får, hvordan ser jeres compliance-krav ud? (Mit gæt: GDPR art. 22 stk. 3 + DPIA + bestridelse.)

### § 27 — Jobplan

Template: [`rules/sektorlove/beskaeftigelseslov/_template_par27_jobplan.yaml`](../rules/sektorlove/beskaeftigelseslov/_template_par27_jobplan.yaml)

**Spørgsmål:**

1. **Eksakt citat?**

2. **AI-genereret jobplan-tekst:** Skal sagsbehandler godkende ordret indhold, eller blot strukturen? Praksis hos jer?

3. **Borger-godkendelse:** Hvordan er den lovligheds-procedure (§ 27 stk. ?) — automatisk samtykke, opt-out, klagevejledning?

---

## Sundhedslov (LBK 248/2024) — 1 paragraf (5 min)

### § 23 — Patientinformation

Template: [`rules/sektorlove/sundhedslov/_template_par23_patientinformation.yaml`](../rules/sektorlove/sundhedslov/_template_par23_patientinformation.yaml)

**Spørgsmål:**

1. **Eksakt citat fra § 23 om information?**

2. **AI-genererede patient-breve:** Hvordan ser kvalitetssikring ud? Læsbarhedsindeks, sundhedsfaglig godkendelse, eller begge?

3. **Sundhedsfaglig kontekst i kommunen:** Hvilke fagområder rammes (hjemmepleje, plejecentre, sygepleje, andet)?

---

## Afsluttende (5 min)

1. **Hvilke andre paragraffer skal med i v1?**
   Foreslåede kandidater jeg ikke har lavet template for endnu:
   - Forvaltningsloven § 27 (notatpligt) — relevant for AI-journalisering
   - Servicelov § 138 (klagevejledning)
   - GDPR art. 14 (oplysningspligt overfor borger)

2. **Anke-erfaringer:** Er der konkrete sager I har set hvor en AI-anvendelse er blevet underkendt af Ankestyrelsen eller Datatilsynet? Hvad var begrundelsen?

3. **Kalibrering:** På en skala fra "for striks → for løs", hvor placerer du templates som de er udfyldt? Skal vi rette krav-listerne strammere eller mere praktisk?

---

## Efter mødet

Jeg sender renskrevne YAML-filer (med dine citater + eventuelle ændringer) tilbage til godkendelse. Når du har sagt god, fjerner vi `_template_`-prefix så reglerne aktiveres i regelmotoren. Citation-verifier-jobbet kører dagligt og verificerer at citaterne stadig findes ordret i kilden.

Tak for tiden. — Tyr-team / Digitalisering og IT
