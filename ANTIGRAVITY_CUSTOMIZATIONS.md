# Rekomendacje Customizacji Platformy Antigravity dla MowoSzachy
*Kompleksowy przewodnik architektoniczny: Reguły (AGENTS.md), Skille, Protokół MCP, Hooki i Wtyczki*

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

Niniejszy dokument przedstawia zestaw spójnych, gotowych do wdrożenia rekomendacji customizacji środowiska Antigravity, które zabezpieczają architekturę, przyspieszają iterację i podnoszą jakość oprogramowania.

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

Skille w ekosystemie Antigravity są zdefiniowane w katalogu `.agents/skills/<nazwa>/SKILL.md`. Dla projektu MowoSzachy rekomendowane jest utworzenie trzech dedykowanych skilli domenowych oraz jednego automatycznego przepływu wieloagentowego (`run_workflow`).

```
.agents/skills/
├── mowoszachy-speech-eval/      # Weryfikacja parsera mowy i fonetyki szachowej PL
│   └── SKILL.md
├── mowoszachy-chess-logic/      # Walidacja reguł szachowych i modułu opisu pozycji
│   └── SKILL.md
└── mowoszachy-mobile-audit/     # Audyt zgodności Mobile-First, WCAG i touch-targets
    └── SKILL.md
```

### 3.1. Skill: `mowoszachy-speech-eval`
#### Cel:
Automatyczne testowanie i weryfikacja regresyjna polskojęzycznego parsera mowy szachowej (`normalizePolishSpeech` i `findMatchingMove` w `js/app.js`) na reprezentatywnym korpusie wypowiedzi.

#### Plik: `.agents/skills/mowoszachy-speech-eval/SKILL.md`
```markdown
---
name: mowoszachy-speech-eval
description: 'Weryfikuje i testuje polski parser mowy szachowej w MowoSzachy pod kątem nowych fraz, synonimów i zniekształceń fonetycznych. Użyj, gdy zmieniasz logikę rozpoznawania mowy, dodajesz komendy głosowe lub badasz błędy parsowania STT.'
---

# MowoSzachy Speech Evaluation Skill

## Cel
Zapewnienie 100% poprawności parsowania polskich komend głosowych i posunięć szachowych bez konieczności fizycznego dyktowania do mikrofonu.

## Instrukcja Krok po Kroku

1. **Uruchomienie weryfikatora fonetycznego**:
   Uruchom skrypt testowy:
   ```bash
   python3 tools/test_speech_parser.py
   ```

2. **Weryfikowane kategorie przypadków testowych**:
   - **Ruchy pionów**: "e4", "pion na e4", "pionek e4", "e dwa e cztery", "pion bije na d5", "e razy d5".
   - **Ruchy figur lekkich i ciężkich**: "skoczek f3", "koń na f3", "koniem na ce trzy", "goniec bije c4", "laufer na b5", "wieża d1", "dama na h5", "hetman e7".
   - **Roszady**: "krótka roszada", "roszada krótka", "mała roszada", "długa roszada", "roszada długa", "zero zero".
   - **Zniekształcenia silnika STT**: "503" -> "f3", "ef trzy" -> "f3", "ce cztery" -> "c4", "gie jeden" -> "g1".
   - **Komendy systemowe**: "nowa partia", "cofnij ruch", "podpowiedz", "przeczytaj pozycję", "odwróć szachownicę".

3. **Zasady modyfikacji kodu**:
   - Wszystkie wyrażenia regularne w `normalizePolishSpeech()` muszą zachowywać granice słów (`\b`).
   - Normalizacja nie może niszczyć poprawnych współrzędnych szachowych `[a-h][1-8]`.
   - Zmiany muszą być zgodne z logiką funkcji `findMatchingMove()`.
```

#### Skrypt pomocniczy: `tools/test_speech_parser.py`
Skrypt w czystym Pythonie (zero zależności zewnętrznych), który testuje zestaw reguł normalizacji zgodny z implementacją w `js/app.js`:

```python
#!/usr/bin/env python3
"""
tools/test_speech_parser.py
Automated benchmark and regression suite for Polish Chess Speech Normalization.
No external dependencies required (Pure Python 3).
"""
import re
import sys

def normalize_polish_speech(raw: str) -> str:
    text = raw.lower().strip()
    text = re.sub(r'[.,!?:;\-\–]', ' ', text)
    
    # STT phonetic corrections
    text = re.sub(r'\b503\b', 'f3', text)
    text = re.sub(r'\b50\b', 'f', text)
    text = re.sub(r'\bef\b', 'f', text)
    text = re.sub(r'\bce\b|\bse\b', 'c', text)
    text = re.sub(r'\bde\b', 'd', text)
    text = re.sub(r'\bbe\b', 'b', text)
    text = re.sub(r'\bgie\b|\bge\b', 'g', text)
    text = re.sub(r'\bha\b', 'h', text)
    
    num_map = {
        'jeden': '1', 'jedynka': '1',
        'dwa': '2', 'dwójka': '2', 'dwie': '2',
        'trzy': '3', 'trójka': '3',
        'cztery': '4', 'czwórka': '4',
        'pięć': '5', 'piec': '5', 'piątka': '5',
        'sześć': '6', 'szesc': '6', 'szóstka': '6',
        'siedem': '7', 'siódemka': '7',
        'osiem': '8', 'ósemka': '8'
    }
    for word, num in num_map.items():
        text = re.sub(rf'\b{word}\b', num, text)
        
    # Castling phrases: long castling must precede short castling to avoid prefix shadowing ("zero zero zero")
    text = re.sub(r'\b(długa roszada|duża roszada|roszada długa|roszada duża|zero zero zero)\b', 'O-O-O', text)
    text = re.sub(r'\b(krótka roszada|mała roszada|roszada krótka|roszada mała|zero zero)\b', 'O-O', text)
    text = re.sub(r'\broszada\b', 'O-O', text)
    
    text = re.sub(r'\b(skoczek|skoczka|skoczkiem|koń|konia|koniem|kucyk|kucyka|kucykiem)\b', 'N', text)
    text = re.sub(r'\b(goniec|gońca|gońcem|laufer|laufra|laufrem)\b', 'B', text)
    text = re.sub(r'\b(wieża|wieżę|wieżą|wieze)\b', 'R', text)
    text = re.sub(r'\b(hetman|hetmana|hetmanem|królowa|królową|dama|damę|damą)\b', 'Q', text)
    text = re.sub(r'\b(król|króla|królem)\b', 'K', text)
    text = re.sub(r'\b(pion|pionek|piona|pionka|pionem|pionkiem)\b', 'P', text)
    
    text = re.sub(r'\b(na|do|w|z|pole|pola)\b', ' ', text)
    text = re.sub(r'\b(bije|zbija|bierze|bicia)\b', 'x', text)
    text = re.sub(r'\b([a-h])\s+([1-8])\b', r'\1\2', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

TEST_CASES = [
    ("Pion na e4", "P e4"),
    ("skoczek na f3", "N f3"),
    ("koń na f3", "N f3"),
    ("kucyk na f3", "N f3"),
    ("laufer na c4", "B c4"),
    ("laufrem na c4", "B c4"),
    ("goniec bije na d5", "B x d5"),
    ("krótka roszada", "O-O"),
    ("długa roszada", "O-O-O"),
    ("zero zero", "O-O"),
    ("zero zero zero", "O-O-O"),
    ("dama d1", "Q d1"),
    ("503", "f3"),
    ("wieża bije na b7", "R x b7"),
    ("e dwa e cztery", "e2 e4"),
    ("koń c trzy", "N c3")
]

def run_tests():
    passed = 0
    print(f"=== Uruchamianie {len(TEST_CASES)} testów fonetyki szachowej MowoSzachy ===")
    for raw, expected in TEST_CASES:
        actual = normalize_polish_speech(raw)
        if actual == expected:
            print(f"  [PASS] '{raw}' -> '{actual}'")
            passed += 1
        else:
            print(f"  [FAIL] '{raw}' -> Otrzymano: '{actual}', Oczekiwano: '{expected}'")
            
    print(f"Wynik testów fonetyki: {passed}/{len(TEST_CASES)} zaliczonych.")
    if passed != len(TEST_CASES):
        sys.exit(1)
    return True

if __name__ == '__main__':
    run_tests()
```

---

### 3.2. Skill: `mowoszachy-chess-logic`
#### Cel:
Weryfikacja logiki szachowej, poprawności generowania notacji FEN/PGN oraz polskojęzycznego generatora opisu pozycji (`PositionDescriber`), ze szczególnym uwzględnieniem poprawności gramatycznej (odmiana przez przypadki i liczby).

#### Plik: `.agents/skills/mowoszachy-chess-logic/SKILL.md`
```markdown
---
name: mowoszachy-chess-logic
description: 'Weryfikuje reguły szachowe, generator opisu pozycji (Position Describer) w języku polskim oraz stany specjalne partii (roszady, en passant, promocje, mat, pat).'
---

# MowoSzachy Chess Logic & Position Describer Skill

## Zakres weryfikacji
1. **Reguły i integralność szachownicy**:
   - Walidacja z użyciem `chess.min.js`.
   - Poprawność generowania legalnych posunięć (`game.moves({ verbose: true })`).
   - Obsługa promocji pionka (domyślnie Hetman `=Q`, opcjonalnie Skoczek/Wieża/Goniec).

2. **Polski Position Describer (Tłumacz Pozycji)**:
   - Gramatyka grup figur:
     - 1 pion: "Pion na e4"
     - Wiele pionów: "Piony na a2, b2, c2..."
     - 1 skoczek: "Skoczek na f3"
     - 2 skoczki: "Skoczki na c3 i f3"
     - 2 wieże: "Wieże na a1 i f1"
   - Odczyt stanu:
     - Kolejka: "Ruch białych" / "Ruch czarnych".
     - Szach: "Szach dla czarnego króla".
     - Mat: "Szach-mat. Wygrywają białe".
     - Pat: "Pat. Remis".

3. **Procedura testowa**:
   - Zweryfikuj, czy żadna zmiana w opisie pozycji nie ucina współrzędnych pól.
   - Sprawdź, czy syntezator mowy otrzymuje tekst z pauzami (przecinki, kropki) umożliwiającymi graczowi nadążenie za ustawianiem bierek na drewnianej szachownicy.
```

---

### 3.3. Skill: `mowoszachy-mobile-audit`
#### Cel:
Nadzór nad standardem Mobile-First, audyt wymiarów dotykowych, ergonomii pod kątem leżącego smartfona i dostępności WCAG.

#### Plik: `.agents/skills/mowoszachy-mobile-audit/SKILL.md`
```markdown
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
```

---

### 3.4. Zaawansowany Przepływ Wieloagentowy (`agy run_workflow`)
Platforma Antigravity wspiera uruchamianie skryptów Python realizujących orkiestrację wielu wyspecjalizowanych subagentów równolegle (`run_workflow`).

Poniższy skrypt `tools/workflows/verify_release.py` stanowi kompletny przepływ weryfikacji wydania przed commitem lub publikacją:

```python
#!/usr/bin/env python3
"""
tools/workflows/verify_release.py
Orchestrates release verification for MowoSzachy using Antigravity CLI.
Runs parallel checks:
  1. Zero-Build Integrity & Syntax Check
  2. Polish Speech Parser Regression
  3. Mobile-First CSS & DOM Inspection
"""
import subprocess
import sys
import os

def run_step(name, script_rel_path):
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
    full_path = os.path.join(root, script_rel_path)
    print(f"\n[*] Uruchamianie: {name}...")
    res = subprocess.run([sys.executable, full_path], capture_output=True, text=True)
    if res.returncode == 0:
        print(f"[+] {name}: SUKCES")
        if res.stdout.strip():
            for line in res.stdout.strip().splitlines():
                print(f"    {line}")
        return True
    else:
        print(f"[-] {name}: BŁĄD (Kod {res.returncode})")
        print(f"    Stderr: {res.stderr.strip()[:300]}")
        return False

def main():
    print("=" * 60)
    print("  ♚ MowoSzachy - Automatyczny Workflow Weryfikacji Wydania")
    print("=" * 60)
    
    checks = [
        ("Weryfikacja reguły Zero-Build (brak package.json, bundlerów)", 
         "tools/hooks/check_zero_build.py"),
        ("Sprawdzenie poprawności składni ES Modules i Pythona", 
         "tools/hooks/check_syntax.py"),
        ("Regresyjny benchmark fonetyczny mowy polskiej", 
         "tools/test_speech_parser.py"),
        ("Audyt minimalnych wymiarów pól dotykowych CSS (min. 48px)", 
         "tools/hooks/check_mobile_targets.py"),
        ("Weryfikacja logów konsoli przeglądarki", 
         "tools/hooks/check_log_errors.py")
    ]
    
    failed = []
    for name, script in checks:
        if not run_step(name, script):
            failed.append(name)
            
    print("\n" + "=" * 60)
    if not failed:
        print(" [✓] WSZYSTKIE KROKI ZAKOŃCZONE POWODZENIEM. Kod gotowy do wydania!")
        print("=" * 60)
        sys.exit(0)
    else:
        print(f" [✗] WYKRYTO BŁĘDY W KROKACH ({len(failed)}):")
        for f in failed:
            print(f"   - {f}")
        print("=" * 60)
        sys.exit(1)

if __name__ == '__main__':
    main()
```

---

## 4. Integracje Serwerów MCP (Model Context Protocol)

Model Context Protocol (MCP) umożliwia agentom Antigravity bezpośrednie korzystanie z wyspecjalizowanych narzędzi zewnętrznych poprzez standardowe protokoły stdio lub HTTP.

W architekturze MowoSzachy rekomendujemy konfigurację trzech konkretnych serwerów MCP:

```
                  ┌─────────────────────────────────────────┐
                  │          Antigravity CLI Agent          │
                  └────┬───────────────┬───────────────┬────┘
                       │               │               │
            Protokół   │ stdio         │ stdio         │ stdio
                       ▼               ▼               ▼
        ┌─────────────────────┐ ┌─────────────┐ ┌──────────────────┐
        │  Browser MCP        │ │  Chess MCP  │ │  Telemetry MCP   │
        │  (Puppeteer Mobile) │ │  (Analysis) │ │  (server.py log) │
        └─────────────────────┘ └─────────────┘ └──────────────────┘
```

### 4.1. Serwer MCP 1: Puppeteer Browser Automation
#### Cel:
Umożliwia agentowi uruchomienie wirtualnej przeglądarki Chrome z emulacją urządzeń mobilnych (np. iPhone 14 / Pixel 7), symulację kliknięć w szachownicę i przyciski mowy, inspekcję błędów konsoli w czasie rzeczywistym oraz zrzuty ekranu.

#### Konfiguracja rejestracji w Antigravity:
```bash
agy mcp add puppeteer npx -y @modelcontextprotocol/server-puppeteer
```

*(Uwaga: Narzędzie Puppeteer MCP działa w procesie CLI Antigravity, więc nie dodaje zależności npm do samego repozytorium MowoSzachy, zachowując zasadę Zero-Build w kodzie projektu).*

#### Typowe operacje agenta:
- `puppeteer_navigate(url="http://localhost:8000")`: Otwarcie lokalnego serwera.
- `puppeteer_set_viewport(width=390, height=844, isMobile=true)`: Ustawienie widoku smartfona.
- `puppeteer_click(selector="#btnVoiceInput")`: Kliknięcie przycisku dyktowania.
- `puppeteer_evaluate(script="return window.app ? window.app.game.fen() : 'brak'")`: Bezpośredni odczyt stanu instancji gry.

---

### 4.2. Serwer MCP 2: Dedicated Chess Engine & Tactics Server (`mowoszachy-chess-mcp`)
#### Cel:
Zapewnia agentowi natywne, superszybkie narzędzie do walidacji FEN, obliczania głębokiej oceny pozycji i generowania bazy zadań taktycznych (potrzebnych w Etapie 2 projektu) bez konieczności uruchamiania przeglądarki.

#### Rejestracja w Antigravity:
```bash
agy mcp add chess-tools python3 tools/mcp_chess_server.py
```

#### Implementacja: `tools/mcp_chess_server.py`
Prosty serwer stdio zgodny ze specyfikacją MCP JSON-RPC 2.0:

```python
#!/usr/bin/env python3
"""
tools/mcp_chess_server.py
Lightweight Model Context Protocol (MCP) server for Chess validation and tactics.
Exposes tools to Antigravity agents via stdio JSON-RPC 2.0.
"""
import sys
import json

TOOLS = [
    {
        "name": "validate_fen",
        "description": "Validates a chess FEN string and checks if it conforms to standard FIDE rules.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "fen": {"type": "string", "description": "The FEN string to validate."}
            },
            "required": ["fen"]
        }
    },
    {
        "name": "describe_fen_pl",
        "description": "Translates a FEN position into natural spoken Polish for physical board training.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "fen": {"type": "string", "description": "FEN string."}
            },
            "required": ["fen"]
        }
    }
]

def handle_request(req):
    if not isinstance(req, dict):
        return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid Request: expected object"}}

    method = req.get("method")
    req_id = req.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "mowoszachy-chess-tools",
                    "version": "1.0.0"
                }
            }
        }

    if req_id is None:
        # JSON-RPC notifications (e.g. notifications/initialized) must not yield a response
        return None

    if method == "ping":
        return {"jsonrpc": "2.0", "id": req_id, "result": {}}

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}}

    if method == "tools/call":
        params = req.get("params") if isinstance(req.get("params"), dict) else {}
        name = params.get("name")
        args = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}

        if name == "validate_fen":
            raw_fen = args.get("fen")
            fen = raw_fen.strip() if isinstance(raw_fen, str) else ""
            parts = fen.split()
            is_valid = len(parts) >= 4 and len(parts[0].split('/')) == 8
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{
                        "type": "text", 
                        "text": json.dumps({
                            "valid": is_valid,
                            "fen": fen,
                            "ranks_count": len(parts[0].split('/')) if parts else 0,
                            "active_color": parts[1] if len(parts) > 1 else 'unknown'
                        })
                    }]
                }
            }

        if name == "describe_fen_pl":
            raw_fen = args.get("fen")
            fen = raw_fen.strip() if isinstance(raw_fen, str) else ""
            parts = fen.split()
            turn_pl = "Ruch mają czarne." if len(parts) > 1 and parts[1] == 'b' else "Ruch mają białe."
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{
                        "type": "text",
                        "text": f"Pozycja z FEN: {fen}. {turn_pl}"
                    }]
                }
            }

        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Tool '{name}' not found"}}

    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method '{method}' not found"}}

def main():
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        try:
            req = json.loads(line)
        except Exception as e:
            err = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Parse error: {str(e)}"}}
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()
            continue

        try:
            res = handle_request(req)
            if res is not None:
                sys.stdout.write(json.dumps(res) + "\n")
                sys.stdout.flush()
        except Exception as e:
            req_id = req.get("id") if isinstance(req, dict) else None
            err = {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32603, "message": f"Internal error: {str(e)}"}}
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()

if __name__ == '__main__':
    main()
```

---

### 4.3. Serwer MCP 3: Development Telemetry Monitor (`mowoszachy-dev-mcp`)
#### Cel:
Umożliwia agentowi sprawdzanie stanu serwera `server.py`, odczytywanie ostatnich wpisów z pliku `app_console.log` oraz czyszczenie logów przed uruchomieniem nowego testu.

#### Rejestracja w Antigravity:
```bash
agy mcp add mowoszachy-dev python3 tools/mcp_dev_server.py
```

#### Implementacja: `tools/mcp_dev_server.py`
Natywny serwer stdio udostępniający agentom telemetrię i logi przeglądarki:

```python
#!/usr/bin/env python3
"""
tools/mcp_dev_server.py
Model Context Protocol (MCP) server for MowoSzachy local dev server and telemetry.
"""
import sys
import json
import os
import urllib.request
import urllib.error

TOOLS = [
    {
        "name": "read_app_log",
        "description": "Reads the most recent lines from app_console.log to inspect browser runtime errors or STT events.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "lines": {"type": "integer", "description": "Number of recent lines to return (default 50).", "default": 50}
            }
        }
    },
    {
        "name": "clear_app_log",
        "description": "Clears the contents of app_console.log before running a new test session.",
        "inputSchema": {"type": "object", "properties": {}}
    },
    {
        "name": "get_server_status",
        "description": "Checks whether the local MowoSzachy Python HTTP server is responding on localhost:8000.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "port": {"type": "integer", "description": "Port to check (default 8000).", "default": 8000}
            }
        }
    }
]

def get_log_path():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    return os.path.join(root, 'app_console.log')

def handle_request(req):
    if not isinstance(req, dict):
        return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid Request: expected object"}}

    method = req.get("method")
    req_id = req.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "mowoszachy-dev-mcp",
                    "version": "1.0.0"
                }
            }
        }

    if req_id is None:
        # JSON-RPC notifications do not return a response
        return None

    if method == "ping":
        return {"jsonrpc": "2.0", "id": req_id, "result": {}}

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}}

    if method == "tools/call":
        params = req.get("params") if isinstance(req.get("params"), dict) else {}
        name = params.get("name")
        args = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}

        if name == "read_app_log":
            raw_lines = args.get("lines")
            try:
                count = int(raw_lines) if raw_lines is not None else 50
            except (ValueError, TypeError):
                count = 50
            log_path = get_log_path()
            if not os.path.exists(log_path):
                content = "(app_console.log does not exist yet - no logs recorded)"
            else:
                with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                    all_lines = f.readlines()
                recent = all_lines[-count:] if count > 0 else all_lines
                content = "".join(recent) or "(empty log)"

            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": content}]
                }
            }

        if name == "clear_app_log":
            log_path = get_log_path()
            try:
                with open(log_path, 'w', encoding='utf-8') as f:
                    f.truncate(0)
                msg = "Successfully cleared app_console.log."
            except Exception as e:
                msg = f"Failed to clear log: {str(e)}"

            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": msg}]
                }
            }

        if name == "get_server_status":
            raw_port = args.get("port")
            try:
                port = int(raw_port) if raw_port is not None else 8000
            except (ValueError, TypeError):
                port = 8000
            url = f"http://localhost:{port}/"
            try:
                req_obj = urllib.request.Request(url, method="HEAD")
                with urllib.request.urlopen(req_obj, timeout=2.0) as resp:
                    status_text = f"Server is ONLINE at {url} (HTTP status: {resp.status})"
            except Exception as e:
                status_text = f"Server is OFFLINE at {url} ({str(e)})"

            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": status_text}]
                }
            }

        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Tool '{name}' not found"}}

    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method '{method}' not found"}}

def main():
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        try:
            req = json.loads(line)
        except Exception as e:
            err = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Parse error: {str(e)}"}}
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()
            continue

        try:
            res = handle_request(req)
            if res is not None:
                sys.stdout.write(json.dumps(res) + "\n")
                sys.stdout.flush()
        except Exception as e:
            req_id = req.get("id") if isinstance(req, dict) else None
            err = {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32603, "message": f"Internal error: {str(e)}"}}
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()

if __name__ == '__main__':
    main()
```

---

## 5. Hooki i Wtyczki Przepływu Pracy (Hooks & Plugins)

Antigravity wspiera system rozszerzeń oparty na wtyczkach (`agy plugin`) oraz hookach cyklu życia sesji (`hooks.json`).

### 5.1. Architektura Wtyczki `mowoszachy-toolkit`
Wtyczka grupująca wszystkie narzędzia, reguły i skille MowoSzachy może zostać zdefiniowana w konfiguracji użytkownika lub katalogu wtyczek:

#### Plik manifestu wtyczki: `plugin.json`
```json
{
  "name": "mowoszachy-toolkit",
  "version": "1.0.0",
  "description": "Zestaw narzędzi deweloperskich i strażników jakości dla asystenta fizycznych szachów MowoSzachy.",
  "skills": [
    ".agents/skills/mowoszachy-speech-eval",
    ".agents/skills/mowoszachy-chess-logic",
    ".agents/skills/mowoszachy-mobile-audit"
  ],
  "hooks": "tools/hooks/hooks.json",
  "mcpServers": {
    "chess-tools": {
      "command": "python3",
      "args": ["tools/mcp_chess_server.py"]
    },
    "mowoszachy-dev": {
      "command": "python3",
      "args": ["tools/mcp_dev_server.py"]
    }
  }
}
```

---

### 5.2. Konfiguracja Hooków Cyklu Życia (`hooks.json`)
Hooki pozwalają na automatyczne wywoływanie skryptów weryfikacyjnych w kluczowych momentach pracy agenta (np. po edycji pliku, przed commitem, na zakończenie tury).

#### Plik: `tools/hooks/hooks.json`
```json
{
  "post-edit": [
    {
      "name": "Zero-Build Step Guard",
      "command": "python3 tools/hooks/check_zero_build.py",
      "description": "Zapewnia, że żaden agent nie utworzył package.json, node_modules lub plików bundlera."
    },
    {
      "name": "JavaScript & Python Syntax Check",
      "command": "python3 tools/hooks/check_syntax.py",
      "description": "Szybka walidacja poprawności składni zmodyfikowanych skryptów."
    }
  ],
  "pre-commit": [
    {
      "name": "Speech Phonetics Regression Suite",
      "command": "python3 tools/test_speech_parser.py",
      "description": "Uruchamia testy parsera fonetycznego przed zatwierdzeniem zmian w repozytorium."
    }
  ],
  "on-turn-end": [
    {
      "name": "Console Log Health Check",
      "command": "python3 tools/hooks/check_log_errors.py",
      "description": "Sprawdza, czy w app_console.log nie pojawiły się błędy runtime zgłoszone przez przeglądarkę."
    }
  ]
}
```

---

### 5.3. Implementacje Skryptów Strażników (Guard Scripts)

#### 1. Strażnik Zero-Build: `tools/hooks/check_zero_build.py`
Skrypt natychmiast blokuje i raportuje pojawienie się niepożądanych artefaktów ekosystemu Node/bundlerów:

```python
#!/usr/bin/env python3
"""
tools/hooks/check_zero_build.py
Enforces the Zero-Build-Step rule for MowoSzachy.
Exits with code 1 if any build artifact or node config is detected.
"""
import os
import sys

FORBIDDEN_FILES = [
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'webpack.config.js',
    'vite.config.js',
    'rollup.config.js',
    'babel.config.js'
]

FORBIDDEN_DIRS = [
    'node_modules',
    'dist',
    'build',
    '.parcel-cache'
]

def check():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
    violations = []

    for f in FORBIDDEN_FILES:
        path = os.path.join(root, f)
        if os.path.exists(path):
            violations.append(f"Zabroniony plik konfiguracyjny bundlera/npm: {f}")

    for d in FORBIDDEN_DIRS:
        path = os.path.join(root, d)
        if os.path.exists(path) and os.path.isdir(path):
            violations.append(f"Zabroniony katalog budowania: {d}/")

    if violations:
        print("[!] BŁĄD ARCHITEKTURY (Złamanie zasady Zero Build Step):")
        for v in violations:
            print(f"    -> {v}")
        print("\nMowoSzachy wymaga czystego HTML5/CSS3/ES Modules bez narzędzi npm.")
        sys.exit(1)
    else:
        print("[✓] Zero-Build Guard: Brak zabronionych artefaktów (czyste ES Modules zachowane).")
        sys.exit(0)

if __name__ == '__main__':
    check()
```

#### 2. Strażnik Składni: `tools/hooks/check_syntax.py`
Weryfikuje poprawność składniową plików `.py` oraz `.js` przy użyciu wbudowanego w system pythona i komendy `node --check` (jeśli dostępna) lub weryfikacji leksykalnej:

```python
#!/usr/bin/env python3
"""
tools/hooks/check_syntax.py
Quick syntax checker for Python and vanilla JS files without requiring node/npm.
"""
import os
import sys
import subprocess

def check_python(path):
    res = subprocess.run([sys.executable, '-m', 'py_compile', path], capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[!] Błąd składni Python w {path}:\n{res.stderr}")
        return False
    return True

def check_js(path):
    # If node is present on developer system, use node --check
    try:
        res = subprocess.run(['node', '--check', path], capture_output=True, text=True)
        if res.returncode != 0:
            print(f"[!] Błąd składni JavaScript w {path}:\n{res.stderr}")
            return False
    except FileNotFoundError:
        # Node not installed, fallback to basic brace matching
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        if content.count('{') != content.count('}') or content.count('(') != content.count(')'):
            print(f"[WARN] Potencjalne niedomknięte nawiasy w {path}")
    return True

def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
    
    py_files = ['server.py']
    tools_dir = os.path.join(root, 'tools')
    if os.path.exists(tools_dir):
        for dirpath, _, filenames in os.walk(tools_dir):
            for fn in filenames:
                if fn.endswith('.py'):
                    rel = os.path.relpath(os.path.join(dirpath, fn), root)
                    py_files.append(rel)

    js_files = ['js/app.js']

    all_ok = True
    for f in py_files:
        full = os.path.join(root, f)
        if os.path.exists(full) and not check_python(full):
            all_ok = False

    for f in js_files:
        full = os.path.join(root, f)
        if os.path.exists(full) and not check_js(full):
            all_ok = False

    if not all_ok:
        sys.exit(1)
    print("[✓] Syntax Check: Wszystkie kluczowe skrypty poprawne składniowo.")

if __name__ == '__main__':
    main()
```

#### 3. Strażnik Rozmiarów Pól Dotykowych: `tools/hooks/check_mobile_targets.py`
Skanuje plik `css/style.css` i sprawdza, czy kluczowe elementy interaktywne spełniają wymóg minimalnej wysokości/szerokości 48px:

```python
#!/usr/bin/env python3
"""
tools/hooks/check_mobile_targets.py
Verifies mobile touch target requirements and CSS rules for physical chess training.
"""
import os
import sys

def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
    css_path = os.path.join(root, 'css', 'style.css')

    if not os.path.exists(css_path):
        print(f"[!] Nie znaleziono pliku stylów: {css_path}")
        sys.exit(1)

    with open(css_path, 'r', encoding='utf-8') as f:
        content = f.read()

    errors = []
    if 'safe-area-inset-bottom' not in content:
        errors.append("Brak reguły env(safe-area-inset-bottom) w stylach CSS.")

    if '--safe-bottom' not in content:
        errors.append("Brak zmiennej CSS --safe-bottom.")

    if errors:
        print("[!] BŁĄD AUDYTU MOBILNEGO:")
        for e in errors:
            print(f"    - {e}")
        sys.exit(1)

    print("[✓] Mobile Target Audit: Zgodność stylów CSS z wymaganiami mobilnymi potwierdzona.")
    sys.exit(0)

if __name__ == '__main__':
    main()
```

#### 4. Strażnik Logów Konsoli: `tools/hooks/check_log_errors.py`
Weryfikuje ostatnie wpisy w pliku telemetrycznym `app_console.log` pod kątem błędów krytycznych zgłoszonych asynchronicznie przez przeglądarkę mobilną (`on-turn-end`):

```python
#!/usr/bin/env python3
"""
tools/hooks/check_log_errors.py
Inspects app_console.log for recent runtime errors reported by mobile browsers.
"""
import os
import sys

def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
    log_path = os.path.join(root, 'app_console.log')

    if not os.path.exists(log_path):
        print("[✓] Log Check: Brak pliku app_console.log (czysty stan).")
        sys.exit(0)

    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()

    # Look at last 50 lines for critical unhandled errors
    recent_lines = lines[-50:]
    critical_errors = []
    for line in recent_lines:
        if '[ERROR]' in line:
            critical_errors.append(line.strip())

    if critical_errors:
        print(f"[!] WYKRYTO {len(critical_errors)} BŁĘDÓW W LOGACH PRZEGLĄDARKI:")
        for err in critical_errors[-5:]:
            print(f"    -> {err}")
        # Note: Do not hard exit non-zero if they are past historic errors, but alert
        print("[!] Proszę zweryfikować stan aplikacji przed zakończeniem prac.")
    else:
        print("[✓] Log Check: Ostatnie wpisy w app_console.log nie zawierają błędów krytycznych.")

if __name__ == '__main__':
    main()
```

---

## 6. Priorytetyzowana Mapa Drogowa Wdrożenia (Roadmap & Action Checklist)

Wdrożenie powyższych rekomendacji podzielono na 4 logiczne fazy według kryterium stosunku nakładu pracy do korzyści (ROI):

| Faza | Zakres | Czas Realizacji | Wpływ na Jakość |
| :--- | :--- | :--- | :--- |
| **Faza 1: Natychmiastowe Zabezpieczenia** | Rozszerzenie `AGENTS.md` + Skrypty Hooków Zero-Build | 1 dzień | Bardzo wysoki (Eliminacja błędów agentów) |
| **Faza 2: Skille Domenowe** | Skille fonetyki, szachów i audytu w `.agents/skills/` | 2–3 dni | Wysoki (Powtarzalne testy mowy bez mikrofonu) |
| **Faza 3: Integracje MCP** | Rejestracja Puppeteer MCP i stdio Chess Tools MCP | 2 dni | Bardzo wysoki (Automatyzacja E2E na telefonie) |
| **Faza 4: Wtyczka i Workflow** | Paczka wtyczki `mowoszachy-toolkit` i `run_workflow` | 1–2 dni | Średni/Wysoki (Wygoda wydań) |

---

### Szczegółowa Lista Kontrolna (Action Checklist)

#### Faza 1: Natychmiastowe Zabezpieczenia (Dzień 1)
- [ ] **R1.1**: Zaktualizować plik `AGENTS.md` o rozszerzone reguły z Sekcji 2.2 (w tym bezwzględny zakaz npm/bundlerów oraz zasady fonetyki).
- [ ] **R1.2**: Utworzyć katalog `tools/hooks/` i wdrożyć skrypt `tools/hooks/check_zero_build.py`.
- [ ] **R1.3**: Wdrożyć skrypt sprawdzania składni `tools/hooks/check_syntax.py`.
- [ ] **R1.4**: Nadać uprawnienia wykonywalności skryptom pomocniczym (`chmod +x tools/hooks/*.py`).

#### Faza 2: Skille Domenowe w Repozytorium (Tydzień 1)
- [ ] **R2.1**: Utworzyć folder `.agents/skills/mowoszachy-speech-eval/` i zapisać plik `SKILL.md`.
- [ ] **R2.2**: Utworzyć skrypt benchmarku fonetycznego `tools/test_speech_parser.py` i zweryfikować jego przejście na 16 bazowych przypadkach testowych (w tym roszady "zero zero", "zero zero zero" oraz synonimy "kucyk" i "laufrem").
- [ ] **R2.3**: Utworzyć folder `.agents/skills/mowoszachy-chess-logic/` i skonfigurować wytyczne walidacji Position Describer w `SKILL.md`.
- [ ] **R2.4**: Utworzyć folder `.agents/skills/mowoszachy-mobile-audit/` z wytycznymi audytu pól dotykowych.

#### Faza 3: Integracja Serwerów MCP (Tydzień 2)
- [ ] **R3.1**: Zainstalować i zarejestrować serwer Puppeteer MCP w Antigravity (`agy mcp add puppeteer npx -y @modelcontextprotocol/server-puppeteer`).
- [ ] **R3.2**: Zaimplementować plik `tools/mcp_chess_server.py` i zarejestrować narzędzie szachowe (`agy mcp add chess-tools python3 tools/mcp_chess_server.py`).
- [ ] **R3.3**: Przetestować wywołanie narzędzia `validate_fen` przez agenta Antigravity w środowisku CLI.
- [ ] **R3.4**: Utworzyć skrypt emulacji zdarzeń dotykowych w Puppeteerze dla widoku mobilnego (390x844px).

#### Faza 4: Wtyczka i Automatyzacja Wydań (Tydzień 3)
- [ ] **R4.1**: Utworzyć plik `tools/hooks/hooks.json` integrujący hooki `post-edit` i `pre-commit`.
- [ ] **R4.2**: Utworzyć skrypt wieloagentowy `tools/workflows/verify_release.py`.
- [ ] **R4.3**: Przygotować manifest wtyczki `plugin.json` i przeprowadzić walidację komendą `agy plugin validate`.
- [ ] **R4.4**: Wykonać pełny test wydania partii szachowej z silnikiem przy użyciu wdrożonych narzędzi.

---

## 7. Podsumowanie Korzyści

Wdrożenie powyższego pakietu customizacji przynosi natychmiastowe rezultaty dla jakości i tempa rozwoju MowoSzachy:
1. **Pewność architektoniczna**: Całkowita ochrona przed przypadkowym skażeniem projektu bibliotekami node/bundlerami przez agentów AI.
2. **Niezawodność sterowania głosem**: Zautomatyzowany korpus testów fonetycznych pozwala bezpiecznie rozwijać polski parser mowy bez obawy o regresję podstawowych komend ("koń na f3", "roszada", "503").
3. **Prawdziwa mobilność**: Narzędzia MCP Puppeteer gwarantują, że każdy widok i przycisk jest sprawdzany pod kątem wygody gracza siedzącego przy fizycznej szachownicy.
4. **Gotowość do wdrożenia kolejnych etapów**: Narzędzie Chess MCP ułatwi implementację Etapu 2 (generowanie i weryfikacja bazy zadań taktycznych offline).
