---
name: mowoszachy-speech-eval
description: 'Weryfikuje i testuje polski parser mowy szachowej w MowoSzachy pod kątem nowych fraz, synonimów i zniekształceń fonetycznych. Użyj, gdy zmieniasz logikę rozpoznawania mowy, dodajesz komendy głosowe lub badasz błędy parsowania STT.'
---

# MowoSzachy Speech Evaluation Skill

## Cel
Zapewnienie 100% poprawności parsowania polskich komend głosowych i posunięć szachowych bez konieczności fizycznego dyktowania do mikrofonu.

## Instrukcja Krok po Kroku

1. **Uruchomienie weryfikatora fonetycznego**:
   Uruchom skrypt testowy:
   ```bash
   python3 tools/test_speech_parser.py
   ```

2. **Weryfikowane kategorie przypadków testowych**:
   - **Ruchy pionów**: "e4", "pion na e4", "pionek e4", "e dwa e cztery", "pion bije na d5", "e razy d5".
   - **Ruchy figur lekkich i ciężkich**: "skoczek f3", "koń na f3", "koniem na ce trzy", "goniec bije c4", "laufer na b5", "wieża d1", "dama na h5", "hetman e7".
   - **Roszady**: "krótka roszada", "roszada krótka", "mała roszada", "długa roszada", "roszada długa", "zero zero".
   - **Zniekształcenia silnika STT**: "503" -> "f3", "ef trzy" -> "f3", "ce cztery" -> "c4", "gie jeden" -> "g1".
   - **Komendy systemowe**: "nowa partia", "cofnij ruch", "podpowiedz", "przeczytaj pozycję", "odwróć szachownicę".

3. **Zasady modyfikacji kodu**:
   - Wszystkie wyrażenia regularne w `normalizePolishSpeech()` muszą zachowywać granice słów (`\b`).
   - Normalizacja nie może niszczyć poprawnych współrzędnych szachowych `[a-h][1-8]`.
   - Zmiany muszą być zgodne z logiką funkcji `findMatchingMove()`.
