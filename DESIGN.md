# Design System — Tyr ᛏ

> Kommunal AI-compliance-platform til Kalundborg Kommune. Hver vurdering er hjemlet i en konkret lovartikel — ordret citat, dagligt verificeret mod kilden, deterministisk regelmotor.

---

## Brand

| | |
|---|---|
| **Navn** | **Tyr** (Týr) |
| **Symbol** | **ᛏ** (Tiwaz-rune — pil opad) |
| **Mytologi** | Nordisk gud for lov, ed, retfærdighed. Stak hånden i Fenrirs gab for at holde sin ed. |
| **Konstellation** | Mac Studio: Bifrost · Odin · Saga · Skynet · **Tyr** |
| **Tagline** | "Hver vurdering peger på den ordret-verificerede lovartikel." |
| **Forløb** | Project Judge Dredd → Hjemmel → Forseti → **Tyr** |

**Det memorable:** Live-verificerede lov-citater. Konkurrenter kan ikke påstå det samme. Det er Tyrs superkraft — tyngde + friskhed.

---

## Aesthetic

**Direction:** **Northern Modern** — Skandinavisk civic-tech sobriety. Som en Snøhetta-tegnet rådhusgang. Ny generation af myndighed: lyst, klart, demokratisk autoritet uden 1990'er-Times-New-Roman.

**Decoration level:** Intentional — typography og hairline-borders gør arbejdet. Ingen gradients, ingen blob-shapes, ingen glassmorphism.

**Mood:** Embedsstuens nye stil. Rolig vished. Lyst kontorpapir, bronze rune som signatur, kongelig blå som autoritets-anker. Generøs hvidplads. Plex Sans dominerer.

**Reference:** Snøhetta studio, gov.uk, Etalab.fr, IBM Plex spec sheets, Linear (kun til density-pacing i drift-paneler).

---

## Typography

| Rolle | Font | Vægt | Noter |
|---|---|---|---|
| **Display / Hero** | IBM Plex Sans | 700 | Geometrisk, bred, sikker. -0.02em letter-spacing på h1. |
| **Body** | IBM Plex Sans | 400/500 | High legibility på kommunale skærme |
| **Citater (italic)** | IBM Plex Serif | 400 italic | Lov-tekst-uddrag i kursiv serif — adskiller sig fra brødtekst, signalerer "ordret kilde" |
| **Data / Case-ID / Mono** | IBM Plex Mono | 400/500 | ALLE case-id'er, lov-paragraffer, timestamps, status-pills, source-URLs |
| **Code** | IBM Plex Mono | 400 | Kode-blokke (sjælden) |

**Loading:** Google Fonts CDN — `IBM+Plex+Sans:wght@400;500;600;700`, `IBM+Plex+Mono:wght@400;500;600`, `IBM+Plex+Serif:wght@400;600` med `italic` variants.

**Skala (modular, base 16px):**
- xs: 0.72rem (mono labels, eyebrow)
- sm: 0.82rem (case-meta, badges)
- base: 0.95rem (body)
- md: 1.05rem (lede)
- lg: 1.18rem (subsection-heading)
- xl: 1.4rem (section h2)
- 2xl: 2rem (panel h2 / stat-værdier)
- 3xl: 2.4rem (case-titel h1)
- 4xl: 3rem+ (forside-hero — clamp(2.4rem, 5vw, 4rem))

**Forbudte fonte:** Lora, Source Serif Pro (var i Forseti/Hjemmel-perioden — droppes), Inter, Roboto, Arial, Helvetica, Open Sans, Montserrat, Poppins, Space Grotesk, Times New Roman, Comic Sans, Papyrus.

---

## Color

**Approach:** Restrained — kongelig blå er primær autoritet, bronze er signatur, neutrals dominerer. Farve er sjælden og betyder noget.

### Palette

```
/* Surface */
--bg:           #f5f4ef;   /* off-white kølig (papir, ikke cream) */
--surface:      #ffffff;   /* kort/paneler */
--surface-alt:  #ebe9e2;   /* hover, sekundær flade */

/* Primary — Kongelig blå (autoritet) */
--accent:       #0d2e54;
--accent-soft:  #e2eaf3;   /* aktiv-state baggrund i sidebar */

/* Bronze — runen, sekundær accent (varme + sjælden brug) */
--bronze:       #b08a4a;   /* ᛏ-rune, verdict-border, "betinget" status */
--bronze-soft:  #f3ead6;

/* Lines */
--line:         #d8d3c5;   /* primær 1px-border */
--line-soft:    #ebe7da;   /* tabel-row-divider */

/* Text */
--ink:          #14181f;   /* primær tekst */
--muted:        #555a64;   /* sekundær (case-meta, footer) */
--faded:        #8a8f96;   /* labels, caps-mono */

/* Semantic */
--success:      #2f6b2f;
--success-soft: #e3eedc;
--warning:      #b08a4a;   /* same som bronze */
--danger:       #a52822;
--danger-soft:  #f4dfdc;
```

### Verdict-mapping (compliance-status)

| Status | Farve | Brug |
|---|---|---|
| **GO** | `--success` på `--success-soft` | grøn pill — Mono-uppercase 0.7rem |
| **BETINGET-GO** | `--bronze` på `--bronze-soft` | bronze pill — samme bronze som rune |
| **NO-GO** | `--danger` på `--danger-soft` | rød pill |

### Dark mode

Dark mode redesigner surfaces (genbruger ikke samme palette):
- Bg: `#14181f` (ink → bg)
- Surface: `#1c2129`
- Accent: `#5a8ec4` (lighter blue for contrast)
- Bronze: `#d4a866` (lighter)
- Saturation reduktion 10-15% på alle accents

---

## Spacing

**Base unit:** 4px

**Density:** Comfortable — generøs hvidplads i case-detail-mode, compact i drift-paneler (data-overview).

**Skala:**
```
2xs  2px
xs   4px
sm   8px
md   16px   ← default gap mellem elementer
lg   24px
xl   32px   ← section padding
2xl  48px
3xl  64px   ← page-hero margin
```

**Container max-widths:**
- Frame (whole app): 1320px
- Reading content (citater): 720px
- Sidebar: 240px

---

## Layout

**Approach:** Hybrid — strict 12-col grid for app-skærme, asymmetric for forside og marketing.

### Page chrome

```
┌──────────────────────────────────────────────────┐
│ Topbar: wordmark "Tyr ᛏ" + sag-meta              │  18px padding
├──────┬───────────────────────────────────────────┤
│      │ Canvas (page content)                      │
│ 240  │   ├── breadcrumb (mono)                    │
│  px  │   ├── h1 case-title                        │
│ side │   ├── case-meta (mono · separated)         │
│ bar  │   ├── verdict-banner (bronze border-left)  │
│      │   ├── law-cards (1fr)                      │
│      │   └── DATA-OVERVIEW (always at bottom)     │
└──────┴───────────────────────────────────────────┘
```

### Data-overview-pattern (NEW — Tyr-signatur)

Hver hovedside får et **clean data-overview-section** ved bunden af canvas:

1. **4-kolonne stats-grid** — sager i workflow / betinget-go åbne / citater verificeret / flagget
2. **2-kolonne data-row:**
   - **Venstre:** "Seneste vurderinger" ledger-tabel (sags-id mono, navn, verdict-pill, timestamp, sagsbehandler)
   - **Højre:** "Citat-friskhed"-panel (rune-prik grøn/rød + lov-navn + verifier-tid)
3. **5-kolonne status-bar** — backend / database / LLM / citat-verifier / rule_engine version

Mønsteret giver hver side dual-purpose: case-detail øverst, drift-overblik nederst. Sagsbehandlere kan altid se "hvor står vi" uden at skifte side.

**Border-radius:**
- 2px — pills, små badges, mono-status
- 3-4px — knapper, input, kort
- 6px — frame (hele app)

**Borders:** Hairline 1px, varm-grå `--line`. Aldrig 2px+ borders. Aldrig dobbelt-border.

**Shadows:** Lette, varmlys.
```
sm:  0 1px 2px 0 rgba(20,24,31,0.04)
md:  0 4px 8px -2px rgba(20,24,31,0.06)
lg:  0 24px 48px -12px rgba(20,24,31,0.16)
```

Ingen `glow` shadows. Ingen `glass-morphism`. Ingen `backdrop-filter: blur()`.

---

## Motion

**Approach:** Minimal-functional — kun overgange der hjælper forståelse.

```
Easing:     enter: ease-out  | exit: ease-in  | move: ease-in-out
Duration:   micro: 100ms     | short: 180ms   | medium: 280ms
```

- Fade-in på modal/overlay: 180ms ease-out
- Sidebar nav-active: ingen animation (instant feedback)
- Verdict-pill: ingen animation (autoritet skal være statisk)
- Drag-drop på sager-kanban: 200ms ease-out på drop-position

**Aldrig:**
- Bouncing transitions
- Scroll-driven animations
- Hover-scales på primary cards
- Spring-animations (cubic-bezier(0.68, -0.55, 0.265, 1.55))
- Confetti, sparkles, eller andre celebration-effects

---

## Component patterns

### Verdict banner
```
┌─[bronze 4px left-border]──────────────────────────┐
│ [BRONZE PILL: BETINGET-GO]  3 af 15 regler udløser krav. │
│                               13 citater verificeret 04:00. │
└───────────────────────────────────────────────────┘
```

### Law card
```
┌───────────────────────────────────────────────────┐
│ AI Act art. 14    Menneskelig overvågning  [Krav]│
│ (mono blue)       (sans bold + serif italic       │
│                    citat-uddrag)                  │
└───────────────────────────────────────────────────┘
```
3-kolonne grid: 130px (artikel-num mono) / 1fr (titel + serif italic citat) / 100px (status-pill).

### Stats card (i data-overview)
```
┌──────────────┐
│ LABEL CAPS   │  ← mono 0.66rem caps faded
│ 23           │  ← sans 700 2rem ink
│ ↑ 4 sidste 7 │  ← mono 0.72rem muted (delta)
└──────────────┘
```

### Outline pill (filter chip)
- 999px border-radius
- 1px border `--line` → hover/active: `--accent`
- Active state: `--accent-soft` background + `--accent` color
- Padding: 6px 14px
- Font: Plex Sans 500 0.78rem letter-spacing 0.02em

### Status-bar cell
```
┌─────────────────┐
│ LABEL CAPS      │
│ value · context │
└─────────────────┘
```
5 cells horizontalt med 1px line dividers. `.ok` → `--success`, `.warn` → `--bronze`, `.danger` → `--danger`.

---

## Anti-slop check

Før du commit'er ny UI-kode:

- [ ] Bruger den IBM Plex Sans/Mono/Serif (ikke Inter, Lora, Source Serif Pro)?
- [ ] Bruger den `--accent` (#0d2e54) eller `--bronze` (#b08a4a) — ikke teglrød `#c94416` direkte?
- [ ] Hvis det er en hovedside: er der et data-overview ved bunden?
- [ ] Border-radius: 2-6px (ikke 999px på cards, ikke 0px)?
- [ ] Ingen gradient-fyldte CTAs?
- [ ] Ingen glassmorphism / blur?
- [ ] Ingen 3-kolonne icon-feature-grids på forsiden?
- [ ] Kursiv-citater er Plex Serif, ikke italicized Plex Sans?
- [ ] Mono-data er Plex Mono med tabular-nums hvis det er et tal?
- [ ] Status-pills har 2px border-radius (ikke 999px)?
- [ ] Mood-check: "Snøhetta-tegnet rådhusgang" — ikke "tech-startup landing page"?

---

## Implementation roadmap (alpha.18)

1. **theme.js rewrite** — Erstat lightTheme/darkTheme med Tyr-palette + Plex-fonts
2. **public/index.html + manifest.json** — `Tyr — kommunal AI-compliance` brand-strenge
3. **Sidebar.js** — wordmark "Tyr ᛏ" (rune i bronze)
4. **PageChrome.js** — eyebrow-prefix `Tyr · <kontekst>`, base-color tokens
5. **NewsSection.js** — IBM Plex fontfamilie
6. **HomePage.js** — ny hero med Tyr + ᛏ
7. **DataOverview-komponent** (NY) — stats-grid + ledger-tabel + citation-panel + status-bar — dropbar på alle hovedsider
8. **YAML rules + schema** — `forfatter` opdateres fra "Tyr core team" → "Tyr core team"
9. **README + CHANGELOG + HANDOFF** — rebrand
10. **Index/manifest meta** — PWA-titel, beskrivelse

Backend kræver intet skift — kun frontend + brand-strenge.

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-08 | Brand-skift Tyr → **Tyr** | Norse mythology fit (Bifrost/Odin/Saga/Skynet konstellation), eksakt semantik (lov + ed-bindere), single-syllabel skarphed, Tiwaz-rune ᛏ som logo-mærke |
| 2026-05-08 | Visuel direction: **Northern Modern** (B + data-overview) | Skandinavisk civic-tech sobriety. Off-white #f5f4ef + kongelig blå #0d2e54 + bronze #b08a4a. Cream-papir editorial droppes — for varm til en domsguds-platform. |
| 2026-05-08 | Typography: **IBM Plex** (Sans + Mono + Serif italic) | Open source, geometrisk, tabular-nums, italicserif til lov-citater (afløser Lora). Public-service-finger-print uden Times-New-Roman-konnotation. |
| 2026-05-08 | **Data-overview-pattern** introduceres | Hver hovedside får dual-purpose: case-detail øverst, drift-overblik nederst. Sagsbehandlere skal altid kunne se "hvor står vi" uden at skifte side. |
| 2026-05-08 | Kalundborg teglrød #c94416 fjernes som primær | Bevares kun til ekstrem-CTA og NO-GO-banner. Kongelig blå tager primary-rollen. |
