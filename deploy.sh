#!/usr/bin/env bash
# ==============================================================================
# MowoSzachy - Skrypt wdrożenia na GitHub Pages
# ==============================================================================
set -euo pipefail

COMMIT_MSG=""
AUTO_CONFIRM=false

usage() {
  echo "Użycie: $0 [OPCJE]"
  echo "Opcje:"
  echo "  -m \"WIADOMOŚĆ\"   Automatycznie zatwierdź niezatwierdzone zmiany z podanym opisem"
  echo "  -y, --yes          Nie pytaj o potwierdzenie przy wykryciu zmian roboczych"
  echo "  -h, --help         Wyświetl tę pomoc"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m)
      COMMIT_MSG="$2"
      shift 2
      ;;
    -y|--yes)
      AUTO_CONFIRM=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Nieznana opcja: $1"
      usage
      ;;
  esac
done

echo "♟️  MowoSzachy - Rozpoczynam wdrożenie na GitHub Pages..."

# 1. Sprawdzenie czy jesteśmy w repozytorium git
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Błąd: To nie jest repozytorium git!" >&2
  exit 1
fi

# 2. Sprawdzenie niezatwierdzonych zmian (w tym nowych nieśledzonych plików)
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Wykryto niezatwierdzone zmiany w katalogu roboczym."
  if [ -n "$COMMIT_MSG" ]; then
    echo "📝 Automatyczne zatwierdzanie zmian: \"$COMMIT_MSG\""
    git add -A
    git commit -m "$COMMIT_MSG"
  elif [ "$AUTO_CONFIRM" = true ]; then
    echo "📝 Automatyczne zatwierdzanie zmian z domyślnym opisem..."
    git add -A
    git commit -m "Aktualizacja przed wdrożeniem na GitHub Pages"
  else
    if [ -t 0 ]; then
      read -r -p "Czy chcesz je zatwierdzić i kontynuować wdrożenie? [t/N]: " answer
      if [[ "$answer" =~ ^[tTyY]$ ]]; then
        read -r -p "Podaj opis commita (domyślnie: 'Aktualizacja przed wdrożeniem'): " user_msg
        user_msg="${user_msg:-Aktualizacja przed wdrożeniem}"
        git add -A
        git commit -m "$user_msg"
      else
        echo "❌ Wdrożenie przerwane. Zatwierdź lub wycofaj zmiany przed wdrożeniem."
        exit 1
      fi
    else
      echo "❌ Błąd: Wykryto niezatwierdzone zmiany w trybie nieinteraktywnym. Użyj opcji -m \"opis\" lub -y." >&2
      exit 1
    fi
  fi
fi

CURRENT_BRANCH=$(git branch --show-current)
echo "📦 Aktualna gałąź: $CURRENT_BRANCH"

# 3. Wypchnięcie gałęzi źródłowej (np. main)
echo "🚀 Wypychanie zmian do origin/$CURRENT_BRANCH..."
git push origin "$CURRENT_BRANCH"

# 4. Wypchnięcie na gałąź gh-pages
echo "🚀 Wypychanie na gałąź origin/gh-pages..."
git push origin "$CURRENT_BRANCH:gh-pages" --force

# 5. Pobranie adresu GitHub Pages i konfiguracja w gh CLI (jeśli dostępne)
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "🔍 Sprawdzanie konfiguracji GitHub Pages przez GitHub CLI..."
  PAGES_URL=$(gh api repos/:owner/:repo/pages --jq '.html_url' 2>/dev/null || true)
  
  if [ -z "$PAGES_URL" ]; then
    echo "⚙️  Włączanie GitHub Pages dla gałęzi gh-pages..."
    gh api --method POST repos/:owner/:repo/pages \
      -H "Accept: application/vnd.github+json" \
      -f "source[branch]=gh-pages" \
      -f "source[path]=/" >/dev/null 2>&1 || true
    PAGES_URL=$(gh api repos/:owner/:repo/pages --jq '.html_url' 2>/dev/null || true)
  fi

  echo ""
  echo "=========================================================="
  echo "🎉 Wdrożenie zakończone pomyślnie!"
  if [ -n "$PAGES_URL" ]; then
    echo "🌐 Adres aplikacji: $PAGES_URL"
  else
    echo "🌐 Sprawdź adres w ustawieniach repozytorium GitHub (Settings -> Pages)."
  fi
  echo "=========================================================="
else
  echo ""
  echo "=========================================================="
  echo "🎉 Zmiany zostały wypchnięte na gałąź gh-pages!"
  echo "=========================================================="
fi
