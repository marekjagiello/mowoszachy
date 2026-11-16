---
name: mowoszachy-chess-logic
description: 'Weryfikuje reguły szachowe, generator opisu pozycji (Position Describer) w języku polskim oraz stany specjalne partii (roszady, en passant, promocje, mat, pat).'
---

# MowoSzachy Chess Logic & Position Describer Skill

## Zakres weryfikacji
1. **Reguły i integralność szachownicy**:
   - Walidacja z użyciem `chess.min.js`.
   - Poprawność generowania legalnych posunięć (`game.moves({ verbose: true })`).
   - Obsługa promocji pionka (domyślnie Hetman `=Q`, opcjonalnie Skoczek/Wieża/Goniec).

2. **Polski Position Describer (Tłumacz Pozycji)**:
   - Gramatyka grup figur:
     - 1 pion: "Pion na e4"
     - Wiele pionów: "Piony na a2, b2, c2..."
     - 1 skoczek: "Skoczek na f3"
     - 2 skoczki: "Skoczki na c3 i f3"
     - 2 wieże: "Wieże na a1 i f1"
   - Odczyt stanu:
     - Kolejka: "Ruch białych" / "Ruch czarnych".
     - Szach: "Szach dla czarnego króla".
     - Mat: "Szach-mat. Wygrywają białe".
     - Pat: "Pat. Remis".

3. **Procedura testowa**:
   - Zweryfikuj, czy żadna zmiana w opisie pozycji nie ucina współrzędnych pól.
   - Sprawdź, czy syntezator mowy otrzymuje tekst z pauzami (przecinki, kropki) umożliwiającymi graczowi nadążenie za ustawianiem bierek na drewnianej szachownicy.
