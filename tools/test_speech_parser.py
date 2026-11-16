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

def extract_bot_command(raw_text: str, bot_name: str = 'Janusz'):
    trimmed = (raw_text or '').strip()
    if not trimmed:
        return False, ''
    if not bot_name or not bot_name.strip():
        return True, trimmed
    name_clean = bot_name.strip().lower()
    if name_clean == 'janusz':
        name_pattern = r'(?:janusz[uea]?|januszek|januszku)'
    else:
        escaped = re.escape(name_clean)
        name_pattern = rf'{escaped}(?:[uea]|em|owi|ku)?'
    wake_regex = re.compile(rf'^(?:(?:hej|ej|okej|no)\s+)?{name_pattern}(?:[,.!?:;\s]+|$)', re.IGNORECASE)
    match = wake_regex.match(trimmed)
    if not match:
        return False, ''
    command = trimmed[match.end():].strip()
    return True, command

DRAW_REGEX = re.compile(r'\b(remis|remisu|remisem|zróbmy remis|proponuj[eę]\s+remis|oferuj[eę]\s+remis|zgoda na remis|propozycja remisu)\b', re.IGNORECASE)

TEST_CASES = [
    ("Pion na e4", "P e4"),
    ("skoczek na f3", "N f3"),
    ("koń na f3", "N f3"),
    ("koń na g2", "N g2"),
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

WAKE_WORD_TEST_CASES = [
    ("Janusz e4", True, "e4"),
    ("Janusz koń na g2", True, "koń na g2"),
    ("Janusz, koń na g2", True, "koń na g2"),
    ("Januszu koń na g2", True, "koń na g2"),
    ("Januszu, pion na d4", True, "pion na d4"),
    ("Janusz proponuję remis", True, "proponuję remis"),
    ("Januszu proponuję remis", True, "proponuję remis"),
    ("Janusz zróbmy remis", True, "zróbmy remis"),
    ("Janusz remis", True, "remis"),
    ("Janusz, czy remis?", True, "czy remis?"),
    ("Hej Janusz e4", True, "e4"),
    ("Okej Janusz skoczek f3", True, "skoczek f3"),
    ("Januszek wieża b1", True, "wieża b1"),
    ("Januszku cofnij ruch", True, "cofnij ruch"),
    ("Janusz", True, ""),
    ("No i co teraz... może pion na e4?", False, ""),
    ("hmm koń na g2", False, ""),
    ("czekaj, muszę pomyśleć", False, ""),
    ("proponuję remis", False, "")
]

DRAW_TEST_CASES = [
    ("proponuję remis", True),
    ("proponuje remis", True),
    ("zróbmy remis", True),
    ("remis", True),
    ("czy remis?", True),
    ("oferuję remis", True),
    ("zgoda na remis", True),
    ("propozycja remisu", True),
    ("e4", False),
    ("koń na g2", False),
    ("podpowiedz", False)
]

def run_tests():
    passed = 0
    total = len(TEST_CASES) + len(WAKE_WORD_TEST_CASES) + len(DRAW_TEST_CASES)
    print(f"=== Uruchamianie {total} testów fonetyki, hasła wywołania i komend szachowych MowoSzachy ===")

    print("\n--- 1. Normalizacja fonetyczna posunięć ---")
    for raw, expected in TEST_CASES:
        actual = normalize_polish_speech(raw)
        if actual == expected:
            print(f"  [PASS] '{raw}' -> '{actual}'")
            passed += 1
        else:
            print(f"  [FAIL] '{raw}' -> Otrzymano: '{actual}', Oczekiwano: '{expected}'")

    print("\n--- 2. Wykrywanie imienia bota / Wake-word ('Janusz') ---")
    for raw, exp_has, exp_cmd in WAKE_WORD_TEST_CASES:
        has_bot, cmd = extract_bot_command(raw, "Janusz")
        if has_bot == exp_has and (not exp_has or cmd == exp_cmd):
            print(f"  [PASS] '{raw}' -> HasBot={has_bot}, Cmd='{cmd}'")
            passed += 1
        else:
            print(f"  [FAIL] '{raw}' -> HasBot={has_bot} (exp {exp_has}), Cmd='{cmd}' (exp '{exp_cmd}')")

    print("\n--- 3. Wykrywanie propozycji remisu ---")
    for raw, exp_draw in DRAW_TEST_CASES:
        is_draw = bool(DRAW_REGEX.search(raw))
        if is_draw == exp_draw:
            print(f"  [PASS] '{raw}' -> IsDraw={is_draw}")
            passed += 1
        else:
            print(f"  [FAIL] '{raw}' -> IsDraw={is_draw} (exp {exp_draw})")

    print(f"\nWynik testów fonetyki i logiki mowy: {passed}/{total} zaliczonych.")
    if passed != total:
        sys.exit(1)
    return True

if __name__ == '__main__':
    run_tests()
