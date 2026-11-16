import { Chess } from './vendor/chess.min.js';

// Remote logger for phone debugging
function remoteLog(type, message, stack = '') {
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, message, stack })
  }).catch(() => {});
}

window.addEventListener('error', (e) => {
  remoteLog('ERROR', e.message || 'Window error', e.filename ? `${e.filename}:${e.lineno}` : '');
});

// Polish piece names mapping
const PIECE_NAMES_PL = {
  p: 'pion',
  n: 'skoczek',
  b: 'goniec',
  r: 'wieża',
  q: 'hetman',
  k: 'król'
};

const PIECE_SYMBOLS = {
  p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
  P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔'
};

class MowoSzachyApp {
  constructor() {
    this.game = new Chess();
    this.stockfish = null;
    this.stockfishReady = false;
    this.isEngineThinking = false;
    this.selectedSquare = null;
    this.recognition = null;
    this.isListening = false;
    this.currentVoice = null;
    this.speechRate = 1.0;
    this.engineDepth = 10;
    this.descriptionStyle = 'detailed';
    this.autoSpeakEngine = true;

    this.initElements();
    this.initSpeechSynthesis();
    this.initSpeechRecognition();
    this.initStockfish();
    this.initBoardUI();
    this.attachEventListeners();
    this.updateUI();

    remoteLog('INFO', 'MowoSzachy initialized successfully');
  }

  initElements() {
    this.el = {
      engineStatus: document.getElementById('engineStatus'),
      speechStatus: document.getElementById('speechStatus'),
      turnMarker: document.getElementById('turnMarker'),
      turnLabel: document.getElementById('turnLabel'),
      moveCount: document.getElementById('moveCount'),
      gameStatusText: document.getElementById('gameStatusText'),
      speechStateLabel: document.getElementById('speechStateLabel'),
      speechWaves: document.getElementById('speechWaves'),
      speechDisplayText: document.getElementById('speechDisplayText'),
      lastMoveText: document.getElementById('lastMoveText'),
      engineEvalText: document.getElementById('engineEvalText'),
      chessboard: document.getElementById('chessboard'),
      boardAccordion: document.getElementById('boardAccordion'),
      boardToggle: document.getElementById('boardToggle'),
      manualMoveInput: document.getElementById('manualMoveInput'),
      btnSendManualMove: document.getElementById('btnSendManualMove'),
      btnReadPosition: document.getElementById('btnReadPosition'),
      btnVoiceInput: document.getElementById('btnVoiceInput'),
      voiceBtnLabel: document.getElementById('voiceBtnLabel'),
      btnPlayEngineMove: document.getElementById('btnPlayEngineMove'),
      btnReadHint: document.getElementById('btnReadHint'),
      btnReadLastMove: document.getElementById('btnReadLastMove'),
      btnUndoMove: document.getElementById('btnUndoMove'),
      btnNewGame: document.getElementById('btnNewGame'),
      btnCopyFen: document.getElementById('btnCopyFen'),
      settingsModal: document.getElementById('settingsModal'),
      btnOpenSettings: document.getElementById('btnOpenSettings'),
      btnCloseSettings: document.getElementById('btnCloseSettings'),
      voiceSelect: document.getElementById('voiceSelect'),
      speechRate: document.getElementById('speechRate'),
      speechRateVal: document.getElementById('speechRateVal'),
      engineDepth: document.getElementById('engineDepth'),
      engineDepthVal: document.getElementById('engineDepthVal'),
      descriptionStyle: document.getElementById('descriptionStyle'),
      autoSpeakEngineMove: document.getElementById('autoSpeakEngineMove'),
    };
  }

  // --- Speech Synthesis (TTS) ---
  initSpeechSynthesis() {
    if (!('speechSynthesis' in window)) {
      this.el.speechStatus.querySelector('.status-dot').className = 'status-dot error';
      this.el.speechStatus.querySelector('.status-text').textContent = 'Brak TTS';
      return;
    }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      this.el.voiceSelect.innerHTML = '';
      const plVoices = voices.filter(v => v.lang.startsWith('pl') || v.lang.includes('PL'));
      const activeList = plVoices.length > 0 ? plVoices : voices;

      activeList.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${voice.name} (${voice.lang})${voice.default ? ' — domyślny' : ''}`;
        this.el.voiceSelect.appendChild(option);
      });

      this.currentVoice = plVoices.length > 0 ? plVoices[0] : (voices[0] || null);
      if (this.currentVoice) {
        this.el.speechStatus.querySelector('.status-dot').className = 'status-dot';
      }
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    this.el.voiceSelect.addEventListener('change', (e) => {
      const voices = window.speechSynthesis.getVoices();
      const plVoices = voices.filter(v => v.lang.startsWith('pl') || v.lang.includes('PL'));
      const activeList = plVoices.length > 0 ? plVoices : voices;
      this.currentVoice = activeList[e.target.value] || null;
    });
  }

  speak(text, priority = false) {
    if (!('speechSynthesis' in window)) {
      this.setDisplayText(text);
      return;
    }

    if (priority || window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    this.setDisplayText(text);
    this.setSpeechIndicator(true, 'Czytam na głos...');

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.currentVoice) utterance.voice = this.currentVoice;
    utterance.lang = this.currentVoice ? this.currentVoice.lang : 'pl-PL';
    utterance.rate = this.speechRate;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      this.setSpeechIndicator(false, 'Gotowy');
    };

    utterance.onerror = (err) => {
      remoteLog('WARN', 'Speech error: ' + (err.error || 'unknown'));
      this.setSpeechIndicator(false, 'Błąd mowy');
    };

    window.speechSynthesis.speak(utterance);
  }

  setDisplayText(text) {
    this.el.speechDisplayText.textContent = text;
  }

  setSpeechIndicator(active, label) {
    this.el.speechStateLabel.textContent = label;
    if (active) {
      this.el.speechWaves.classList.add('active');
    } else {
      this.el.speechWaves.classList.remove('active');
    }
  }

  // --- Speech Recognition (STT) ---
  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.el.btnVoiceInput.disabled = true;
      this.el.btnVoiceInput.title = 'Rozpoznawanie mowy nie jest wspierane w tej przeglądarce';
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'pl-PL';
    this.recognition.continuous = false;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.el.btnVoiceInput.classList.add('listening');
      this.el.voiceBtnLabel.textContent = 'Słucham...';
      this.setSpeechIndicator(true, 'Nasłuchuję ruchu...');
    };

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim().toLowerCase();
      remoteLog('INFO', 'Speech recognized: ' + transcript);
      this.handleVoiceCommand(transcript);
    };

    this.recognition.onerror = (event) => {
      remoteLog('WARN', 'Speech recognition error: ' + event.error);
      this.speak('Nie dosłyszałem ruchu. Spróbuj ponownie.');
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.el.btnVoiceInput.classList.remove('listening');
      this.el.voiceBtnLabel.textContent = 'Powiedz ruch';
      this.setSpeechIndicator(false, 'Gotowy');
    };
  }

  toggleListening() {
    if (!this.recognition) return;
    if (this.isListening) {
      this.recognition.stop();
    } else {
      try {
        this.recognition.start();
      } catch (e) {
        remoteLog('WARN', 'Could not start recognition: ' + e.message);
      }
    }
  }

  // Convert natural Polish phrases to chess moves
  handleVoiceCommand(raw) {
    let clean = raw
      .replace(/kropka|przecinek/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Commands
    if (clean.includes('przeczytaj pozycję') || clean.includes('jaka pozycja') || clean.includes('czytaj pozycję')) {
      this.readFullPosition();
      return;
    }
    if (clean.includes('cofnij') || clean.includes('cofnij ruch')) {
      this.undoMove();
      return;
    }
    if (clean.includes('podpowiedz') || clean.includes('jaki ruch') || clean.includes('podpowiedź')) {
      this.requestEngineHint();
      return;
    }
    if (clean.includes('graj') || clean.includes('ruch silnika') || clean.includes('twój ruch')) {
      this.playEngineMove();
      return;
    }

    // Move phrases parsing
    // Replace Polish words with standard algebraic notation
    let phrase = clean
      .replace(/\bkrótka roszada\b|\broszada krótka\b|\bzero zero\b/g, 'O-O')
      .replace(/\bdługa roszada\b|\broszada długa\b/g, 'O-O-O')
      .replace(/\bskoczek\b|\bkoń\b/g, 'N')
      .replace(/\bgoniec\b|\blaufer\b/g, 'B')
      .replace(/\bwieża\b/g, 'R')
      .replace(/\bhetman\b|\bkrólowa\b|\bdama\b/g, 'Q')
      .replace(/\bkról\b/g, 'K')
      .replace(/\bpion\b|\bpionek\b/g, '')
      .replace(/\bna\b|\bdo\b|\bz\b|\bbije\b/g, ' ')
      .replace(/\ba jeden\b/g, 'a1').replace(/\ba dwa\b/g, 'a2').replace(/\ba trzy\b/g, 'a3').replace(/\ba cztery\b/g, 'a4')
      .replace(/\bb jeden\b/g, 'b1').replace(/\bb dwa\b/g, 'b2').replace(/\bb trzy\b/g, 'b3').replace(/\bb cztery\b/g, 'b4')
      .replace(/\bc jeden\b/g, 'c1').replace(/\bc dwa\b/g, 'c2').replace(/\bc trzy\b/g, 'c3').replace(/\bc cztery\b/g, 'c4')
      .replace(/\bd jeden\b/g, 'd1').replace(/\bd dwa\b/g, 'd2').replace(/\bd trzy\b/g, 'd3').replace(/\bd cztery\b/g, 'd4')
      .replace(/\be jeden\b/g, 'e1').replace(/\be dwa\b/g, 'e2').replace(/\be trzy\b/g, 'e3').replace(/\be cztery\b/g, 'e4')
      .replace(/\bf jeden\b/g, 'f1').replace(/\bf dwa\b/g, 'f2').replace(/\bf trzy\b/g, 'f3').replace(/\bf cztery\b/g, 'f4')
      .replace(/\bg jeden\b/g, 'g1').replace(/\bg dwa\b/g, 'g2').replace(/\bg trzy\b/g, 'g3').replace(/\bg cztery\b/g, 'g4')
      .replace(/\bh jeden\b/g, 'h1').replace(/\bh dwa\b/g, 'h2').replace(/\bh trzy\b/g, 'h3').replace(/\bh cztery\b/g, 'h4')
      .replace(/\s+/g, '')
      .toLowerCase();

    // Check against legal moves
    const legalMoves = this.game.moves({ verbose: true });
    let matchedMove = null;

    // Direct match (e.g. "e4", "nf3")
    matchedMove = legalMoves.find(m => 
      m.san.toLowerCase().replace(/[^a-z0-9]/g, '') === phrase ||
      `${m.from}${m.to}`.toLowerCase() === phrase
    );

    // Partial match (e.g. piece + target square)
    if (!matchedMove) {
      matchedMove = legalMoves.find(m => {
        const fullPl = `${m.piece}${m.to}`.toLowerCase();
        return fullPl === phrase || m.to === phrase;
      });
    }

    if (matchedMove) {
      this.makeMove(matchedMove);
    } else {
      this.speak(`Rozpoznano: "${raw}", ale to nie jest poprawny ruch w tej pozycji.`);
    }
  }

  // --- Stockfish Engine Integration ---
  initStockfish() {
    try {
      this.stockfish = new Worker('js/vendor/stockfish.js');
      this.stockfish.onmessage = (event) => {
        this.handleEngineMessage(event.data);
      };
      this.stockfish.postMessage('uci');
      this.stockfish.postMessage('isready');
    } catch (e) {
      remoteLog('ERROR', 'Failed to load Stockfish worker: ' + e.message);
      this.el.engineStatus.querySelector('.status-dot').className = 'status-dot error';
      this.el.engineStatus.querySelector('.status-text').textContent = 'Błąd silnika';
    }
  }

  handleEngineMessage(line) {
    if (typeof line !== 'string') return;

    if (line === 'readyok' || line.includes('id name Stockfish')) {
      this.stockfishReady = true;
      this.el.engineStatus.querySelector('.status-dot').className = 'status-dot';
      this.el.engineStatus.querySelector('.status-text').textContent = 'Stockfish';
    }

    // Evaluation parsing
    if (line.startsWith('info') && line.includes('score')) {
      const cpMatch = line.match(/score cp (-?\d+)/);
      const mateMatch = line.match(/score mate (-?\d+)/);
      if (cpMatch) {
        const cp = parseInt(cpMatch[1], 10);
        const evalScore = (this.game.turn() === 'w' ? cp : -cp) / 100;
        this.el.engineEvalText.textContent = `Ocena: ${evalScore > 0 ? '+' : ''}${evalScore.toFixed(1)}`;
      } else if (mateMatch) {
        this.el.engineEvalText.textContent = `Mat w ${mateMatch[1]}`;
      }
    }

    // Best move received
    if (line.startsWith('bestmove')) {
      this.isEngineThinking = false;
      const parts = line.split(' ');
      const moveStr = parts[1];

      if (this.pendingEngineAction === 'play') {
        this.pendingEngineAction = null;
        if (moveStr && moveStr !== '(none)') {
          const from = moveStr.substring(0, 2);
          const to = moveStr.substring(2, 4);
          const promotion = moveStr.length > 4 ? moveStr[4] : undefined;
          const move = this.game.move({ from, to, promotion });
          if (move) {
            this.handleMoveSuccess(move, true);
          }
        }
      } else if (this.pendingEngineAction === 'hint') {
        this.pendingEngineAction = null;
        if (moveStr && moveStr !== '(none)') {
          const from = moveStr.substring(0, 2);
          const to = moveStr.substring(2, 4);
          const plDesc = this.formatMoveToPolish({ from, to });
          this.speak(`Podpowiedź: najlepszy ruch to ${plDesc}`);
        }
      }
    }
  }

  playEngineMove() {
    if (this.game.game_over()) {
      this.speak('Partia jest zakończona.');
      return;
    }
    if (this.isEngineThinking || !this.stockfishReady) return;

    this.isEngineThinking = true;
    this.pendingEngineAction = 'play';
    this.setSpeechIndicator(true, 'Silnik myśli...');
    this.stockfish.postMessage(`position fen ${this.game.fen()}`);
    this.stockfish.postMessage(`go depth ${this.engineDepth}`);
  }

  requestEngineHint() {
    if (this.game.game_over() || !this.stockfishReady) return;
    this.pendingEngineAction = 'hint';
    this.setSpeechIndicator(true, 'Szukam najlepszego ruchu...');
    this.stockfish.postMessage(`position fen ${this.game.fen()}`);
    this.stockfish.postMessage(`go depth ${this.engineDepth}`);
  }

  // --- Move Management ---
  makeMove(moveObj) {
    try {
      const res = this.game.move(moveObj);
      if (res) {
        this.handleMoveSuccess(res, false);
        return true;
      }
    } catch (e) {
      remoteLog('WARN', 'Invalid move attempt: ' + e.message);
    }
    return false;
  }

  handleMoveSuccess(move, isEngineMove) {
    this.updateUI();
    const plMove = this.formatMoveToPolish(move);
    const actor = isEngineMove ? 'Silnik zagrał: ' : 'Twój ruch: ';
    const textToSpeak = `${actor}${plMove}. ${this.getCheckOrStatusSpeech()}`;

    this.el.lastMoveText.textContent = `Ostatni: ${move.san} (${plMove})`;

    if (!isEngineMove && this.autoSpeakEngine) {
      this.speak(textToSpeak);
      // Automatically reply with engine move after brief pause if auto is configured
    } else {
      this.speak(textToSpeak);
    }

    // Trigger engine evaluation in background
    if (this.stockfishReady && !this.game.game_over()) {
      this.stockfish.postMessage(`position fen ${this.game.fen()}`);
      this.stockfish.postMessage(`go depth 8`);
    }
  }

  undoMove() {
    const undone = this.game.undo();
    if (undone) {
      this.updateUI();
      const plMove = this.formatMoveToPolish(undone);
      this.speak(`Cofnięto ruch ${plMove}. Ruch ${this.game.turn() === 'w' ? 'białych' : 'czarnych'}.`);
    } else {
      this.speak('Brak ruchów do cofnięcia.');
    }
  }

  resetGame() {
    this.game.reset();
    if (this.stockfishReady) {
      this.stockfish.postMessage('ucinewgame');
    }
    this.updateUI();
    this.speak('Rozpoczęto nową partię. Ustaw figury w pozycji początkowej. Ruch białych.');
  }

  // --- Polish Language Chess Position & Move Describer ---
  formatMoveToPolish(move) {
    if (move.san === 'O-O') return 'krótka roszada';
    if (move.san === 'O-O-O') return 'długa roszada';

    const pieceName = PIECE_NAMES_PL[move.piece || 'p'] || 'figura';
    const isCapture = move.flags.includes('c') || move.flags.includes('e');
    const captureText = isCapture ? 'bije na' : 'na';

    let desc = '';
    if (move.piece === 'p') {
      desc = `pionek ${captureText} ${move.to}`;
    } else {
      desc = `${pieceName} ${captureText} ${move.to}`;
    }

    if (move.san.includes('#')) desc += ', szach i mat';
    else if (move.san.includes('+')) desc += ', szach';

    return desc;
  }

  getCheckOrStatusSpeech() {
    if (this.game.in_checkmate()) return 'Szach i mat! Koniec partii.';
    if (this.game.in_draw()) return 'Partia zakończona remisem.';
    if (this.game.in_check()) return 'Szach!';
    return `Ruch ${this.game.turn() === 'w' ? 'białych' : 'czarnych'}.`;
  }

  readFullPosition() {
    const board = this.game.board();
    const whitePieces = [];
    const blackPieces = [];

    const order = ['k', 'q', 'r', 'b', 'n', 'p'];

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
      order.forEach(type => groups[type] = []);
      list.forEach(p => groups[p.type].push(p.square));

      const parts = [];
      if (groups.k.length) parts.push(`król na ${groups.k.join(', ')}`);
      if (groups.q.length) parts.push(`hetman na ${groups.q.join(', ')}`);
      if (groups.r.length) parts.push(`wieża na ${groups.r.join(', ')}`);
      if (groups.b.length) parts.push(`goniec na ${groups.b.join(', ')}`);
      if (groups.n.length) parts.push(`skoczek na ${groups.n.join(', ')}`);
      if (groups.p.length) parts.push(`pionki na ${groups.p.join(', ')}`);
      return parts.join('; ');
    };

    const whiteDesc = groupPieces(whitePieces);
    const blackDesc = groupPieces(blackPieces);
    const turnDesc = this.game.turn() === 'w' ? 'Ruch mają białe' : 'Ruch mają czarne';

    const fullSpeech = `Opis pozycji. Białe figury: ${whiteDesc}. Czarne figury: ${blackDesc}. ${turnDesc}.`;
    this.speak(fullSpeech);
  }

  // --- Visual Chess Board Renderer (for phone verification) ---
  initBoardUI() {
    this.el.chessboard.innerHTML = '';
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    for (let rank = 8; rank >= 1; rank--) {
      for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
        const file = files[fileIdx];
        const squareId = `${file}${rank}`;
        const isLight = (fileIdx + rank) % 2 !== 0;

        const sq = document.createElement('div');
        sq.className = `square ${isLight ? 'light' : 'dark'}`;
        sq.dataset.square = squareId;

        // Coordinate hints on borders
        if (file === 'a') {
          const rankLabel = document.createElement('span');
          rankLabel.className = 'coord-label coord-rank';
          rankLabel.textContent = rank;
          sq.appendChild(rankLabel);
        }
        if (rank === 1) {
          const fileLabel = document.createElement('span');
          fileLabel.className = 'coord-label coord-file';
          fileLabel.textContent = file;
          sq.appendChild(fileLabel);
        }

        sq.addEventListener('click', () => this.handleSquareClick(squareId));
        this.el.chessboard.appendChild(sq);
      }
    }
  }

  renderBoardPieces() {
    const board = this.game.board();
    const squares = this.el.chessboard.querySelectorAll('.square');

    squares.forEach(sq => {
      const squareId = sq.dataset.square;
      const fileIdx = squareId.charCodeAt(0) - 97;
      const rank = parseInt(squareId[1], 10);
      const piece = board[8 - rank][fileIdx];

      // Remove existing piece symbol span
      const existing = sq.querySelector('.piece-symbol');
      if (existing) existing.remove();

      sq.classList.remove('selected');
      if (this.selectedSquare === squareId) {
        sq.classList.add('selected');
      }

      if (piece) {
        const symbolKey = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
        const span = document.createElement('span');
        span.className = 'piece-symbol';
        span.textContent = PIECE_SYMBOLS[symbolKey] || '';
        sq.appendChild(span);
      }
    });
  }

  handleSquareClick(squareId) {
    if (!this.selectedSquare) {
      const piece = this.game.get(squareId);
      if (piece && piece.color === this.game.turn()) {
        this.selectedSquare = squareId;
        this.renderBoardPieces();
      }
    } else {
      const from = this.selectedSquare;
      const to = squareId;
      this.selectedSquare = null;

      if (from !== to) {
        const move = this.makeMove({ from, to, promotion: 'q' });
        if (!move) {
          // If clicked another own piece, select it instead
          const piece = this.game.get(to);
          if (piece && piece.color === this.game.turn()) {
            this.selectedSquare = to;
          }
        }
      }
      this.renderBoardPieces();
    }
  }

  // --- UI Update & Event Listeners ---
  updateUI() {
    const turn = this.game.turn();
    const isWhite = turn === 'w';

    this.el.turnMarker.className = `piece-marker ${isWhite ? 'white' : 'black'}`;
    this.el.turnLabel.textContent = isWhite ? 'Ruch Białych' : 'Ruch Czarnych';

    const history = this.game.history();
    const moveNumber = Math.floor(history.length / 2) + 1;
    this.el.moveCount.textContent = `Ruch ${moveNumber}`;

    if (this.game.in_checkmate()) {
      this.el.gameStatusText.textContent = ' — MAT!';
    } else if (this.game.in_check()) {
      this.el.gameStatusText.textContent = ' — SZACH';
    } else if (this.game.in_draw()) {
      this.el.gameStatusText.textContent = ' — REMIS';
    } else {
      this.el.gameStatusText.textContent = '';
    }

    this.renderBoardPieces();
  }

  attachEventListeners() {
    // Actions
    this.el.btnReadPosition.addEventListener('click', () => this.readFullPosition());
    this.el.btnVoiceInput.addEventListener('click', () => this.toggleListening());
    this.el.btnPlayEngineMove.addEventListener('click', () => this.playEngineMove());
    this.el.btnReadHint.addEventListener('click', () => this.requestEngineHint());
    this.el.btnReadLastMove.addEventListener('click', () => {
      const history = this.game.history({ verbose: true });
      if (history.length > 0) {
        const last = history[history.length - 1];
        this.speak(`Ostatni ruch: ${this.formatMoveToPolish(last)}`);
      } else {
        this.speak('Nie wykonano jeszcze żadnego ruchu.');
      }
    });

    this.el.btnUndoMove.addEventListener('click', () => this.undoMove());
    this.el.btnNewGame.addEventListener('click', () => {
      if (confirm('Czy na pewno chcesz zacząć nową partię?')) {
        this.resetGame();
      }
    });

    this.el.btnCopyFen.addEventListener('click', () => {
      navigator.clipboard.writeText(this.game.fen()).then(() => {
        this.speak('Skopiowano pozycję do schowka');
      });
    });

    // Manual input
    const executeManualMove = () => {
      const val = this.el.manualMoveInput.value.trim();
      if (!val) return;
      this.handleVoiceCommand(val);
      this.el.manualMoveInput.value = '';
    };

    this.el.btnSendManualMove.addEventListener('click', executeManualMove);
    this.el.manualMoveInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeManualMove();
    });

    // Board Accordion
    this.el.boardToggle.addEventListener('click', () => {
      this.el.boardAccordion.classList.toggle('expanded');
    });

    // Settings Modal
    this.el.btnOpenSettings.addEventListener('click', () => {
      this.el.settingsModal.classList.add('open');
    });
    this.el.btnCloseSettings.addEventListener('click', () => {
      this.el.settingsModal.classList.remove('open');
    });
    this.el.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.el.settingsModal) {
        this.el.settingsModal.classList.remove('open');
      }
    });

    this.el.speechRate.addEventListener('input', (e) => {
      this.speechRate = parseFloat(e.target.value);
      this.el.speechRateVal.textContent = this.speechRate.toFixed(2);
    });

    this.el.engineDepth.addEventListener('input', (e) => {
      this.engineDepth = parseInt(e.target.value, 10);
      this.el.engineDepthVal.textContent = this.engineDepth;
    });

    this.el.descriptionStyle.addEventListener('change', (e) => {
      this.descriptionStyle = e.target.value;
    });

    this.el.autoSpeakEngineMove.addEventListener('change', (e) => {
      this.autoSpeakEngine = e.target.checked;
    });
  }
}

// Start app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new MowoSzachyApp();
});
