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
