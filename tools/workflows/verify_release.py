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
