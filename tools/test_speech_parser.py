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
