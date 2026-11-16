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
  p: 'pionek',
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

const DEFAULT_SETTINGS = {
  gameMode: 'vs-engine',       // 'vs-engine' | 'analysis'
  playerColor: 'w',            // 'w' | 'b'
  autoEngineResponse: true,
  autoListenAfterEngine: false,
  soundAlert: true,
  autoFlipBoard: true,
  boardTheme: 'wood',          // 'wood' | 'zelda'
  engineDepth: 10,
  speechRate: 1.0,
  descriptionStyle: 'detailed',
  autoSpeakEngine: true,
  voiceIndex: -1
};

class MowoSzachyApp {
  constructor() {
    this.game = new Chess();
    this.stockfish = null;
    this.stockfishReady = false;
    this.isEngineThinking = false;
    this.pendingEngineAction = null;
    this.engineTimer = null;

    // Board & Game State
    this.selectedSquare = null;
    this.lastMoveSquares = []; // [from, to]
    this.isBoardFlipped = false;
    this.recognition = null;
    this.isListening = false;
    this.currentVoice = null;

    // Load user settings or defaults
    this.settings = this.loadSettings();

    this.initElements();
    this.syncSettingsToUI();
    this.initAudioContext();
    this.initSpeechSynthesis();
    this.initSpeechRecognition();
    this.initStockfish();
    this.initBoardUI();
    this.attachEventListeners();
    this.updateUI();

    remoteLog('INFO', `MowoSzachy initialized. Mode: ${this.settings.gameMode}, Color: ${this.settings.playerColor}`);
  }

  // --- Settings Persistence ---
  loadSettings() {
    try {
      const stored = localStorage.getItem('mowoszachy_settings');
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      remoteLog('WARN', 'Could not load settings: ' + e.message);
    }
    return { ...DEFAULT_SETTINGS };
  }

  saveSettings() {
    try {
      localStorage.setItem('mowoszachy_settings', JSON.stringify(this.settings));
    } catch (e) {
      remoteLog('WARN', 'Could not save settings: ' + e.message);
    }
  }

  syncSettingsToUI() {
    this.el.gameModeSelect.value = this.settings.gameMode;
    this.el.playerColorSelect.value = this.settings.playerColor;
    this.el.autoEngineResponse.checked = this.settings.autoEngineResponse;
    this.el.autoListenAfterEngine.checked = this.settings.autoListenAfterEngine;
    this.el.soundAlert.checked = this.settings.soundAlert;
    this.el.autoFlipBoard.checked = this.settings.autoFlipBoard;
    if (this.el.boardThemeSelect) this.el.boardThemeSelect.value = this.settings.boardTheme || 'wood';
    this.el.engineDepth.value = this.settings.engineDepth;
    this.el.engineDepthVal.textContent = this.settings.engineDepth;
    this.el.speechRate.value = this.settings.speechRate;
    this.el.speechRateVal.textContent = parseFloat(this.settings.speechRate).toFixed(2);
    this.el.descriptionStyle.value = this.settings.descriptionStyle;
    this.el.autoSpeakEngineMove.checked = this.settings.autoSpeakEngine;

    this.isBoardFlipped = this.settings.autoFlipBoard && (this.settings.playerColor === 'b');
    this.updateModeLabels();
    this.applyBoardTheme();
  }

  applyBoardTheme() {
    const theme = this.settings.boardTheme || 'wood';
    this.el.chessboard.classList.remove('theme-wood', 'theme-zelda');
    this.el.chessboard.classList.add(`theme-${theme}`);
  }

  updateModeLabels() {
    if (this.settings.gameMode === 'vs-engine') {
      const sideName = this.settings.playerColor === 'w' ? 'Białe' : 'Czarne';
      const engineSide = this.settings.playerColor === 'w' ? 'Czarne' : 'Białe';
      this.el.modeLabelText.textContent = `Gracz (${sideName}) vs Silnik (${engineSide})`;
      this.el.sideLabel.textContent = `Gram: ${sideName}`;
      this.el.sideIcon.textContent = this.settings.playerColor === 'w' ? '⚪' : '⚫';
    } else {
      this.el.modeLabelText.textContent = 'Tryb: Dwóch graczy / Analiza';
      this.el.sideLabel.textContent = 'Analiza';
      this.el.sideIcon.textContent = '🔍';
    }
  }

  initElements() {
    this.el = {
      // Header & Status
      engineStatus: document.getElementById('engineStatus'),
      speechStatus: document.getElementById('speechStatus'),
      btnOpenSettings: document.getElementById('btnOpenSettings'),

      // Mode & Matchup Bar
      modeBar: document.getElementById('modeBar'),
      modePill: document.getElementById('modePill'),
      modeLabelText: document.getElementById('modeLabelText'),
      btnSideToggle: document.getElementById('btnSideToggle'),
      sideIcon: document.getElementById('sideIcon'),
      sideLabel: document.getElementById('sideLabel'),

      // Turn Banner
      turnMarker: document.getElementById('turnMarker'),
      turnLabel: document.getElementById('turnLabel'),
      moveCount: document.getElementById('moveCount'),
      gameStatusText: document.getElementById('gameStatusText'),

      // Speech Card
      speechStateLabel: document.getElementById('speechStateLabel'),
      speechWaves: document.getElementById('speechWaves'),
      speechDisplayText: document.getElementById('speechDisplayText'),
      lastMoveText: document.getElementById('lastMoveText'),
      engineEvalText: document.getElementById('engineEvalText'),

      // Action Buttons
      btnReadPosition: document.getElementById('btnReadPosition'),
      btnVoiceInput: document.getElementById('btnVoiceInput'),
      voiceBtnLabel: document.getElementById('voiceBtnLabel'),
      btnPlayEngineMove: document.getElementById('btnPlayEngineMove'),
      btnReadHint: document.getElementById('btnReadHint'),
      btnReadLastMove: document.getElementById('btnReadLastMove'),

      // Manual Input
      manualMoveInput: document.getElementById('manualMoveInput'),
      btnSendManualMove: document.getElementById('btnSendManualMove'),

      // Board & Aux
      chessboard: document.getElementById('chessboard'),
      boardAccordion: document.getElementById('boardAccordion'),
      boardToggle: document.getElementById('boardToggle'),
      btnUndoMove: document.getElementById('btnUndoMove'),
      btnNewGame: document.getElementById('btnNewGame'),
      btnFlipBoard: document.getElementById('btnFlipBoard'),
      btnCopyFen: document.getElementById('btnCopyFen'),

      // Settings Modal
      settingsModal: document.getElementById('settingsModal'),
      btnCloseSettings: document.getElementById('btnCloseSettings'),
      gameModeSelect: document.getElementById('gameModeSelect'),
      playerColorSelect: document.getElementById('playerColorSelect'),
      autoEngineResponse: document.getElementById('autoEngineResponse'),
      autoListenAfterEngine: document.getElementById('autoListenAfterEngine'),
      soundAlert: document.getElementById('soundAlert'),
      autoFlipBoard: document.getElementById('autoFlipBoard'),
      boardThemeSelect: document.getElementById('boardThemeSelect'),
      engineDepth: document.getElementById('engineDepth'),
      engineDepthVal: document.getElementById('engineDepthVal'),
      voiceSelect: document.getElementById('voiceSelect'),
      speechRate: document.getElementById('speechRate'),
      speechRateVal: document.getElementById('speechRateVal'),
      descriptionStyle: document.getElementById('descriptionStyle'),
      autoSpeakEngineMove: document.getElementById('autoSpeakEngineMove'),

      // New Game Modal
      newGameModal: document.getElementById('newGameModal'),
      btnCloseNewGame: document.getElementById('btnCloseNewGame'),
      btnChooseWhite: document.getElementById('btnChooseWhite'),
      btnChooseBlack: document.getElementById('btnChooseBlack'),
    };
  }

  // --- Web Audio Chime (Offline, Zero Assets) ---
  initAudioContext() {
    this.audioCtx = null;
    const unlock = () => {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.audioCtx = new AudioContext();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  playChime() {
    if (!this.settings.soundAlert) return;
    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) this.audioCtx = new AudioContext();
      }
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      // Audio might fail before gesture, ignore safely
    }
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
      if (!voices || voices.length === 0) return;

      this.el.voiceSelect.innerHTML = '';
      const plVoices = voices.filter(v => v.lang.startsWith('pl') || v.lang.includes('PL'));
      const activeList = plVoices.length > 0 ? plVoices : voices;

      activeList.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${voice.name} (${voice.lang})${voice.default ? ' — domyślny' : ''}`;
        this.el.voiceSelect.appendChild(option);
      });

      if (this.settings.voiceIndex >= 0 && activeList[this.settings.voiceIndex]) {
        this.currentVoice = activeList[this.settings.voiceIndex];
        this.el.voiceSelect.value = this.settings.voiceIndex;
      } else {
        this.currentVoice = plVoices.length > 0 ? plVoices[0] : (voices[0] || null);
      }

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
      this.settings.voiceIndex = parseInt(e.target.value, 10);
      this.currentVoice = activeList[this.settings.voiceIndex] || null;
      this.saveSettings();
    });
  }

  speak(text, priority = false, onEnd = null) {
    if (!('speechSynthesis' in window)) {
      this.setDisplayText(text);
      if (onEnd) onEnd();
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
    utterance.rate = this.settings.speechRate;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      this.setSpeechIndicator(false, 'Gotowy');
      if (onEnd) onEnd();
    };

    utterance.onerror = (err) => {
      remoteLog('WARN', 'Speech error: ' + (err.error || 'unknown'));
      this.setSpeechIndicator(false, 'Gotowy');
      if (onEnd) onEnd();
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
      const transcript = event.results[0][0].transcript.trim();
      remoteLog('INFO', 'Speech recognized: ' + transcript);
      this.handleVoiceCommand(transcript);
    };

    this.recognition.onerror = (event) => {
      remoteLog('WARN', 'Speech recognition error: ' + event.error);
      if (event.error !== 'no-speech') {
        this.speak('Nie dosłyszałem ruchu. Spróbuj ponownie.');
      }
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
      try { this.recognition.stop(); } catch (e) {}
    } else {
      try {
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }
        this.recognition.start();
      } catch (e) {
        remoteLog('WARN', 'Could not start recognition: ' + e.message);
      }
    }
  }

  // --- Polish Chess Voice & Text Parser ---
  normalizePolishSpeech(raw) {
    let text = raw.toLowerCase().trim();

    // Remove punctuation
    text = text.replace(/[.,!?:;\-\–]/g, ' ');

    // Misheard Polish phonetics in Google Speech STT
    // "503", "5 3", "f 3" -> "f3"
    text = text.replace(/\b503\b/g, 'f3');
    text = text.replace(/\b50\b/g, 'f');

    // Letter phonetic names
    text = text.replace(/\bef\b/g, 'f');
    text = text.replace(/\bce\b|\bse\b/g, 'c');
    text = text.replace(/\bde\b/g, 'd');
    text = text.replace(/\bbe\b/g, 'b');
    text = text.replace(/\bgie\b|\bge\b/g, 'g');
    text = text.replace(/\bha\b/g, 'h');

    // Numbers in words
    const numMap = {
      jeden: '1', jedynka: '1',
      dwa: '2', dwójka: '2', dwie: '2',
      trzy: '3', trójka: '3',
      cztery: '4', czwórka: '4',
      pięć: '5', piec: '5', piątka: '5',
      sześć: '6', szesc: '6', szóstka: '6',
      siedem: '7', siódemka: '7',
      osiem: '8', ósemka: '8'
    };
    for (const [word, num] of Object.entries(numMap)) {
      const reg = new RegExp(`\\b${word}\\b`, 'g');
      text = text.replace(reg, num);
    }

    // Castling phrases: long castling must precede short castling to avoid prefix shadowing ("zero zero zero")
    text = text.replace(/\b(długa roszada|duża roszada|roszada długa|roszada duża|zero zero zero)\b/g, 'O-O-O');
    text = text.replace(/\b(krótka roszada|mała roszada|roszada krótka|roszada mała|zero zero)\b/g, 'O-O');
    text = text.replace(/\broszada\b/g, 'O-O');

    // Piece names
    text = text.replace(/\b(skoczek|skoczka|skoczkiem|koń|konia|koniem)\b/g, 'N');
    text = text.replace(/\b(goniec|gońca|gońcem|laufer|laufra)\b/g, 'B');
    text = text.replace(/\b(wieża|wieżę|wieżą|wieze)\b/g, 'R');
    text = text.replace(/\b(hetman|hetmana|hetmanem|królowa|królową|dama|damę|damą)\b/g, 'Q');
    text = text.replace(/\b(król|króla|królem)\b/g, 'K');
    text = text.replace(/\b(pion|pionek|piona|pionka|pionem|pionkiem)\b/g, 'P');

    // Action & filler words
    text = text.replace(/\b(na|do|w|z|pole|pola)\b/g, ' ');
    text = text.replace(/\b(bije|zbija|bierze|bicia)\b/g, 'x');

    // Collapse separated letter + digit (e.g. "e 4" -> "e4", "f 3" -> "f3", "c 4" -> "c4")
    text = text.replace(/\b([a-h])\s+([1-8])\b/g, '$1$2');

    // Normalize multiple spaces
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  handleVoiceCommand(raw) {
    const rawLower = raw.toLowerCase().trim();

    // 1. Spoken Application Commands
    if (rawLower.includes('nowa partia') || rawLower.includes('zacznij od nowa') || rawLower.includes('zresetuj')) {
      this.showNewGameModal();
      return;
    }
    if (rawLower.includes('graj białymi') || rawLower.includes('zagraj białymi')) {
      this.startNewGame('w');
      return;
    }
    if (rawLower.includes('graj czarnymi') || rawLower.includes('zagraj czarnymi')) {
      this.startNewGame('b');
      return;
    }
    if (rawLower.includes('poddaję') || rawLower.includes('rezygnuję') || rawLower.includes('poddanie')) {
      this.resignGame();
      return;
    }
    if (rawLower.includes('cofnij') || rawLower.includes('cofnij ruch') || rawLower.includes('wróć')) {
      this.undoMove();
      return;
    }
    if (rawLower.includes('podpowiedz') || rawLower.includes('jaki ruch') || rawLower.includes('podpowiedź') || rawLower.includes('pomóż')) {
      this.requestEngineHint();
      return;
    }
    if (rawLower.includes('przeczytaj pozycję') || rawLower.includes('jaka pozycja') || rawLower.includes('czytaj pozycję') || rawLower.includes('stan gry')) {
      this.readFullPosition();
      return;
    }
    if (rawLower.includes('powtórz') || rawLower.includes('ostatni ruch') || rawLower.includes('jaki był ruch') || rawLower.includes('co zagrałeś')) {
      this.repeatLastMove();
      return;
    }
    if (rawLower.includes('odwróć') && (rawLower.includes('szachownicę') || rawLower.includes('deskę'))) {
      this.toggleBoardFlip();
      return;
    }
    if (rawLower.includes('motyw zelda') || rawLower.includes('motyw fantasy')) {
      this.settings.boardTheme = 'zelda';
      if (this.el.boardThemeSelect) this.el.boardThemeSelect.value = 'zelda';
      this.saveSettings();
      this.applyBoardTheme();
      this.speak('Zmieniono motyw szachownicy na Zelda Fantasy.');
      return;
    }
    if (rawLower.includes('motyw drewno') || rawLower.includes('motyw klasyczny')) {
      this.settings.boardTheme = 'wood';
      if (this.el.boardThemeSelect) this.el.boardThemeSelect.value = 'wood';
      this.saveSettings();
      this.applyBoardTheme();
      this.speak('Zmieniono motyw szachownicy na klasyczne drewno.');
      return;
    }
    if (rawLower.includes('graj') || rawLower.includes('ruch silnika') || rawLower.includes('twój ruch')) {
      this.playEngineMove();
      return;
    }

    // 2. Parse as a chess move
    const clean = this.normalizePolishSpeech(raw);
    remoteLog('INFO', `Speech parsed: "${raw}" -> "${clean}"`);

    const legalMoves = this.game.moves({ verbose: true });
    if (legalMoves.length === 0) {
      this.speak('Partia jest już zakończona.');
      return;
    }

    let matchedMove = this.findMatchingMove(clean, legalMoves);

    if (matchedMove) {
      this.makeMove(matchedMove, false);
    } else {
      this.speak(`Rozpoznano: "${raw}". To nie jest poprawny ruch w tej pozycji. Spróbuj jeszcze raz.`);
    }
  }

  findMatchingMove(clean, legalMoves) {
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

      if (pieceSpecified) {
        const pieceType = pieceSpecified.toLowerCase();
        const pieceCandidates = candidates.filter(m => m.piece === (pieceType === 'p' ? 'p' : pieceType));

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

      // If user started as Black and it's move 1, make engine start!
      if (this.settings.gameMode === 'vs-engine' && this.settings.playerColor === 'b' && this.game.history().length === 0) {
        setTimeout(() => this.playEngineMove(), 600);
      }
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
      this.setSpeechIndicator(false, 'Gotowy');

      const parts = line.split(' ');
      const moveStr = parts[1];

      if (this.pendingEngineAction === 'play') {
        this.pendingEngineAction = null;
        if (moveStr && moveStr !== '(none)') {
          const from = moveStr.substring(0, 2);
          const to = moveStr.substring(2, 4);
          const promotion = moveStr.length > 4 ? moveStr[4] : undefined;
          this.makeMove({ from, to, promotion }, true);
        }
      } else if (this.pendingEngineAction === 'hint') {
        this.pendingEngineAction = null;
        if (moveStr && moveStr !== '(none)') {
          const from = moveStr.substring(0, 2);
          const to = moveStr.substring(2, 4);
          const plDesc = this.formatMoveToPolish({ from, to });
          this.speak(`Podpowiedź: najlepszy ruch to ${plDesc}.`);
        }
      }
    }
  }

  playEngineMove() {
    if (this.game.game_over()) {
      this.handleGameOver();
      return;
    }
    if (this.isEngineThinking || !this.stockfishReady) return;

    this.isEngineThinking = true;
    this.pendingEngineAction = 'play';
    this.setSpeechIndicator(true, 'Silnik myśli...');
    this.el.engineEvalText.textContent = 'Ocena: obliczanie...';

    this.stockfish.postMessage(`position fen ${this.game.fen()}`);
    this.stockfish.postMessage(`go depth ${this.settings.engineDepth}`);
  }

  requestEngineHint() {
    if (this.game.game_over() || !this.stockfishReady) return;
    this.pendingEngineAction = 'hint';
    this.setSpeechIndicator(true, 'Szukam najlepszego ruchu...');
    this.stockfish.postMessage(`position fen ${this.game.fen()}`);
    this.stockfish.postMessage(`go depth ${this.settings.engineDepth}`);
  }

  // --- Move Execution & Game Loop ---
  makeMove(moveObj, isEngine = false) {
    try {
      const res = this.game.move(moveObj);
      if (res) {
        this.lastMoveSquares = [res.from, res.to];
        this.handleMoveSuccess(res, isEngine);
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
    this.el.lastMoveText.textContent = `Ostatni: ${move.san} (${plMove})`;

    // Check game termination immediately after move
    if (this.game.game_over()) {
      if (isEngineMove) this.playChime();
      this.handleGameOver(move, isEngineMove);
      return;
    }

    if (isEngineMove) {
      // Sound alert when engine plays
      this.playChime();

      let speech = `Silnik zagrał: ${plMove}.`;
      if (this.game.in_check()) speech += ' Szach!';
      speech += ' Twój ruch.';

      if (this.settings.autoSpeakEngine) {
        this.speak(speech, false, () => {
          if (this.settings.autoListenAfterEngine && !this.game.game_over()) {
            this.toggleListening();
          }
        });
      } else {
        this.setDisplayText(speech);
      }
    } else {
      // Human move
      let speech = `Twój ruch: ${plMove}.`;
      if (this.game.in_check()) speech += ' Szach!';

      this.speak(speech);

      // Trigger automatic engine response in vs-engine mode!
      if (this.settings.gameMode === 'vs-engine' && this.settings.autoEngineResponse) {
        if (this.game.turn() !== this.settings.playerColor) {
          // Give brief pause for human move speech to commence
          if (this.engineTimer) clearTimeout(this.engineTimer);
          this.engineTimer = setTimeout(() => {
            this.playEngineMove();
          }, 650);
        }
      }
    }

    // Background evaluation update
    if (this.stockfishReady && !this.isEngineThinking) {
      this.stockfish.postMessage(`position fen ${this.game.fen()}`);
      this.stockfish.postMessage(`go depth 6`);
    }
  }

  // --- Game Over Handling ---
  handleGameOver(lastMove = null, wasEngineMove = false) {
    this.isEngineThinking = false;
    this.pendingEngineAction = null;
    this.updateUI();

    let title = '';
    let speech = '';

    if (this.game.in_checkmate()) {
      const loser = this.game.turn(); // The side whose turn it is lost
      if (this.settings.gameMode === 'vs-engine') {
        if (loser === this.settings.playerColor) {
          title = 'Szach i mat! Silnik wygrywa.';
          speech = 'Szach i mat! Silnik wygrał partię. Dobra gra! Kliknij nowa partia, aby zagrać ponownie.';
        } else {
          title = 'Szach i mat! Wygrałeś partię!';
          speech = 'Szach i mat! Gratulacje, wygrałeś partię z silnikiem! Brawo!';
        }
      } else {
        const winner = loser === 'w' ? 'czarne' : 'białe';
        title = `Szach i mat! Wygrywają ${winner}.`;
        speech = `Szach i mat! Partię wygrywają ${winner}.`;
      }
    } else if (this.game.in_stalemate()) {
      title = 'Pat — remis!';
      speech = 'Pat! Król nie ma legalnych ruchów i nie jest szachowany. Partia zakończona remisem.';
    } else if (this.game.in_threefold_repetition()) {
      title = 'Remis przez trzykrotne powtórzenie pozycji.';
      speech = 'Remis przez trzykrotne powtórzenie tej samej pozycji.';
    } else if (this.game.insufficient_material()) {
      title = 'Remis — brak materiału.';
      speech = 'Partia zakończona remisem z braku materiału matującego.';
    } else if (this.game.in_draw()) {
      title = 'Partia zremisowana.';
      speech = 'Partia zakończona remisem.';
    }

    this.el.gameStatusText.textContent = ` — ${title}`;
    this.speak(speech, true);
  }

  resignGame() {
    if (this.game.game_over()) {
      this.speak('Partia jest już zakończona.');
      return;
    }
    const speech = 'Poddajesz partię. Silnik wygrywa. Chcesz zagrać jeszcze raz? Kliknij nowa partia.';
    this.el.gameStatusText.textContent = ' — Poddanie partii';
    this.speak(speech, true);
  }

  // --- Smart Undo ---
  undoMove() {
    if (this.isEngineThinking) {
      // Abort engine thinking and undo player's move
      if (this.stockfish) this.stockfish.postMessage('stop');
      this.isEngineThinking = false;
      this.pendingEngineAction = null;

      const undone = this.game.undo();
      if (undone) {
        this.updateLastMoveFromHistory();
        this.updateUI();
        this.speak('Zatrzymano silnik i cofnięto Twój ruch. Twój ruch.');
        return;
      }
    }

    if (this.settings.gameMode === 'vs-engine') {
      // In vs-engine mode, undoing should revert to the player's turn (undo 2 half-moves)
      const history = this.game.history();
      if (history.length === 0) {
        this.speak('Brak ruchów do cofnięcia.');
        return;
      }

      // If it's player's turn, undo both engine move and previous player move
      if (this.game.turn() === this.settings.playerColor) {
        if (history.length === 1) {
          // Engine made first move as White
          this.game.undo();
          this.updateLastMoveFromHistory();
          this.updateUI();
          this.speak('Cofnięto ruch początkowy silnika.');
          return;
        }

        const engineMove = this.game.undo();
        const playerMove = this.game.undo();
        this.updateLastMoveFromHistory();
        this.updateUI();

        const plPlayer = this.formatMoveToPolish(playerMove);
        this.speak(`Cofnięto ruch silnika oraz Twój ruch ${plPlayer}. Twój ruch.`);
      } else {
        // Human played, engine hasn't replied yet
        const playerMove = this.game.undo();
        this.updateLastMoveFromHistory();
        this.updateUI();
        this.speak('Cofnięto Twój ruch. Twój ruch.');
      }
    } else {
      // Analysis mode: undo 1 move
      const undone = this.game.undo();
      if (undone) {
        this.updateLastMoveFromHistory();
        this.updateUI();
        const plMove = this.formatMoveToPolish(undone);
        this.speak(`Cofnięto ruch ${plMove}. Ruch ${this.game.turn() === 'w' ? 'białych' : 'czarnych'}.`);
      } else {
        this.speak('Brak ruchów do cofnięcia.');
      }
    }
  }

  updateLastMoveFromHistory() {
    const history = this.game.history({ verbose: true });
    if (history.length > 0) {
      const last = history[history.length - 1];
      this.lastMoveSquares = [last.from, last.to];
      this.el.lastMoveText.textContent = `Ostatni: ${last.san} (${this.formatMoveToPolish(last)})`;
    } else {
      this.lastMoveSquares = [];
      this.el.lastMoveText.textContent = 'Ostatni ruch: —';
    }
  }

  repeatLastMove() {
    const history = this.game.history({ verbose: true });
    if (history.length > 0) {
      const last = history[history.length - 1];
      const actor = (this.settings.gameMode === 'vs-engine' && last.color !== this.settings.playerColor)
        ? 'Silnik zagrał: '
        : 'Ostatni ruch: ';
      this.speak(`${actor}${this.formatMoveToPolish(last)}`);
    } else {
      this.speak('Nie wykonano jeszcze żadnego ruchu w tej partii.');
    }
  }

  // --- New Game & Side Selection ---
  showNewGameModal() {
    this.el.newGameModal.classList.add('open');
  }

  closeNewGameModal() {
    this.el.newGameModal.classList.remove('open');
  }

  startNewGame(color = 'w') {
    if (this.engineTimer) clearTimeout(this.engineTimer);
    this.closeNewGameModal();

    this.settings.playerColor = color;
    this.el.playerColorSelect.value = color;
    this.saveSettings();

    this.game.reset();
    this.lastMoveSquares = [];
    this.selectedSquare = null;
    this.isEngineThinking = false;
    this.pendingEngineAction = null;

    if (this.settings.autoFlipBoard) {
      this.isBoardFlipped = (color === 'b');
    }

    if (this.stockfishReady) {
      this.stockfish.postMessage('ucinewgame');
    }

    this.updateModeLabels();
    this.initBoardUI();
    this.updateUI();

    if (this.settings.gameMode === 'vs-engine') {
      if (color === 'w') {
        this.speak('Rozpoczęto nową partię. Grasz białymi. Ustaw figury i wykonaj pierwszy ruch.');
      } else {
        this.speak('Rozpoczęto nową partię. Grasz czarnymi. Silnik rozpoczyna partię.', false, () => {
          setTimeout(() => this.playEngineMove(), 500);
        });
      }
    } else {
      this.speak('Rozpoczęto nową partię w trybie analizy. Ruch białych.');
    }
  }

  toggleBoardFlip() {
    this.isBoardFlipped = !this.isBoardFlipped;
    this.initBoardUI();
    this.renderBoardPieces();
    this.speak(this.isBoardFlipped ? 'Odwrócono szachownicę dla czarnych' : 'Odwrócono szachownicę dla białych');
  }

  // --- Polish Position Describer ---
  formatMoveToPolish(move) {
    if (move.san === 'O-O') return 'krótka roszada';
    if (move.san === 'O-O-O') return 'długa roszada';

    const pieceName = PIECE_NAMES_PL[move.piece || 'p'] || 'figura';
    const isCapture = move.flags && (move.flags.includes('c') || move.flags.includes('e'));
    const captureText = isCapture ? 'bije na' : 'na';

    let desc = `${pieceName} ${captureText} ${move.to}`;

    if (move.promotion) {
      const promoName = PIECE_NAMES_PL[move.promotion] || 'hetman';
      desc += `, promocja na ${promoName}`;
    }

    if (move.san && move.san.includes('#')) desc += ', szach i mat';
    else if (move.san && move.san.includes('+')) desc += ', szach';

    return desc;
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

  // --- Visual Chess Board Renderer ---
  initBoardUI() {
    this.el.chessboard.innerHTML = '';

    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];

    const activeFiles = this.isBoardFlipped ? [...files].reverse() : files;
    const activeRanks = this.isBoardFlipped ? [...ranks].reverse() : ranks;

    for (let rIdx = 0; rIdx < 8; rIdx++) {
      const rank = activeRanks[rIdx];
      for (let fIdx = 0; fIdx < 8; fIdx++) {
        const file = activeFiles[fIdx];
        const squareId = `${file}${rank}`;
        const fileOrigIdx = file.charCodeAt(0) - 97;
        const isLight = (fileOrigIdx + rank) % 2 !== 0;

        const sq = document.createElement('div');
        sq.className = `square ${isLight ? 'light' : 'dark'}`;
        sq.dataset.square = squareId;

        // Border coordinates
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

      // Remove old piece element
      const existing = sq.querySelector('.piece-symbol, .piece-img');
      if (existing) existing.remove();

      // Highlights
      sq.classList.remove('selected', 'last-move');

      if (this.selectedSquare === squareId) {
        sq.classList.add('selected');
      }
      if (this.lastMoveSquares.includes(squareId)) {
        sq.classList.add('last-move');
      }

      if (piece) {
        const img = document.createElement('img');
        img.className = 'piece-img';
        img.src = `assets/pieces/${piece.color}_${piece.type}.png`;
        img.alt = `${piece.color === 'w' ? 'Biały' : 'Czarny'} ${PIECE_NAMES_PL[piece.type] || piece.type}`;
        img.draggable = false;
        sq.appendChild(img);
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
        const move = this.makeMove({ from, to, promotion: 'q' }, false);
        if (!move) {
          // If clicked another own piece, select that piece
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
    // Quick Side Toggle
    this.el.btnSideToggle.addEventListener('click', () => {
      this.showNewGameModal();
    });

    this.el.modePill.addEventListener('click', () => {
      this.el.settingsModal.classList.add('open');
    });

    // Main Actions
    this.el.btnReadPosition.addEventListener('click', () => this.readFullPosition());
    this.el.btnVoiceInput.addEventListener('click', () => this.toggleListening());
    this.el.btnPlayEngineMove.addEventListener('click', () => this.playEngineMove());
    this.el.btnReadHint.addEventListener('click', () => this.requestEngineHint());
    this.el.btnReadLastMove.addEventListener('click', () => this.repeatLastMove());

    // Aux Bar
    this.el.btnUndoMove.addEventListener('click', () => this.undoMove());
    this.el.btnNewGame.addEventListener('click', () => this.showNewGameModal());
    this.el.btnFlipBoard.addEventListener('click', () => this.toggleBoardFlip());
    this.el.btnCopyFen.addEventListener('click', () => {
      navigator.clipboard.writeText(this.game.fen()).then(() => {
        this.speak('Skopiowano pozycję do schowka.');
      });
    });

    // Manual Input
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

    // Board Accordion Toggle
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

    // Settings Inputs
    this.el.gameModeSelect.addEventListener('change', (e) => {
      this.settings.gameMode = e.target.value;
      this.saveSettings();
      this.updateModeLabels();
    });

    this.el.playerColorSelect.addEventListener('change', (e) => {
      const newColor = e.target.value;
      this.settings.playerColor = newColor;
      this.saveSettings();
      this.updateModeLabels();
    });

    this.el.autoEngineResponse.addEventListener('change', (e) => {
      this.settings.autoEngineResponse = e.target.checked;
      this.saveSettings();
    });

    this.el.autoListenAfterEngine.addEventListener('change', (e) => {
      this.settings.autoListenAfterEngine = e.target.checked;
      this.saveSettings();
    });

    this.el.soundAlert.addEventListener('change', (e) => {
      this.settings.soundAlert = e.target.checked;
      this.saveSettings();
    });

    this.el.autoFlipBoard.addEventListener('change', (e) => {
      this.settings.autoFlipBoard = e.target.checked;
      this.saveSettings();
    });

    if (this.el.boardThemeSelect) {
      this.el.boardThemeSelect.addEventListener('change', (e) => {
        this.settings.boardTheme = e.target.value;
        this.saveSettings();
        this.applyBoardTheme();
      });
    }

    this.el.engineDepth.addEventListener('input', (e) => {
      this.settings.engineDepth = parseInt(e.target.value, 10);
      this.el.engineDepthVal.textContent = this.settings.engineDepth;
      this.saveSettings();
    });

    this.el.speechRate.addEventListener('input', (e) => {
      this.settings.speechRate = parseFloat(e.target.value);
      this.el.speechRateVal.textContent = this.settings.speechRate.toFixed(2);
      this.saveSettings();
    });

    this.el.descriptionStyle.addEventListener('change', (e) => {
      this.settings.descriptionStyle = e.target.value;
      this.saveSettings();
    });

    this.el.autoSpeakEngineMove.addEventListener('change', (e) => {
      this.settings.autoSpeakEngine = e.target.checked;
      this.saveSettings();
    });

    // New Game Modal Buttons
    this.el.btnCloseNewGame.addEventListener('click', () => this.closeNewGameModal());
    this.el.newGameModal.addEventListener('click', (e) => {
      if (e.target === this.el.newGameModal) this.closeNewGameModal();
    });

    this.el.btnChooseWhite.addEventListener('click', () => {
      this.startNewGame('w');
    });

    this.el.btnChooseBlack.addEventListener('click', () => {
      this.startNewGame('b');
    });
  }
}

// Export class
export { MowoSzachyApp };

// Start app when DOM is ready (or immediately if already loaded)
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    if (!window.app) window.app = new MowoSzachyApp();
  });
} else {
  if (!window.app) window.app = new MowoSzachyApp();
}
