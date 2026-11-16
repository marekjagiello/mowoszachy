/**
 * js/modules/speech-parser.js
 * Fonetyczny parser mowy szachowej, normalizacja komend oraz generator opisów pozycji w języku polskim
 */

import { PIECE_NAMES_PL, PIECE_NAMING_STYLES } from './constants.js';

export function normalizePolishSpeech(raw) {
  let text = (raw || '').toLowerCase().trim();

  // Usunięcie znaków interpunkcyjnych
  text = text.replace(/[.,!?:;\-\–]/g, ' ');

  // Fonetyczne błędy Google Speech STT
  // "503", "5 3", "f 3" -> "f3"
  text = text.replace(/\b503\b/g, 'f3');
  text = text.replace(/\b50\b/g, 'f');

  // Nazwy fonetyczne liter
  text = text.replace(/\bef\b/g, 'f');
  text = text.replace(/\bce\b|\bse\b/g, 'c');
  text = text.replace(/\bde\b/g, 'd');
  text = text.replace(/\bbe\b/g, 'b');
  text = text.replace(/\bgie\b|\bge\b/g, 'g');
  text = text.replace(/\bha\b/g, 'h');

  // Liczby słownie
  const numMap = {
    jeden: '1', jedynka: '1', pierwsze: '1', pierwsza: '1', pierwszy: '1',
    dwa: '2', dwójka: '2', dwie: '2', drugie: '2', druga: '2', drugi: '2',
    trzy: '3', trójka: '3', trzecie: '3', trzecia: '3', trzeci: '3',
    cztery: '4', czwórka: '4', czwarte: '4', czwarta: '4', czwarty: '4',
    pięć: '5', piec: '5', piątka: '5', piatka: '5', piąte: '5', piate: '5', piąta: '5',
    sześć: '6', szesc: '6', szóstka: '6', szostka: '6', szóste: '6', szoste: '6', szósta: '6',
    siedem: '7', siódemka: '7', siodemka: '7', siódme: '7', siodme: '7', siódma: '7',
    osiem: '8', ósemka: '8', osemka: '8', ósme: '8', osme: '8', ósma: '8'
  };
  for (const [word, num] of Object.entries(numMap)) {
    const reg = new RegExp(`\\b${word}\\b`, 'g');
    text = text.replace(reg, num);
  }

  // Roszady: długa roszada musi poprzedzać krótką
  text = text.replace(/\b(długa roszada|długą roszadę|dluga roszada|dluga roszade|roszada długa|roszadę długą|duża roszada|dużą roszadę|duza roszada|duza roszade|roszada duża|roszadę dużą|zero zero zero|długo|dlugo)\b/g, 'O-O-O');
  text = text.replace(/\b(krótka roszada|krótką roszadę|krotka roszada|krotka roszade|roszada krótka|roszadę krótką|mała roszada|małą roszadę|mala roszada|mala roszade|roszada mała|roszadę małą|zero zero|krótko|krotko)\b/g, 'O-O');
  text = text.replace(/\broszada\b/g, 'O-O');

  // Nazwy bierek i synonimy (z uwzględnieniem odmian gramatycznych i zapożyczeń)
  // Hetman / Dama / Królowa (Q) - musi być przed Królem, aby uniknąć kolizji z "król" w "królowa"
  text = text.replace(/\b(hetman|hetmana|hetmanowi|hetmanem|hetmanie|hetmani|hetmanów|dama|damę|dame|damą|damo|damie|damy|dam|królowa|królową|królowej|królowe|królowo|krolowa|krolową|krolowej|krolowe|krolowo|królówka|królówkę|królówką|krolowka|krolowke|queen|kwin|kłin)\b/g, 'Q');

  // Król (K)
  text = text.replace(/\b(król|krol|króla|krola|królowi|krolowi|królem|krolem|królu|krolu|king)\b/g, 'K');

  // Skoczek / Koń / Konik / Kucyk / Rumak (N)
  text = text.replace(/\b(skoczek|skoczka|skoczkowi|skoczkiem|skoczku|skoczki|skoczków|koń|kon|konia|koniowi|koniem|koniu|konie|koni|konik|konika|konikowi|konikiem|koniku|koniki|koników|kucyk|kucyka|kucykowi|kucykiem|kucyku|kucyki|kucyków|rumak|rumaka|rumakowi|rumakiem|rumaku|rumaki|rumaków|knight|najt)\b/g, 'N');

  // Goniec / Laufer / Strzelec / Biskup / Oficer (B)
  text = text.replace(/\b(goniec|gońca|gonca|gońcowi|goncowi|gońcem|goncem|gońcu|goncu|gońce|gońcy|goncy|laufer|laufra|laufrowi|laufrem|lauferem|laufru|laufry|laufrów|strzelec|strzelca|strzelcowi|strzelcem|strzelcu|strzelcy|strzelców|biskup|biskupa|biskupowi|biskupem|biskupie|biskupi|biskupów|oficer|oficera|oficerowi|oficerem|oficerze|oficerowie|oficerów|bishop)\b/g, 'B');

  // Wieża / Wieżyczka / Tura / Baszta (R)
  text = text.replace(/\b(wieża|wieza|wieżę|wieze|wieżą|wiezo|wieży|wiezy|wieże|wiezyczki|wieżyczka|wiezyczka|wieżyczkę|wiezyczke|wieżyczką|wieżyczki|wiezyczki|tura|turę|ture|turą|turo|tury|turze|baszta|basztę|baszte|basztą|baszto|baszcie|baszty|rook|ruk|rukiem)\b/g, 'R');

  // Pion / Pionek / Piechur / Żołnierz (P)
  text = text.replace(/\b(pion|piona|pionowi|pionem|pionie|piony|pionów|pionek|pionka|pionkowi|pionkiem|pionku|pionki|pionków|piechur|piechura|piechurowi|piechurem|piechurze|piechurzy|piechurów|żołnierz|zolnierz|żołnierza|zolnierza|żołnierzowi|zolnierzowi|żołnierzem|zolnierzem|żołnierze|zolnierze|żołnierzy|zolnierzy|pawn)\b/g, 'P');

  // Czasowniki operacyjne gracza (np. "rusz konia", "zagraj skoczka", "przestaw damę", "idź pionkiem")
  text = text.replace(/\b(rusz|rusza|ruszamy|zagraj|graj|przestaw|przestawia|postaw|stawia|idź|idzie|daj|daje)\b/g, ' ');

  // Słowa posiłkowe, pola i promocje
  text = text.replace(/\b(na|do|w|z|pole|pola|polu|promocja|promuje|promuję|przemiana|zamiana|zamień|zmień)\b/g, ' ');

  // Bicia i zbicia
  text = text.replace(/\b(bije|biję|bija|zbija|zbijam|bierze|biorę|bicia|zbić|bić|zabija|zabiera|ciacha|kasuje|pochłania)\b/g, 'x');

  // Łączenie rozdzielonej litery i cyfry (np. "e 4" -> "e4", "f 3" -> "f3")
  text = text.replace(/\b([a-h])\s+([1-8])\b/g, '$1$2');

  // Normalizacja spacji
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

export function extractBotCommand(rawText, botName = 'Janusz') {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return { hasBotName: false, command: '', raw: rawText };
  }

  if (!botName || !botName.trim()) {
    return { hasBotName: true, command: trimmed, raw: rawText };
  }

  const nameClean = botName.trim().toLowerCase();
  const escapeRegex = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

  let namePattern = escapeRegex(nameClean);
  if (nameClean === 'janusz') {
    namePattern = '(?:janusz[uea]?|januszek|januszku)';
  } else {
    namePattern = `${namePattern}(?:[uea]|em|owi|ku)?`;
  }

  const wakeRegex = new RegExp(`^(?:(?:hej|ej|okej|no)\\s+)?${namePattern}(?:[,.!?:;\\s]+|$)`, 'i');
  const match = trimmed.match(wakeRegex);

  if (!match) {
    return { hasBotName: false, command: '', raw: rawText };
  }

  const command = trimmed.slice(match[0].length).trim();
  return { hasBotName: true, command, raw: rawText };
}

export function isSpokenDrawProposal(text) {
  const drawRegex = /\b(remis|remisu|remisem|zróbmy remis|proponuj[eę]\s+remis|oferuj[eę]\s+remis|zgoda na remis|propozycja remisu)\b/i;
  return drawRegex.test(text || '');
}

export function formatMoveToPolish(move, pieceNamingStyle = 'traditional') {
  if (move.san === 'O-O') return 'krótka roszada';
  if (move.san === 'O-O-O') return 'długa roszada';

  const names = PIECE_NAMING_STYLES[pieceNamingStyle] || PIECE_NAMES_PL;
  const pieceName = names[move.piece || 'p'] || 'figura';
  const isCapture = move.flags && (move.flags.includes('c') || move.flags.includes('e'));
  const captureText = isCapture ? 'bije na' : 'na';

  let desc = `${pieceName} ${captureText} ${move.to}`;

  if (move.promotion) {
    const promoName = names[move.promotion] || 'hetman';
    desc += `, promocja na ${promoName}`;
  }

  if (move.san && move.san.includes('#')) desc += ', szach i mat';
  else if (move.san && move.san.includes('+')) desc += ', szach';

  return desc;
}

export function describePositionInPolish(game, pieceNamingStyle = 'traditional') {
  const board = game.board();
  const whitePieces = [];
  const blackPieces = [];
  const order = ['k', 'q', 'r', 'b', 'n', 'p'];
  const names = PIECE_NAMING_STYLES[pieceNamingStyle] || PIECE_NAMES_PL;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        const square = `${String.fromCharCode(97 + c)}${8 - r}`;
        if (piece.color === 'w') {
          whitePieces.push({ ...piece, square });
        } else {
          blackPieces.push({ ...piece, square });
        }
      }
    }
  }

  const groupPieces = (list) => {
    const groups = {};
    order.forEach(type => (groups[type] = []));
    list.forEach(p => groups[p.type].push(p.square));

    const parts = [];
    if (groups.k.length) parts.push(`${names.k} na ${groups.k.join(', ')}`);
    if (groups.q.length) parts.push(`${names.q} na ${groups.q.join(', ')}`);
    if (groups.r.length) parts.push(`${names.r} na ${groups.r.join(', ')}`);
    if (groups.b.length) parts.push(`${names.b} na ${groups.b.join(', ')}`);
    if (groups.n.length) parts.push(`${names.n} na ${groups.n.join(', ')}`);
    if (groups.p.length) parts.push(`pionki na ${groups.p.join(', ')}`);
    return parts.join('; ');
  };

  const whiteDesc = groupPieces(whitePieces);
  const blackDesc = groupPieces(blackPieces);
  const turnDesc = game.turn() === 'w' ? 'Ruch mają białe' : 'Ruch mają czarne';

  return `Opis pozycji. Białe figury: ${whiteDesc}. Czarne figury: ${blackDesc}. ${turnDesc}.`;
}

export function findMatchingMove(clean, legalMoves) {
  const cleanNoSpace = clean.replace(/\s+/g, '');
  const cleanUpper = clean.toUpperCase();

  // 1. Direct SAN match (e.g. "e4", "Nf3", "O-O", "O-O-O", "Bxf7+", "ed5")
  let match = legalMoves.find(m => {
    const sanClean = m.san.replace(/[+#=x\-]/g, '').toLowerCase();
    const inputClean = cleanNoSpace.replace(/[+#=x\-]/g, '').toLowerCase();
    return sanClean === inputClean || m.san.toLowerCase() === cleanNoSpace.toLowerCase();
  });
  if (match) return match;

  // 2. From-To match (e.g. "e2 e4", "e2e4", "g1f3")
  match = legalMoves.find(m => {
    const fromTo = `${m.from}${m.to}`.toLowerCase();
    return cleanNoSpace.toLowerCase().includes(fromTo);
  });
  if (match) return match;

  // 3. Piece + target square match (e.g. "N f3", "B c4", "R d1", "P e4")
  const words = clean.split(' ');
  const targetSquare = words.find(w => /^[a-h][1-8]$/.test(w));
  const pieceSpecified = words.find(w => ['N', 'B', 'R', 'Q', 'K', 'P'].includes(w));

  if (targetSquare) {
    const candidates = legalMoves.filter(m => m.to === targetSquare);

    // Specjalna obsługa promocji pionka, gdy podano figurę docelową promocji (np. "e8 Q", "P e8 Q", "e8 N")
    const promoPiece = words.find(w => ['Q', 'R', 'B', 'N'].includes(w));
    if (promoPiece && candidates.some(m => Boolean(m.promotion))) {
      const promoCandidates = candidates.filter(m => m.promotion === promoPiece.toLowerCase());
      if (promoCandidates.length === 1) return promoCandidates[0];
      if (promoCandidates.length > 1) {
        const disambig = promoCandidates.find(m => clean.includes(m.from[0]) || clean.includes(m.from[1]));
        if (disambig) return disambig;
        return promoCandidates[0];
      }
    }

    if (pieceSpecified) {
      const pieceType = pieceSpecified.toLowerCase();
      let pieceCandidates = candidates.filter(m => m.piece === (pieceType === 'p' ? 'p' : pieceType));

      // Jeśli nie ma figury tego typu, sprawdź czy chodziło o promocję na tę figurę
      if (pieceCandidates.length === 0 && ['q', 'r', 'b', 'n'].includes(pieceType)) {
        pieceCandidates = candidates.filter(m => m.promotion === pieceType);
      }

      if (pieceCandidates.length === 1) {
        return pieceCandidates[0];
      } else if (pieceCandidates.length > 1) {
        // Disambiguate by origin file or rank if mentioned (e.g. "Rad1" -> from 'a')
        const disambig = pieceCandidates.find(m => clean.includes(m.from[0]) || clean.includes(m.from[1]));
        if (disambig) return disambig;
        return pieceCandidates[0];
      }
    } else {
      // No piece specified: if only 1 move reaches this square or pawn reaches it
      if (candidates.length === 1) return candidates[0];
      const pawnMove = candidates.find(m => m.piece === 'p');
      if (pawnMove) return pawnMove;
    }
  }

  // 4. Pawn captures (e.g. "exd5", "e x d5", "ed5", "e d5")
  const pawnCap = clean.match(/([a-h])\s*(?:x|\s)?\s*([a-h][1-8])/);
  if (pawnCap) {
    const fromFile = pawnCap[1];
    const toSq = pawnCap[2];
    const capMove = legalMoves.find(m => m.piece === 'p' && m.from[0] === fromFile && m.to === toSq);
    if (capMove) return capMove;
  }

  // 5. Castling fallback
  if (cleanUpper.includes('O-O-O')) {
    const castleLong = legalMoves.find(m => m.san === 'O-O-O');
    if (castleLong) return castleLong;
  }
  if (cleanUpper.includes('O-O')) {
    const castleShort = legalMoves.find(m => m.san === 'O-O');
    if (castleShort) return castleShort;
  }

  return null;
}
