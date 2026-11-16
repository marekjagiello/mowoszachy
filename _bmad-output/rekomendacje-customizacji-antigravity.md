# Rekomendacje Customizacji Platformy Antigravity dla MowoSzachy
*Kompleksowy przewodnik architektoniczny: Reguły (AGENTS.md), Skille, Protokół MCP, Hooki i Wtyczki*

> Główny dokument referencyjny znajduje się w głównym katalogu projektu: [ANTIGRAVITY_CUSTOMIZATIONS.md](../ANTIGRAVITY_CUSTOMIZATIONS.md).

---

## 1. Wprowadzenie i Kontekst Architektoniczny

### 1.1. Specyfika i Misja MowoSzachy
**MowoSzachy** to wyspecjalizowana aplikacja webowa (PWA) przeznaczona do treningu gry w **fizyczne szachy**. Urządzenie mobilne (smartfon) leży płasko na stole obok drewnianej szachownicy i pełni rolę asystenta, trenera oraz sparingpartnera. Użytkownik patrzy na fizyczne bierki i posługuje się głosem w języku polskim:
- **Synteza mowy (TTS)**: Aplikacja dyktuje aktualną pozycję, czyta ruchy przeciwnika oraz komunikaty trenerskie po polsku.
- **Rozpoznawanie mowy (STT)**: Gracz dyktuje posunięcia ("Skoczek na f3", "Krótka roszada", "Pion bije na d5") oraz komendy sterujące ("Nowa partia", "Cofnij", "Podpowiedz").
- **Lokalny silnik szachowy**: Stockfish.js działający po stronie klienta w dedykowanym wątku Web Worker (protokół UCI).
- **Zasada Zero Build Step**: Całość opiera się na natywnych modułach ES (`ES Modules`), czystym HTML5 i CSS3 bez użycia bundlerów (Webpack, Vite, Rollup) ani środowiska npm.
- **Serwer lokalny**: Skrypt `server.py` (Python 3 `ThreadingHTTPServer`) z wyłączonym buforowaniem (`Cache-Control: no-cache`) oraz endpointem zdalnej telemetrii `/api/log`.

### 1.2. Rola i Wyzwania dla Agentów Antigravity (`agy`)
Autonomiczni agenci Antigravity realizują zadania programistyczne, refaktoryzacyjne i wdrożeniowe bezpośrednio w repozytorium. Ze względu na unikalny profil technologiczny projektu, standardowe zachowania agentów LLM niosą ze sobą specyficzne ryzyka:
1. **Ryzyko naruszenia reguły Zero-Build**: Agenci często automatycznie próbują instalować paczki npm (`npm install`, `package.json`, TypeScript), co zniszczyłoby prostotę wdrożenia na GitHub Pages i natywną strukturę projektu.
2. **Ryzyko regresji fonetycznej mowy polskiej**: Zmiany w logice parsowania tekstu rozpoznanego przez mikrofon (`SpeechRecognition`) mogą zepsuć obsługę specyfiki polszczyzny (odmiana przez przypadki, nazewnictwo potoczne typu "koń"/"laufer", zniekształcenia silnika Google STT jak "503" zamiast "f3").
3. **Ryzyko degradacji Mobile-First**: Wprowadzenie elementów o polu dotykowym mniejszym niż 48x48px uniemożliwi obsługę telefonu z odległości ręki gracza siedzącego przy szachownicy.
4. **Ryzyko asynchronicznych wyścigów silnika (UCI Race Conditions)**: Komunikacja z `stockfish.js` w Web Workerze wymaga ścisłego przestrzegania maszyny stanów protokołu UCI.

---

## 2. Projektowe Reguły i Instrukcje (`AGENTS.md`)

Plik `AGENTS.md` stanowi fundament instrukcji systemowych Antigravity dla każdego agenta wchodzącego do repozytorium. Aktualna wersja pliku (34 linie) jest zbyt ogólna i nie precyzuje kluczowych ograniczeń domenowych.

### 2.1. Zidentyfikowane Luki w Obecnym `AGENTS.md`
- Brak formalnego zakazu wprowadzania narzędzi budowania i zależności Node.js.
- Brak wytycznych dotyczących fonetyki języka polskiego i odmiany bierek.
- Brak wytycznych dotyczących interakcji z Web Speech API (odblokowanie syntezatora, uprawnienia mikrofonu).
- Brak standardu dla testowania weryfikacyjnego bez przeglądarki ze wsparciem audio.

### 2.2. Rekomendowana, Kompletna Treść `AGENTS.md`
Poniższy blok stanowi gotową, rozszerzoną definicję reguł do umieszczenia w głównym pliku `AGENTS.md`:

```markdown
<!-- bmad:context -->
# MowoSzachy (Mowo-Szachy) — Reguły i Standardy Projektowe

Aplikacja webowa zoptymalizowana na smartfony (Chrome/Safari) do treningu gry w **fizyczne szachy** z wykorzystaniem polskojęzycznej syntezy (TTS) i rozpoznawania mowy (STT) oraz wbudowanego silnika szachowego Stockfish.js.

Telefon leży płasko przy fizycznej szachownicy — gracz skupia wzrok i dłonie na drewnianych figurach, a telefon służy jako głosowy partner i asystent.

---

## ŻELAZNE OGRANICZENIA ARCHITEKTONICZNE (NIEZMIENNE)

1. **BEZWZGLĘDNY ZAKAZ BUILD-STEPÓW (Zero Build Step)**:
   - Żadnego `package.json`, `npm`, `npx`, `yarn`, `pnpm`, `bun`, `webpack`, `vite`, `esbuild` ani `tsc`.
   - Kod JS musi działać bezpośrednio w przeglądarce jako natywne moduły ES (`<script type="module" src="js/app.js">`).
   - Wszystkie biblioteki zewnętrzne muszą znajdować się w `js/vendor/` jako czyste skrypty ES/IIFE.
   - Jeśli potrzebujesz nowej funkcjonalności zewnętrznej, pobierz plik standalone do `js/vendor/` — nie instaluj npm.

2. **MOBILE-FIRST & ERGONOMIA FIZYCZNEJ SZACHOWNICY**:
   - Elementy dotykowe: minimalny rozmiar każdego przycisku lub pola akcji to **48x48px** (rekomendowane 56px dla akcji głównych: mikrofon, odczyt pozycji).
   - Czytelność z odległości 1 metra: główna karta mowy (`.speech-card`) i nagłówek ruchu muszą zachowywać wysoką czcionkę (min. 20px) i kontrast WCAG AAA na ciemnym tle.
   - Obsługa bezpiecznych marginesów: zawsze stosuj `env(safe-area-inset-top)` i `env(safe-area-inset-bottom)`.

3. **STANDARD POLSKIEJ FONETYKI SZACHOWEJ**:
   - Wszystkie komunikaty głosowe lektora (TTS) muszą brzmieć w naturalnej, gramatycznie poprawnej polszczyźnie (np. "Białe grają: Skoczek na f3", NIGDY "Białe grają: En ef trzy").
   - Parser mowy (`normalizePolishSpeech`) musi akceptować synonimy bierek:
     - Skoczek: *skoczek, skoczka, skoczkiem, koń, konia, koniem, kucyk*.
     - Goniec: *goniec, gońca, gońcem, laufer, laufra*.
     - Hetman: *hetman, hetmana, hetmanem, dama, damę, damą, królowa*.
     - Wieża: *wieża, wieżę, wieżą*.
     - Król: *król, króla, królem*.
     - Pion: *pion, pionek, piona, pionka*.
   - Fonetyka liter i cyfr w STT: obsługa "ce" (c), "de" (d), "ef" (f), "gie" (g), "ha" (h), "be" (b) oraz anomalii silnika Google STT (np. "503" -> "f3").
   - Roszady: obsługa "krótka roszada", "mała roszada", "długa roszada", "duża roszada", "zero zero".

4. **INTEGRACJA STOCKFISH.JS & PROTOKÓŁ UCI**:
   - Silnik działa wyłącznie w dedykowanym Web Workerze (`new Worker('js/vendor/stockfish.js')`).
   - Zakaz blokowania wątku głównego (UI thread) operacjami silnika.
   - Każda komenda UCI (`position startpos moves ...`, `go depth X`) musi być synchronizowana z flagami stanu `stockfishReady` i `isEngineThinking`.
   - Zawsze obsługuj przypadek awarii lub zawieszenia workera poprzez możliwość restartu.

5. **CYKL ŻYCIA DŹWIĘKU I SYNTEZY**:
   - Web Audio (`AudioContext`) i `SpeechSynthesis` mogą być zablokowane przez politykę Autoplay przeglądarek dopóki użytkownik nie wykona pierwszej interakcji dotykowej (`touchstart`/`click`). Każdy moduł audio musi zawierać mechanizm `unlock()`.

6. **TELEMETRIA I WERYFIKACJA**:
   - Wszelkie błędy runtime i logi debugowania muszą trafiać do `/api/log` przez `remoteLog(type, message, stack)`.
   - Serwer deweloperski uruchamiany jest przez `./start.sh` (domyślny port 8000).
   - Logi przeglądarki monitorujemy w pliku `app_console.log` (lub skryptem `./check_logs.sh`).
   - Po każdej przetestowanej zmianie wykonaj atomowy commit w git z opisem w języku polskim.
```

---

## 3. Dedykowane Skille i Przepływy Pracy (Custom Skills & Workflows)

Rekomendowane skille w `.agents/skills/`:
- `mowoszachy-speech-eval`: Weryfikacja parsera mowy i fonetyki szachowej PL.
- `mowoszachy-chess-logic`: Walidacja reguł szachowych i modułu opisu pozycji.
- `mowoszachy-mobile-audit`: Audyt zgodności Mobile-First, WCAG i pól dotykowych.
- Skrypt wieloagentowy: `tools/workflows/verify_release.py` (wykorzystujący narzędzie `run_workflow` w Antigravity).

---

## 4. Integracje Serwerów MCP (Model Context Protocol)

Rekomendowane serwery MCP w Antigravity:
1. **Puppeteer MCP (`@modelcontextprotocol/server-puppeteer`)**:
   `agy mcp add puppeteer npx -y @modelcontextprotocol/server-puppeteer`
   Emulacja widoku mobilnego (390x844), weryfikacja DOM, kliknięcia w interfejs szachowy i odczyt logów konsoli.
2. **Natywny Serwer Szachowy (`chess-tools-mcp`)**:
   `agy mcp add chess-tools python3 tools/mcp_chess_server.py`
   Narzędzia walidacji FEN, opisu pozycji i generowania łamigłówek taktycznych.
3. **Telemetry & Log Monitor (`mowoszachy-dev-mcp`)**:
   Monitorowanie i czyszczenie `app_console.log`.

---

## 5. Hooki i Wtyczki Przepływu Pracy (Hooks & Plugins)

Definicja manifestu wtyczki `plugin.json` oraz hooki w `tools/hooks/hooks.json`:
- `post-edit`: Strażnik Zero-Build (`tools/hooks/check_zero_build.py`)
- `post-edit`: Sprawdzenie składni (`tools/hooks/check_syntax.py`)
- `pre-commit`: Testy fonetyki szachowej (`tools/test_speech_parser.py`)
- `on-turn-end`: Weryfikacja braku błędów w `app_console.log`

---

## 6. Priorytetyzowana Mapa Drogowa i Lista Kontrolna

- **Faza 1 (Dzień 1)**: Aktualizacja `AGENTS.md` + Skrypty hooków Zero-Build i składni.
- **Faza 2 (Tydzień 1)**: Wdrożenie skilli `.agents/skills/mowoszachy-*` i test runnera fonetycznego.
- **Faza 3 (Tydzień 2)**: Rejestracja serwerów MCP (Puppeteer + Chess Tools).
- **Faza 4 (Tydzień 3)**: Wdrożenie skryptu workflow `verify_release.py` oraz manifestu wtyczki.

*Szczegółowa treść implementacji znajduje się w [ANTIGRAVITY_CUSTOMIZATIONS.md](../ANTIGRAVITY_CUSTOMIZATIONS.md).*
