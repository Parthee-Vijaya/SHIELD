# UI Improvement Analysis (Initial)

## Navigation & Global Search
- `frontend/src/components/Navbar.js` exposes a global search bar but currently only logs queries to the console. Wire it to an in-app search surface that can hit knowledge base terms, recent cases, and documentation via an async dropdown. Reuse existing `fetchJsonNoCache` pattern from the sidebar to keep responses cache-free and add keyboard navigation for results.
- The sidebar toggle in `frontend/src/components/Sidebar.js` lacks an accessible label and does not trap focus when the menu slides in on mobile. Add `aria-label`/`aria-expanded` attributes, move the toggle button into the tab order when collapsed, and implement an off-canvas focus trap so screen-reader users can close the menu reliably.
- Introduce a persistent quick-action strip (e.g., "New Assessment", "Report Issue") above the fold on all core pages to shorten journeys. Actions can reuse Styled Components tokens (`theme.spacing`, `theme.shadows`) so they visually align with CTA buttons in `HomePage.js`.

## Data Density & Visual Hierarchy
- The hero on `frontend/src/pages/HomePage.js` renders multiple animated stat cards and gradients. Consider a slimmer variant for authenticated users that prioritises current tasks (e.g., pending assessments) and defer marketing copy to a secondary panel. This will reduce scroll debt and improve first-contentful paint.
- Several cards (SystemHealthCard, News widgets) mix bespoke color logic with theme tokens. Move service status colors into the theme (`theme.colors.status`) so light/dark modes stay consistent and you can meet contrast requirements without manual hex edits.
- Review chart components in `frontend/src/pages/DashboardPage.js` (Chart.js) to ensure datasets use brand primitives and expose toggleable legends; current defaults hide comparisons for users with color-vision deficiencies.

## Feedback & Workflow Support
- `SystemHealthCard.js` polls backend endpoints but only refreshes on mount. Add a refresh cadence toggle (15/30/60s) and expose the last successful check timestamp to reassure operators during incidents.
- When compliance agents run long operations, show in-context progress (skeleton loaders exist but are not wired everywhere). Wrap API-heavy sections in the existing `FeatureCardSkeletonLoader` to avoid layout shifts.
- Expand empty states (e.g., no AI cases, blank research results) with direct next steps or documentation links. This keeps users from bouncing to the knowledge base manually.

## Accessibility & Localisation
- Audit semantic headings and skip links. Current layouts rely on div-heavy structures; adding a `Skip to content` link and landmark roles will help WCAG compliance.
- Leverage the `theme.breakpoints` tokens to deliver context-aware typography scaling for Danish/English localisation. Several hero strings overflow when the locale switches to English; clamp lengths or introduce responsive utilities.

## Recommended Next Steps
1. Implement functional global search with keyboard support and result chips.
2. Harden sidebar accessibility (labels, focus trap, escape-to-close) and validate with Lighthouse.
3. Harmonise status and chart colors through theme tokens, then snapshot visual regressions with Storybook or Chromatic.
4. Draft slim home variant driven by real usage metrics (pending cases, latest risk levels) and test with stakeholders.
