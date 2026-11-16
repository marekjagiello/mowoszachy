# ♞ MowoSzachy (Mowo-Szachy)

> Aplikacja webowa zoptymalizowana na smartfony do treningu gry w **fizyczne szachy** przy użyciu syntezy i rozpoznawania mowy (język polski) oraz wbudowanego silnika Stockfish.js.

🌐 **Aplikacja na żywo (GitHub Pages):** [https://marekjagiello.github.io/mowoszachy/](https://marekjagiello.github.io/mowoszachy/)

---

## 🎯 Główna idea

Gracz siedzi przy prawdziwej, fizycznej szachownicy. Telefon leży obok na stole i pełni rolę asystenta/trenera/przeciwnika:
- **Głosowe opisywanie pozycji**: czyta na głos aktualne ustawienie figur i pól w języku polskim.
- **Lektor ruchów**: oznajmia ruchy naturalnym językiem (np. *"Białe grają: Skoczek na f3"*).
- **Rozpoznawanie mowy (STT)**: gracz wypowiada ruchy lub komendy do mikrofonu (Web Speech API).
- **Wbudowany silnik Stockfish**: działa w Web Workerze w przeglądarce — brak wymogu zewnętrznego backendu.
- **Zero Build Step**: czysty HTML5, CSS3, ES Modules — brak `npm`, `webpack` czy skomplikowanych konfiguracji.

---

## 🚀 Wdrożenie na GitHub Pages (Automatyczne CI/CD)

Wdrożenie jest w pełni **zautomatyzowane**:
- **Każdy nowy commit** wypchnięty do gałęzi `main` na GitHubie automatycznie uruchamia workflow GitHub Actions (`.github/workflows/deploy.yml`), który publikuje najnowszą wersję aplikacji na GitHub Pages oraz synchronizuje gałąź `gh-pages`.

Dodatkowo dostępny jest skrypt pomocniczy [deploy.sh](file:///home/marek/ai%20projects/mowoszachy/deploy.sh) do ręcznego wdrożenia:

```bash
# Zwykłe wdrożenie aktualnego stanu gałęzi main:
./deploy.sh

# Wdrożenie z automatycznym zatwierdzeniem zmian z opisem:
./deploy.sh -m "Opis zmian w projekcie"
```

Skrypt automatycznie:
1. Sprawdza stan repozytorium git.
2. Wypycha bieżące zmiany na `origin/main`.
3. Wypycha stan projektu na gałąź `origin/gh-pages`.
4. Sprawdza i weryfikuje status publikacji w GitHub Pages przez CLI (`gh`).

---

## 💻 Uruchomienie lokalne

Do celów deweloperskich i testów na smartfonie w sieci lokalnej:

```bash
./start.sh
```

Serwer uruchamia się domyślnie na porcie `8080` z wyłączonym cache przeglądarki i endpointem logów diagnostycznych `/api/log`.
