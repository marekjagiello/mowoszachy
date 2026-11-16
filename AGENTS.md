<!-- bmad:context -->
# MowoSzachy (Mowo-Szachy)

Aplikacja webowa zoptymalizowana na urządzenia mobilne (smartfony z przeglądarką np. Chrome/Safari) do treningu gry w **fizyczne szachy** przy użyciu syntezy i rozpoznawania mowy oraz wbudowanego silnika szachowego (Stockfish.js + chess.js).

Główna idea: Gracz siedzi przy prawdziwej, fizycznej szachownicy. Telefon leży obok na stole i pełni rolę mówiącego asystenta/trenera/przeciwnika:
- Czyta na głos aktualną pozycję (opis figur i pól w języku polskim).
- Oznajmia ruchy głosem (np. "Białe grają: Skoczek na f3").
- Rozpoznaje komendy i ruchy gracza wypowiadane do mikrofonu (Web Speech API).
- Korzysta z silnika Stockfish.js działającego lokalnie w Web Workerze bez wymaganego zewnętrznego serwera.

## Architektura i pliki
- `index.html`: Główny widok mobilny, karty mowy, duże przyciski dotykowe, rozwijany podgląd kontrolny szachownicy.
- `css/style.css`: Mobile-first, dark theme, responsywność, bezpieczne marginesy (safe-area-inset).
- `js/app.js`: Główny kontroler aplikacji:
  - Obsługa reguł i notacji szachowej (`chess.min.js`).
  - Synteza mowy w języku polskim (`window.speechSynthesis`).
  - Rozpoznawanie mowy w języku polskim (`SpeechRecognition` / `webkitSpeechRecognition`).
  - Integracja z silnikiem Stockfish (`stockfish.js` w Web Workerze).
  - Tłumacz pozycji i ruchów na naturalny język polski.
  - Zdalne logowanie błędów przeglądarki do `/api/log`.
- `js/vendor/`:
  - `chess.min.js`: Biblioteka reguł szachowych, generator ruchów, walidacja FEN/PGN.
  - `stockfish.js`: Silnik szachowy Stockfish skompilowany do JS/WebAssembly (protokół UCI).
- `tools/`: Skrypty weryfikacyjne, benchmarki fonetyczne mowy oraz serwery narzędziowe MCP.
- `server.py`: Lokalny serwer deweloperski w Pythonie 3 z wyłączonym cache'owaniem przeglądarki i endpointem logów `/api/log`.
- `start.sh`, `stop.sh`, `check_logs.sh`: Skrypty pomocnicze do uruchamiania i monitorowania.
- `.agents/skills/`: Dedykowane skille Antigravity (`mowoszachy-*`) oraz moduły BMAD.
- `ANTIGRAVITY_CUSTOMIZATIONS.md`: Pełny podręcznik customizacji platformy Antigravity (skille, MCP, hooki, roadmapa).
- `_bmad/` oraz `_bmad-output/`: Konfiguracja i artefakty BMAD (PRD, architektura, plany).

## Żelazne Zasady i Konwencje Deweloperskie

1. **Bezwzględne Zero Build Step**:
   - Działa bezpośrednio w przeglądarce za pomocą standardowych modułów ES (`ES Modules`) i HTML5/CSS3.
   - Żadnego `package.json`, `npm`, `npx`, `webpack`, `vite`, `yarn`, `pnpm` ani `tsc`.
   - Zewnętrzne biblioteki umieszczamy wyłącznie jako standalone bundle w `js/vendor/`.

2. **Mobile-First & Ergonomia Fizycznej Szachownicy**:
   - Przyciski i elementy klikalne muszą mieć minimum **48x48px** (główne akcje min. 56px).
   - Wysoki kontrast i czcionka min. 20px na karcie mowy dla czytelności z odległości 1 metra.
   - Zawsze uwzględniaj `env(safe-area-inset-top)` i `env(safe-area-inset-bottom)`.

3. **Standard Fonetyki Szachowej w Języku Polskim**:
   - Komunikaty lektora (TTS) muszą być wymawiane w pełnych zdaniach w naturalnej polszczyźnie (np. "Białe grają: Skoczek na f3", nigdy "En ef trzy").
   - Parser mowy (`normalizePolishSpeech`) musi akceptować synonimy bierek (*skoczek/koń*, *goniec/laufer*, *hetman/dama/królowa*, *wieża*, *król*, *pion/pionek*), nazwy fonetyczne liter (*ce, de, ef, gie, ha, be*) oraz specyficzne błędy STT (*503* -> *f3*).

4. **Integracja Stockfish.js & Protokół UCI**:
   - Silnik działa wyłącznie w tle w Web Workerze (`new Worker('js/vendor/stockfish.js')`).
   - Komunikacja odbywa się asynchronicznie wg protokołu UCI. Nie wolno blokować wątku UI.

5. **Cykl Życia Dźwięku i AudioContext**:
   - Dźwięki (chime) i synteza mowy wymagają odblokowania po pierwszym geście użytkownika (`click` / `touchstart`).

6. **Weryfikacja i Commit**:
   - Serwer testujemy przez `./start.sh` i weryfikujemy logi w `app_console.log` (lub `./check_logs.sh`).
   - Przed zatwierdzeniem kodu weryfikujemy brak błędów składniowych i regresji fonetycznej.
   - Commituj każdą zakończoną i przetestowaną zmianę w git z czytelnym opisem po polsku.

7. **Autonomiczne Uruchamianie Skryptów Python**:
   - Model ma pełne uprawnienie do uruchamiania lokalnych skryptów Python (`python3`, np. `server.py`, skryptów w `tools/`, benchmarków mowy, serwerów narzędziowych) bezpośrednio za pomocą narzędzia `run_command` bez pytania użytkownika o potwierdzenie lub pozwolenie w czacie.
