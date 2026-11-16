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
        'jeden': '1', 'jedynka': '1', 'pierwsze': '1', 'pierwsza': '1', 'pierwszy': '1',
        'dwa': '2', 'dwójka': '2', 'dwie': '2', 'drugie': '2', 'druga': '2', 'drugi': '2',
        'trzy': '3', 'trójka': '3', 'trzecie': '3', 'trzecia': '3', 'trzeci': '3',
        'cztery': '4', 'czwórka': '4', 'czwarte': '4', 'czwarta': '4', 'czwarty': '4',
        'pięć': '5', 'piec': '5', 'piątka': '5', 'piatka': '5', 'piąte': '5', 'piate': '5', 'piąta': '5',
        'sześć': '6', 'szesc': '6', 'szóstka': '6', 'szostka': '6', 'szóste': '6', 'szoste': '6', 'szósta': '6',
        'siedem': '7', 'siódemka': '7', 'siodemka': '7', 'siódme': '7', 'siodme': '7', 'siódma': '7',
        'osiem': '8', 'ósemka': '8', 'osemka': '8', 'ósme': '8', 'osme': '8', 'ósma': '8'
    }
    for word, num in num_map.items():
        text = re.sub(rf'\b{word}\b', num, text)
        
    # Castling phrases: long castling must precede short castling to avoid prefix shadowing ("zero zero zero")
    text = re.sub(r'\b(długa roszada|długą roszadę|dluga roszada|dluga roszade|roszada długa|roszadę długą|duża roszada|dużą roszadę|duza roszada|duza roszade|roszada duża|roszadę dużą|zero zero zero|długo|dlugo)\b', 'O-O-O', text)
    text = re.sub(r'\b(krótka roszada|krótką roszadę|krotka roszada|krotka roszade|roszada krótka|roszadę krótką|mała roszada|małą roszadę|mala roszada|mala roszade|roszada mała|roszadę małą|zero zero|krótko|krotko)\b', 'O-O', text)
    text = re.sub(r'\broszada\b', 'O-O', text)
    
    # Piece synonyms and inflections
    # Hetman / Dama / Królowa (Q) - must precede King
    text = re.sub(r'\b(hetman|hetmana|hetmanowi|hetmanem|hetmanie|hetmani|hetmanów|dama|damę|dame|damą|damo|damie|damy|dam|królowa|królową|królowej|królowe|królowo|krolowa|krolową|krolowej|krolowe|krolowo|królówka|królówkę|królówką|krolowka|krolowke|queen|kwin|kłin)\b', 'Q', text)

    # Król (K)
    text = re.sub(r'\b(król|krol|króla|krola|królowi|krolowi|królem|krolem|królu|krolu|king)\b', 'K', text)

    # Skoczek / Koń / Konik / Kucyk / Rumak (N)
    text = re.sub(r'\b(skoczek|skoczka|skoczkowi|skoczkiem|skoczku|skoczki|skoczków|koń|kon|konia|koniowi|koniem|koniu|konie|koni|konik|konika|konikowi|konikiem|koniku|koniki|koników|kucyk|kucyka|kucykowi|kucykiem|kucyku|kucyki|kucyków|rumak|rumaka|rumakowi|rumakiem|rumaku|rumaki|rumaków|knight|najt)\b', 'N', text)

    # Goniec / Laufer / Strzelec / Biskup / Oficer (B)
    text = re.sub(r'\b(goniec|gońca|gonca|gońcowi|goncowi|gońcem|goncem|gońcu|goncu|gońce|gońcy|goncy|laufer|laufra|laufrowi|laufrem|lauferem|laufru|laufry|laufrów|strzelec|strzelca|strzelcowi|strzelcem|strzelcu|strzelcy|strzelców|biskup|biskupa|biskupowi|biskupem|biskupie|biskupi|biskupów|oficer|oficera|oficerowi|oficerem|oficerze|oficerowie|oficerów|bishop)\b', 'B', text)

    # Wieża / Wieżyczka / Tura / Baszta (R)
    text = re.sub(r'\b(wieża|wieza|wieżę|wieze|wieżą|wiezo|wieży|wiezy|wieże|wiezyczki|wieżyczka|wiezyczka|wieżyczkę|wiezyczke|wieżyczką|wieżyczki|wiezyczki|tura|turę|ture|turą|turo|tury|turze|baszta|basztę|baszte|basztą|baszto|baszcie|baszty|rook|ruk|rukiem)\b', 'R', text)

    # Pion / Pionek / Piechur / Żołnierz (P)
    text = re.sub(r'\b(pion|piona|pionowi|pionem|pionie|piony|pionów|pionek|pionka|pionkowi|pionkiem|pionku|pionki|pionków|piechur|piechura|piechurowi|piechurem|piechurze|piechurzy|piechurów|żołnierz|zolnierz|żołnierza|zolnierza|żołnierzowi|zolnierzowi|żołnierzem|zolnierzem|żołnierze|zolnierze|żołnierzy|zolnierzy|pawn)\b', 'P', text)

    # Operational verbs
    text = re.sub(r'\b(rusz|rusza|ruszamy|zagraj|graj|przestaw|przestawia|postaw|stawia|idź|idzie|daj|daje)\b', ' ', text)

    # Helper words, squares, promotions
    text = re.sub(r'\b(na|do|w|z|pole|pola|polu|promocja|promuje|promuję|przemiana|zamiana|zamień|zmień)\b', ' ', text)

    # Captures
    text = re.sub(r'\b(bije|biję|bija|zbija|zbijam|bierze|biorę|bicia|zbić|bić|zabija|zabiera|ciacha|kasuje|pochłania)\b', 'x', text)

    # Join letter and number (e.g. "e 4" -> "e4")
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
    # Skoczek i synonimy
    ("Pion na e4", "P e4"),
    ("skoczek na f3", "N f3"),
    ("skoczkiem na f3", "N f3"),
    ("skoczka na d4", "N d4"),
    ("koń na f3", "N f3"),
    ("koniem na f3", "N f3"),
    ("konia na f3", "N f3"),
    ("kon na f3", "N f3"),
    ("koń na g2", "N g2"),
    ("konik na f3", "N f3"),
    ("konikiem na c3", "N c3"),
    ("kucyk na f3", "N f3"),
    ("kucykiem na f3", "N f3"),
    ("rumak na d4", "N d4"),
    ("rumakiem na c3", "N c3"),
    ("knight f3", "N f3"),

    # Goniec i synonimy
    ("goniec na c4", "B c4"),
    ("gońcem na c4", "B c4"),
    ("gońca na d3", "B d3"),
    ("laufer na c4", "B c4"),
    ("laufrem na c4", "B c4"),
    ("laufra na e2", "B e2"),
    ("strzelec na f4", "B f4"),
    ("strzelcem na g5", "B g5"),
    ("strzelca na e3", "B e3"),
    ("biskup na e7", "B e7"),
    ("biskupem na b5", "B b5"),
    ("biskupa na d6", "B d6"),
    ("oficer na f4", "B f4"),
    ("oficerem na c4", "B c4"),
    ("bishop c4", "B c4"),

    # Wieża i synonimy
    ("wieża na d1", "R d1"),
    ("wieżą na d1", "R d1"),
    ("wieżę na e1", "R e1"),
    ("wieżyczka na a1", "R a1"),
    ("wieżyczką na c1", "R c1"),
    ("tura na f1", "R f1"),
    ("turą na b1", "R b1"),
    ("turę na d1", "R d1"),
    ("baszta na h1", "R h1"),
    ("basztą na g1", "R g1"),
    ("rook d1", "R d1"),

    # Hetman / Dama / Królowa i synonimy
    ("hetman na h5", "Q h5"),
    ("hetmanem na d4", "Q d4"),
    ("hetmana na f3", "Q f3"),
    ("dama d1", "Q d1"),
    ("dama na h5", "Q h5"),
    ("damą na b2", "Q b2"),
    ("damę na e7", "Q e7"),
    ("królowa na f7", "Q f7"),
    ("królową na d8", "Q d8"),
    ("królowej na e4", "Q e4"),
    ("królówka na d1", "Q d1"),
    ("królówką na c2", "Q c2"),
    ("queen d4", "Q d4"),

    # Król i synonimy
    ("król na e2", "K e2"),
    ("królem na f2", "K f2"),
    ("króla na g1", "K g1"),
    ("krol na d2", "K d2"),
    ("king e2", "K e2"),

    # Pion i synonimy
    ("pion na e4", "P e4"),
    ("pionem na e4", "P e4"),
    ("piona na d4", "P d4"),
    ("pionek na e4", "P e4"),
    ("pionkiem na c4", "P c4"),
    ("pionka na f4", "P f4"),
    ("piechur na e4", "P e4"),
    ("piechurem na d4", "P d4"),
    ("piechura na c5", "P c5"),
    ("żołnierz na e4", "P e4"),
    ("żołnierzem na d4", "P d4"),
    ("pawn e4", "P e4"),

    # Czasowniki operacyjne gracza
    ("rusz konia na f3", "N f3"),
    ("zagraj skoczka na c3", "N c3"),
    ("przestaw damę na b2", "Q b2"),
    ("idź pionkiem na e4", "P e4"),
    ("postaw gońca na c4", "B c4"),

    # Bicia
    ("goniec bije na d5", "B x d5"),
    ("koniem biję na f3", "N x f3"),
    ("wieża bije na b7", "R x b7"),
    ("laufer zbija d5", "B x d5"),
    ("dama bierze na b7", "Q x b7"),
    ("wieża zabiera c8", "R x c8"),
    ("pion ciacha d5", "P x d5"),

    # Roszady
    ("krótka roszada", "O-O"),
    ("krótką roszadę", "O-O"),
    ("długa roszada", "O-O-O"),
    ("długą roszadę", "O-O-O"),
    ("zero zero", "O-O"),
    ("zero zero zero", "O-O-O"),
    ("duża roszada", "O-O-O"),
    ("mała roszada", "O-O"),

    # Fonetyka i błędy STT
    ("503", "f3"),
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
