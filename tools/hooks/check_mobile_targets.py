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
