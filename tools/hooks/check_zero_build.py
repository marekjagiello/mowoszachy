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
