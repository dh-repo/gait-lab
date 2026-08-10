# a11y-debugging skill reference

Name: a11y-debugging
Description: Uses DevTools/code inspection for accessibility (a11y) debugging and auditing based on web.dev guidelines. Use when testing semantic HTML, ARIA labels, focus states, keyboard navigation, tap targets, and color contrast.

Core Methodology:
1. Automated & Static Code Audits: Check WAI-ARIA landmark hierarchy (`<header>`, `<nav>`, `<aside>`, `<main>`, `<section>`, `<footer>`), keyboard navigation, focus rings, high-density tables.
2. Verify element semantic markup, ARIA roles, tabindex, focus rings (`focus:ring-2`, `focus-visible:`), keyboard event handlers (`onKeyDown`, etc.), high-density data tables (`<table`, `<th scope="col">`, `aria-label`).
3. Run tests and production builds to ensure zero regressions.
