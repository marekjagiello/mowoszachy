---
name: mowoszachy-mobile-audit
description: 'Audytuje interfejs MowoSzachy pod kątem standardów Mobile-First: minimalne wymiary przycisków 48px, safe-area, kontrast ciemnego motywu i czytelność z odległości 1m.'
---

# MowoSzachy Mobile-First & Touch Target Audit

## Standardy do weryfikacji

1. **Wymiary pól dotykowych (Touch Targets)**:
   - Każdy element klikalny (`button`, `select`, `.pill-btn`, `.square`) musi mieć:
     - `min-height: 48px;`
     - `min-width: 48px;`
   - Główne przyciski asystenta (`#btnVoiceInput`, `#btnReadPosition`):
     - `min-height: 56px;`

2. **Obsługa Safe Area Insets**:
   - Dolna belka akcji i nawigacji musi respektować `env(safe-area-inset-bottom, 16px)`.
   - Górny nagłówek musi respektować `env(safe-area-inset-top, 0px)`.

3. **Ergonomia stolikowa (Physical Chessboard Proximity)**:
   - Karta mowy (`.speech-display-card`): tekst o rozmiarze minimum `1.25rem` (20px), kontrast z tłem min. 7:1.
   - Szachownica kontrolna: domyślnie zwinięta w akordeon (`#boardAccordion`), aby nie odciągać wzroku gracza od fizycznej drewnianej deski.
