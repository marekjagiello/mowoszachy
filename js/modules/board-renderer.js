/**
 * js/modules/board-renderer.js
 * Renderowanie szachownicy, bierek, koordynatów, motywów wizualnych i stylów poświaty
 */

import { PIECE_NAMES_PL } from './constants.js';

export class BoardRenderer {
  constructor(chessboardEl) {
    this.chessboardEl = chessboardEl;
  }

  initBoard(isFlipped, onSquareClick) {
    if (!this.chessboardEl) return;
    this.chessboardEl.innerHTML = '';
    this.chessboardEl.classList.toggle('flipped', isFlipped);

    const files = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];

    const activeFiles = isFlipped ? [...files].reverse() : files;
    const activeRanks = isFlipped ? [...ranks].reverse() : ranks;

    for (let rIdx = 0; rIdx < 8; rIdx++) {
      const rank = activeRanks[rIdx];
      for (let fIdx = 0; fIdx < 8; fIdx++) {
        const file = activeFiles[fIdx];
        const squareId = `${file}${rank}`;
        const fileOrigIdx = file.charCodeAt(0) - 97;
        const isLight = (fileOrigIdx + rank) % 2 === 0;

        const sq = document.createElement('div');
        sq.className = `square ${isLight ? 'light' : 'dark'}`;
        sq.dataset.square = squareId;

        // Etykiety koordynatów na krawędziach
        if (fIdx === 0) {
          const rankLabel = document.createElement('span');
          rankLabel.className = 'coord-label coord-rank';
          rankLabel.textContent = rank;
          sq.appendChild(rankLabel);
        }
        if (rIdx === 7) {
          const fileLabel = document.createElement('span');
          fileLabel.className = 'coord-label coord-file';
          fileLabel.textContent = file;
          sq.appendChild(fileLabel);
        }

        sq.addEventListener('click', () => onSquareClick(squareId));
        this.chessboardEl.appendChild(sq);
      }
    }
  }

  renderPieces(game, selectedSquare = null, lastMoveSquares = []) {
    if (!this.chessboardEl) return;
    const board = game.board();
    const squares = this.chessboardEl.querySelectorAll('.square');

    squares.forEach(sq => {
      const squareId = sq.dataset.square;
      const fileIdx = squareId.charCodeAt(0) - 97;
      const rank = parseInt(squareId[1], 10);
      const piece = board[8 - rank][fileIdx];

      // Usunięcie starych elementów bierek
      const existing = sq.querySelector('.piece-symbol, .piece-img');
      if (existing) existing.remove();

      // Podświetlenia
      sq.classList.remove('selected', 'last-move');

      if (selectedSquare === squareId) {
        sq.classList.add('selected');
      }
      if (lastMoveSquares && lastMoveSquares.includes(squareId)) {
        sq.classList.add('last-move');
      }

      if (piece) {
        const img = document.createElement('img');
        img.className = `piece-img piece-${piece.color === 'w' ? 'white' : 'black'}`;
        img.dataset.pieceColor = piece.color;
        img.src = `assets/pieces/${piece.color}_${piece.type}.png`;
        img.alt = `${piece.color === 'w' ? 'Biały' : 'Czarny'} ${PIECE_NAMES_PL[piece.type] || piece.type}`;
        img.draggable = false;
        sq.appendChild(img);
      }
    });
  }

  applyTheme(theme = 'wood') {
    if (!this.chessboardEl) return;
    this.chessboardEl.classList.remove('theme-wood', 'theme-zelda', 'theme-blue', 'theme-green');
    this.chessboardEl.classList.add(`theme-${theme}`);
  }

  applyBgOpacity(val = 50) {
    if (!this.chessboardEl) return;
    const numericVal = parseInt(val, 10);
    const opacity = (numericVal / 100).toFixed(2);
    this.chessboardEl.style.setProperty('--board-bg-opacity', opacity);

    // Zmiękczenie tła pól przy zmniejszaniu widoczności tekstury
    const fade = 1 - (numericVal / 100);
    const lightAlpha = (0.28 * fade).toFixed(3);
    const darkAlpha = (0.45 * fade).toFixed(3);
    this.chessboardEl.style.setProperty('--square-light-bg', `rgba(226, 214, 181, ${lightAlpha})`);
    this.chessboardEl.style.setProperty('--square-dark-bg', `rgba(15, 23, 42, ${darkAlpha})`);
  }

  static applyPieceGlow(whiteSize = 5, whiteOpacity = 85, blackSize = 5, blackOpacity = 85) {
    const root = document.documentElement;
    root.style.setProperty('--piece-glow-white-size', `${whiteSize}px`);
    root.style.setProperty('--piece-glow-white-opacity', (whiteOpacity / 100).toFixed(2));
    root.style.setProperty('--piece-glow-black-size', `${blackSize}px`);
    root.style.setProperty('--piece-glow-black-opacity', (blackOpacity / 100).toFixed(2));
  }
}
