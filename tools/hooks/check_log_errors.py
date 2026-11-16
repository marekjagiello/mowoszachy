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
