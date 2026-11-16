<!-- bmad:context -->
## MowoSzachy (Mowo-Szachy)

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
- `server.py`: Lokalny serwer deweloperski w Pythonie 3 z wyłączonym cache'owaniem przeglądarki i endpointem logów `/api/log`.
- `start.sh`, `stop.sh`, `check_logs.sh`: Skrypty pomocnicze do uruchamiania i monitorowania.
- `.agents/skills/`: Skille metody BMAD (Benchmark / Agile-like / Method / Agent Developer).
- `_bmad/` oraz `_bmad-output/`: Konfiguracja i artefakty BMAD (PRD, architektura, plany).

## Zasady i konwencje
1. **Zero build step**: Działa bezpośrednio w przeglądarce za pomocą standardowych modułów ES i HTML5/CSS3. Nie wymaga Node.js/npm.
2. **Commit po każdej zmianie**: Rób commit po każdej zakończonej i przetestowanej zmianie.
3. **Mobile-First**: Przyciski muszą mieć minimum 48x48px, wysoki kontrast, intuicyjną obsługę bez konieczności ciągłego wpatrywania się w ekran (telefon leży przy fizycznej szachownicy).
4. **Weryfikacja**: Serwer testujemy przez `./start.sh` i weryfikujemy logi w `app_console.log`.
