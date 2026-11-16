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
  botName: 'Janusz',           // Wake-word / bot name (np. "Janusz e4", "Janusz proponuję remis")
  autoEngineResponse: true,
  autoListenAfterEngine: false,
  soundAlert: true,
  autoFlipBoard: true,
  boardTheme: 'wood',          // 'wood' | 'zelda'
  boardBgOpacity: 50,          // 0 - 100 (50% domyślnie)
  pieceGlowWhiteSize: 5,       // 0 - 15 px (optymalna)
  pieceGlowWhiteOpacity: 85,   // 0 - 100 % (optymalna)
  pieceGlowBlackSize: 5,       // 0 - 15 px (optymalna)
  pieceGlowBlackOpacity: 85,   // 0 - 100 % (optymalna)
  engineElo: 1500,             // 800 - 2800 ELO (domyślnie 1500 Klubowy)
  engineDepth: 10,             // 2 - 18 półruchów
  speechRate: 1.0,
  descriptionStyle: 'detailed',
  autoSpeakEngine: true,
  voiceIndex: -1,
  settingsVersion: 4
};

class MowoSzachyApp {
  constructor() {
    this.game = new Chess();
    this.stockfish = null;
    this.stockfishReady = false;
    this.isEngineThinking = false;
    this.pendingEngineAction = null;
    this.engineTimer = null;
    this.engineOnReadyCallback = null;

    // Board & Game State
    this.selectedSquare = null;
    this.lastMoveSquares = []; // [from, to]
    this.isBoardFlipped = false;
    this.isFullscreenBoard = false;
    this.recognition = null;
    this.isListening = false;
    this.isListeningRequested = false;
    this.isTemporarilyPausedForTTS = false;
    this.isSpeaking = false;
    this.wakeWordArmedUntil = 0;
    this.customGameEnd = null; // 'draw_agreed' | 'resigned' | null
    this.latestEval = null;    // { fen, type: 'cp'|'mate', evalScore, cp, mate }
    this.restartListeningTimer = null;
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
        const parsed = JSON.parse(stored);
        if (parsed.settingsVersion !== 4) {
          if (parsed.boardBgOpacity === undefined) parsed.boardBgOpacity = 50;
          if (parsed.pieceGlowWhiteSize === undefined) parsed.pieceGlowWhiteSize = 5;
          if (parsed.pieceGlowWhiteOpacity === undefined) parsed.pieceGlowWhiteOpacity = 85;
          if (parsed.pieceGlowBlackSize === undefined) parsed.pieceGlowBlackSize = 5;
          if (parsed.pieceGlowBlackOpacity === undefined) parsed.pieceGlowBlackOpacity = 85;
          if (!parsed.botName) parsed.botName = 'Janusz';
          if (parsed.engineElo === undefined) parsed.engineElo = 1500;
          if (parsed.engineDepth === undefined) parsed.engineDepth = 10;
          parsed.settingsVersion = 4;
        }
        return { ...DEFAULT_SETTINGS, ...parsed };
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
    if (this.el.botNameInput) {
      this.el.botNameInput.value = this.settings.botName || 'Janusz';
    }
    this.el.autoEngineResponse.checked = this.settings.autoEngineResponse;
    this.el.autoListenAfterEngine.checked = this.settings.autoListenAfterEngine;
    this.el.soundAlert.checked = this.settings.soundAlert;
    this.el.autoFlipBoard.checked = this.settings.autoFlipBoard;
    if (this.el.boardThemeSelect) this.el.boardThemeSelect.value = this.settings.boardTheme || 'wood';
    
    const elo = this.settings.engineElo !== undefined ? this.settings.engineElo : 1500;
    if (this.el.engineElo) this.el.engineElo.value = elo;
    this.updateEloDisplay(elo);
    this.updateEloPresetButtons(elo);

    this.el.engineDepth.value = this.settings.engineDepth;
    this.el.engineDepthVal.textContent = this.settings.engineDepth;
    this.el.speechRate.value = this.settings.speechRate;
    this.el.speechRateVal.textContent = parseFloat(this.settings.speechRate).toFixed(2);
    this.el.descriptionStyle.value = this.settings.descriptionStyle;
    this.el.autoSpeakEngineMove.checked = this.settings.autoSpeakEngine;

    this.isBoardFlipped = this.settings.autoFlipBoard && (this.settings.playerColor === 'b');
    this.updateModeLabels();
    this.applyBoardTheme();

    if (this.el.boardOpacitySlider) {
      const opVal = this.settings.boardBgOpacity !== undefined ? this.settings.boardBgOpacity : 50;
      this.el.boardOpacitySlider.value = opVal;
      if (this.el.boardOpacityVal) {
        this.el.boardOpacityVal.textContent = `${opVal}%`;
      }
      this.applyBoardBgOpacity(opVal);
      this.updateOpacityPresetButtons(opVal);
    }

    this.syncPieceGlowToUI();
  }

  applyPieceGlow() {
    const whiteSize = this.settings.pieceGlowWhiteSize !== undefined ? this.settings.pieceGlowWhiteSize : 5;
    const whiteOpacity = this.settings.pieceGlowWhiteOpacity !== undefined ? this.settings.pieceGlowWhiteOpacity : 85;
    const blackSize = this.settings.pieceGlowBlackSize !== undefined ? this.settings.pieceGlowBlackSize : 5;
    const blackOpacity = this.settings.pieceGlowBlackOpacity !== undefined ? this.settings.pieceGlowBlackOpacity : 85;

    const root = document.documentElement;
    root.style.setProperty('--piece-glow-white-size', `${whiteSize}px`);
    root.style.setProperty('--piece-glow-white-opacity', (whiteOpacity / 100).toFixed(2));
    root.style.setProperty('--piece-glow-black-size', `${blackSize}px`);
    root.style.setProperty('--piece-glow-black-opacity', (blackOpacity / 100).toFixed(2));
  }

  syncPieceGlowToUI() {
    const whiteSize = this.settings.pieceGlowWhiteSize !== undefined ? this.settings.pieceGlowWhiteSize : 5;
    const whiteOpacity = this.settings.pieceGlowWhiteOpacity !== undefined ? this.settings.pieceGlowWhiteOpacity : 85;
    const blackSize = this.settings.pieceGlowBlackSize !== undefined ? this.settings.pieceGlowBlackSize : 5;
    const blackOpacity = this.settings.pieceGlowBlackOpacity !== undefined ? this.settings.pieceGlowBlackOpacity : 85;

    if (this.el.pieceGlowWhiteSize) {
      this.el.pieceGlowWhiteSize.value = whiteSize;
      if (this.el.pieceGlowWhiteSizeVal) this.el.pieceGlowWhiteSizeVal.textContent = `${whiteSize}px`;
    }
    if (this.el.pieceGlowWhiteOpacity) {
      this.el.pieceGlowWhiteOpacity.value = whiteOpacity;
      if (this.el.pieceGlowWhiteOpacityVal) this.el.pieceGlowWhiteOpacityVal.textContent = `${whiteOpacity}%`;
    }
    if (this.el.pieceGlowBlackSize) {
      this.el.pieceGlowBlackSize.value = blackSize;
      if (this.el.pieceGlowBlackSizeVal) this.el.pieceGlowBlackSizeVal.textContent = `${blackSize}px`;
    }
    if (this.el.pieceGlowBlackOpacity) {
      this.el.pieceGlowBlackOpacity.value = blackOpacity;
      if (this.el.pieceGlowBlackOpacityVal) this.el.pieceGlowBlackOpacityVal.textContent = `${blackOpacity}%`;
    }

    this.applyPieceGlow();
    this.updateGlowPresetButtons(whiteSize, whiteOpacity, blackSize, blackOpacity);
  }

  updateGlowPresetButtons(wSize, wOp, bSize, bOp) {
    const presetBtns = document.querySelectorAll('.btn-glow-preset');
    presetBtns.forEach(btn => {
      const p = btn.dataset.preset;
      let isActive = false;
      if (p === 'subtle' && wSize === 3 && wOp === 60 && bSize === 3 && bOp === 60) isActive = true;
      else if (p === 'default' && wSize === 5 && wOp === 85 && bSize === 5 && bOp === 85) isActive = true;
      else if (p === 'strong' && wSize === 8 && wOp === 100 && bSize === 8 && bOp === 100) isActive = true;
      else if (p === 'off' && wSize === 0 && wOp === 0 && bSize === 0 && bOp === 0) isActive = true;
      btn.classList.toggle('active', isActive);
    });
  }

  applyBoardTheme() {
    const theme = this.settings.boardTheme || 'wood';
    this.el.chessboard.classList.remove('theme-wood', 'theme-zelda', 'theme-blue', 'theme-green');
    this.el.chessboard.classList.add(`theme-${theme}`);
    const opVal = this.settings.boardBgOpacity !== undefined ? this.settings.boardBgOpacity : 50;
    this.applyBoardBgOpacity(opVal);
  }

  applyBoardBgOpacity(val) {
    const numericVal = parseInt(val, 10);
    const opacity = (numericVal / 100).toFixed(2);
    this.el.chessboard.style.setProperty('--board-bg-opacity', opacity);

    // Delineate squares smoothly if texture is dimmed/removed
    const fade = 1 - (numericVal / 100);
    const lightAlpha = (0.28 * fade).toFixed(3);
    const darkAlpha = (0.45 * fade).toFixed(3);
    this.el.chessboard.style.setProperty('--square-light-bg', `rgba(226, 214, 181, ${lightAlpha})`);
    this.el.chessboard.style.setProperty('--square-dark-bg', `rgba(15, 23, 42, ${darkAlpha})`);
  }

  updateOpacityPresetButtons(val) {
    const numericVal = parseInt(val, 10);
    const presetBtns = document.querySelectorAll('.btn-opacity-preset');
    presetBtns.forEach(btn => {
      if (parseInt(btn.dataset.val, 10) === numericVal) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  updateModeLabels() {
    if (this.settings.gameMode === 'vs-engine') {
      const sideName = this.settings.playerColor === 'w' ? 'Białe' : 'Czarne';
      const engineSide = this.settings.playerColor === 'w' ? 'Czarne' : 'Białe';
      const botName = this.settings.botName || 'Janusz';
      const elo = this.settings.engineElo || 1500;
      this.el.modeLabelText.textContent = `Gracz (${sideName}) vs ${botName} (${elo} ELO)`;
      if (this.el.modePill) {
        this.el.modePill.title = `Tryb: Gracz vs Silnik ${botName} (${elo} ELO, ${this.getEloCategory(elo)}, głębokość ${this.settings.engineDepth})`;
      }
      this.el.sideLabel.textContent = `Gram: ${sideName}`;
      this.el.sideIcon.textContent = this.settings.playerColor === 'w' ? '⚪' : '⚫';
    } else {
      this.el.modeLabelText.textContent = 'Tryb: Dwóch graczy / Analiza';
      if (this.el.modePill) {
        this.el.modePill.title = 'Tryb dwóch graczy lub swobodnej analizy pozycji';
      }
      this.el.sideLabel.textContent = 'Analiza';
      this.el.sideIcon.textContent = '🔍';
    }
  }

  // --- Bot Strength (ELO & Stockfish Skill Level) Helpers ---
  getEloCategory(elo) {
    if (elo < 1000) return 'Początkujący';
    if (elo < 1200) return 'Nowicjusz';
    if (elo < 1400) return 'Amator';
    if (elo < 1600) return 'Klubowy';
    if (elo < 1800) return 'Zaawansowany';
    if (elo < 2000) return 'Ekspert (I kat.)';
    if (elo < 2200) return 'Kandydat na mistrza';
    if (elo < 2400) return 'Mistrz krajowy';
    if (elo < 2600) return 'Mistrz międzynarodowy';
    return 'Arcymistrz (GM)';
  }

  getSkillLevelFromElo(elo) {
    // Stockfish Skill Level ranges from 0 to 20
    // Elo 800 maps to Skill Level 0, Elo 2800 maps to Skill Level 20
    const clamped = Math.max(800, Math.min(2800, elo));
    return Math.round((clamped - 800) / 100);
  }

  updateEloDisplay(elo) {
    if (this.el.engineEloVal) {
      this.el.engineEloVal.textContent = elo;
    }
    if (this.el.engineEloCategory) {
      this.el.engineEloCategory.textContent = this.getEloCategory(elo);
    }
    if (this.el.engineSkillVal) {
      this.el.engineSkillVal.textContent = this.getSkillLevelFromElo(elo);
    }
  }

  updateEloPresetButtons(elo) {
    if (!this.el.eloPresetButtons) return;
    this.el.eloPresetButtons.forEach(btn => {
      const btnElo = parseInt(btn.dataset.elo, 10);
      if (btnElo === elo) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  applyEngineStrength() {
    if (!this.stockfish) return;
    const elo = this.settings.engineElo || 1500;
    const skillLevel = this.getSkillLevelFromElo(elo);
    try {
      this.stockfish.postMessage(`setoption name Skill Level value ${skillLevel}`);
      this.stockfish.postMessage(`setoption name UCI_LimitStrength value ${elo < 2800 ? 'true' : 'false'}`);
      this.stockfish.postMessage(`setoption name UCI_Elo value ${elo}`);
      remoteLog('INFO', `Engine strength set to ELO ${elo} (Skill Level ${skillLevel}/20, Depth ${this.settings.engineDepth})`);
    } catch (e) {
      remoteLog('WARN', 'Failed to apply engine strength: ' + e.message);
    }
  }

  setEloAndDepth(elo, depth) {
    this.settings.engineElo = elo;
    if (depth !== undefined && !isNaN(depth)) {
      this.settings.engineDepth = depth;
    }
    this.syncSettingsToUI();
    this.applyEngineStrength();
    this.updateModeLabels();
    this.saveSettings();
    const cat = this.getEloCategory(elo);
    this.speak(`Ustawiono mój ranking na ${elo} ELO, poziom ${cat}, a głębokość myślenia na ${this.settings.engineDepth} półruchów.`);
  }

  isGameOver() {
    return Boolean(this.customGameEnd) || this.game.game_over();
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
      chessboardWrapper: document.getElementById('chessboardWrapper'),
      boardAccordion: document.getElementById('boardAccordion'),
      boardToggle: document.getElementById('boardToggle'),
      btnHeaderFullscreen: document.getElementById('btnHeaderFullscreen'),
      btnAuxFullscreen: document.getElementById('btnAuxFullscreen'),
      btnCloseFullscreen: document.getElementById('btnCloseFullscreen'),
      fsTurnMarker: document.getElementById('fsTurnMarker'),
      fsTurnLabel: document.getElementById('fsTurnLabel'),
      fsStatusBadge: document.getElementById('fsStatusBadge'),
      btnFsUndo: document.getElementById('btnFsUndo'),
      btnFsVoice: document.getElementById('btnFsVoice'),
      fsVoiceLabel: document.getElementById('fsVoiceLabel'),
      btnFsEngine: document.getElementById('btnFsEngine'),
      btnFsFlip: document.getElementById('btnFsFlip'),
      boardOpacitySlider: document.getElementById('boardOpacitySlider'),
      boardOpacityVal: document.getElementById('boardOpacityVal'),
      btnUndoMove: document.getElementById('btnUndoMove'),
      btnNewGame: document.getElementById('btnNewGame'),
      btnFlipBoard: document.getElementById('btnFlipBoard'),
      btnCopyFen: document.getElementById('btnCopyFen'),

      // Settings Modal
      settingsModal: document.getElementById('settingsModal'),
      btnCloseSettings: document.getElementById('btnCloseSettings'),
      gameModeSelect: document.getElementById('gameModeSelect'),
      playerColorSelect: document.getElementById('playerColorSelect'),
      botNameInput: document.getElementById('botNameInput'),
      autoEngineResponse: document.getElementById('autoEngineResponse'),
      autoListenAfterEngine: document.getElementById('autoListenAfterEngine'),
      soundAlert: document.getElementById('soundAlert'),
      autoFlipBoard: document.getElementById('autoFlipBoard'),
      boardThemeSelect: document.getElementById('boardThemeSelect'),
      engineElo: document.getElementById('engineElo'),
      engineEloVal: document.getElementById('engineEloVal'),
      engineEloBadge: document.getElementById('engineEloBadge'),
      engineEloCategory: document.getElementById('engineEloCategory'),
      engineSkillVal: document.getElementById('engineSkillVal'),
      eloPresetButtons: document.querySelectorAll('.btn-elo-preset'),
      engineDepth: document.getElementById('engineDepth'),
      engineDepthVal: document.getElementById('engineDepthVal'),
      engineDepthBadge: document.getElementById('engineDepthBadge'),
      voiceSelect: document.getElementById('voiceSelect'),
      speechRate: document.getElementById('speechRate'),
      speechRateVal: document.getElementById('speechRateVal'),
      descriptionStyle: document.getElementById('descriptionStyle'),
      autoSpeakEngineMove: document.getElementById('autoSpeakEngineMove'),

      // Piece Glow (temporary visual test)
      pieceGlowWhiteSize: document.getElementById('pieceGlowWhiteSize'),
      pieceGlowWhiteSizeVal: document.getElementById('pieceGlowWhiteSizeVal'),
      pieceGlowWhiteOpacity: document.getElementById('pieceGlowWhiteOpacity'),
      pieceGlowWhiteOpacityVal: document.getElementById('pieceGlowWhiteOpacityVal'),
      pieceGlowBlackSize: document.getElementById('pieceGlowBlackSize'),
      pieceGlowBlackSizeVal: document.getElementById('pieceGlowBlackSizeVal'),
      pieceGlowBlackOpacity: document.getElementById('pieceGlowBlackOpacity'),
      pieceGlowBlackOpacityVal: document.getElementById('pieceGlowBlackOpacityVal'),
      glowSettingsHeader: document.getElementById('glowSettingsHeader'),

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

    // Temporarily pause recognition to prevent the bot from hearing itself
    if (this.recognition && this.isListening) {
      this.isTemporarilyPausedForTTS = true;
      try { this.recognition.abort(); } catch (e) {}
    }
    this.isSpeaking = true;

    this.setDisplayText(text);
    this.setSpeechIndicator(true, 'Czytam na głos...');

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.currentVoice) utterance.voice = this.currentVoice;
    utterance.lang = this.currentVoice ? this.currentVoice.lang : 'pl-PL';
    utterance.rate = this.settings.speechRate;
    utterance.pitch = 1.0;

    const finishSpeech = () => {
      this.isSpeaking = false;
      this.setSpeechIndicator(false, 'Gotowy');
      if (onEnd) onEnd();
      if (this.isTemporarilyPausedForTTS) {
        this.isTemporarilyPausedForTTS = false;
        if (this.isListeningRequested && !this.isGameOver()) {
          setTimeout(() => {
            if (this.isListeningRequested && !this.isSpeaking && !this.isGameOver()) {
              this.startListening();
            }
          }, 200);
        }
      }
    };

    utterance.onend = finishSpeech;
    utterance.onerror = (err) => {
      remoteLog('WARN', 'Speech error: ' + (err.error || 'unknown'));
      finishSpeech();
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
    this.recognition.continuous = true;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.el.btnVoiceInput.classList.add('listening');
      const bot = this.settings.botName || 'Janusz';
      this.el.voiceBtnLabel.textContent = 'Słucham...';
      if (this.el.btnFsVoice) this.el.btnFsVoice.classList.add('listening');
      if (this.el.fsVoiceLabel) this.el.fsVoiceLabel.textContent = 'Słucham...';
      this.setSpeechIndicator(true, `Słucham (hasło: «${bot}»)...`);
    };

    this.recognition.onresult = (event) => {
      const resultsLen = event.results.length;
      const lastResult = event.results[resultsLen - 1];
      const transcript = lastResult[0].transcript.trim();
      remoteLog('INFO', 'Speech recognized: ' + transcript);
      this.handleVoiceCommand(transcript, false);
    };

    this.recognition.onerror = (event) => {
      remoteLog('WARN', 'Speech recognition error: ' + event.error);
      if (event.error === 'not-allowed') {
        this.isListeningRequested = false;
        this.stopListening();
        this.speak('Brak uprawnień do mikrofonu. Zezwól na dostęp w przeglądarce.');
      }
      // 'no-speech' or 'aborted' are normal while thinking, do not complain or stop
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.restartListeningTimer) clearTimeout(this.restartListeningTimer);

      // Continuous listening while player thinks: auto-restart if requested
      if (this.isListeningRequested && !this.isSpeaking && !this.isTemporarilyPausedForTTS && !this.isGameOver()) {
        this.restartListeningTimer = setTimeout(() => {
          if (this.isListeningRequested && !this.isSpeaking && !this.isTemporarilyPausedForTTS && !this.isGameOver()) {
            try {
              this.recognition.start();
            } catch (e) {
              if (e.name !== 'InvalidStateError') {
                remoteLog('WARN', 'Could not restart recognition: ' + e.message);
              }
            }
          }
        }, 150);
        return;
      }

      this.el.btnVoiceInput.classList.remove('listening');
      this.el.voiceBtnLabel.textContent = 'Powiedz ruch';
      if (this.el.btnFsVoice) this.el.btnFsVoice.classList.remove('listening');
      if (this.el.fsVoiceLabel) this.el.fsVoiceLabel.textContent = 'Głos';
      this.setSpeechIndicator(false, 'Gotowy');
    };
  }

  startListening() {
    if (!this.recognition) return;
    this.isListeningRequested = true;
    try {
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      if (this.isListening) {
        try { this.recognition.abort(); } catch (e) {}
        this.isListening = false;
      }
      this.recognition.start();
    } catch (e) {
      if (e.name !== 'InvalidStateError') {
        remoteLog('WARN', 'Could not start recognition: ' + e.message);
      }
    }
  }

  stopListening() {
    this.isListeningRequested = false;
    if (this.restartListeningTimer) clearTimeout(this.restartListeningTimer);
    if (!this.recognition) return;
    try {
      this.recognition.stop();
    } catch (e) {}
    this.isListening = false;
    this.el.btnVoiceInput.classList.remove('listening');
    this.el.voiceBtnLabel.textContent = 'Powiedz ruch';
    if (this.el.btnFsVoice) this.el.btnFsVoice.classList.remove('listening');
    if (this.el.fsVoiceLabel) this.el.fsVoiceLabel.textContent = 'Głos';
    this.setSpeechIndicator(false, 'Gotowy');
  }

  toggleListening() {
    if (!this.recognition) return;
    if (this.isListeningRequested || this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  // --- Polish Wake-Word & Bot Name Extractor ---
  extractBotCommand(rawText, botName = 'Janusz') {
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
    text = text.replace(/\b(skoczek|skoczka|skoczkiem|koń|konia|koniem|kucyk|kucyka|kucykiem)\b/g, 'N');
    text = text.replace(/\b(goniec|gońca|gońcem|laufer|laufra|laufrem)\b/g, 'B');
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

  handleVoiceCommand(raw, bypassWakeWord = false) {
    if (!raw || !raw.trim()) return;

    const botName = this.settings.botName || 'Janusz';
    let commandToProcess = raw.trim();

    if (!bypassWakeWord) {
      const { hasBotName, command } = this.extractBotCommand(raw, botName);

      // Check if wake word matched
      if (!hasBotName) {
        // If bot name was called within the last 10 seconds, allow followup without repeating the name
        if (Date.now() < this.wakeWordArmedUntil) {
          commandToProcess = raw.trim();
          this.wakeWordArmedUntil = 0;
        } else {
          // Player is thinking aloud! Keep listening indefinitely, don't execute or complain.
          remoteLog('INFO', `Ignored thinking aloud (no wake word "${botName}"): "${raw}"`);
          this.setDisplayText(`(Myślisz na głos: "${raw}" — powiedz np. «${botName} e4» lub «${botName} proponuję remis»)`);
          this.setSpeechIndicator(true, `Słucham (hasło: «${botName}»)...`);
          return;
        }
      } else {
        // Has bot name
        if (!command) {
          // Player just called the bot's name (e.g. "Janusz", "Januszu!")
          this.wakeWordArmedUntil = Date.now() + 10000;
          this.speak('Słucham! Jaki ruch?', false, () => {
            if (this.isListeningRequested && !this.isGameOver()) {
              setTimeout(() => this.startListening(), 250);
            }
          });
          return;
        }
        commandToProcess = command;
      }
    }

    const rawLower = commandToProcess.toLowerCase().trim();

    // 1. Spoken Application Commands
    // Draw Proposal ("Janusz proponuję remis" / "Janusz zróbmy remis")
    const drawRegex = /\b(remis|remisu|remisem|zróbmy remis|proponuj[eę]\s+remis|oferuj[eę]\s+remis|zgoda na remis|propozycja remisu)\b/i;
    if (drawRegex.test(rawLower)) {
      this.handleDrawProposal();
      return;
    }

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
    if (
      rawLower.includes('podpowiedz') ||
      rawLower.includes('podpowiedź') ||
      rawLower.includes('jaki ruch') ||
      rawLower.includes('co zagrać') ||
      rawLower.includes('co mam zagrać') ||
      rawLower.includes('co teraz') ||
      rawLower.includes('najlepszy ruch') ||
      rawLower.includes('pomóż') ||
      rawLower.includes('co radzisz')
    ) {
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
    if (rawLower.includes('motyw błękit') || rawLower.includes('motyw niebieski') || rawLower.includes('motyw blue')) {
      this.settings.boardTheme = 'blue';
      if (this.el.boardThemeSelect) this.el.boardThemeSelect.value = 'blue';
      this.saveSettings();
      this.applyBoardTheme();
      this.speak('Zmieniono motyw szachownicy na błękitny marmur.');
      return;
    }
    if (rawLower.includes('motyw zieleń') || rawLower.includes('motyw zielony') || rawLower.includes('motyw green')) {
      this.settings.boardTheme = 'green';
      if (this.el.boardThemeSelect) this.el.boardThemeSelect.value = 'green';
      this.saveSettings();
      this.applyBoardTheme();
      this.speak('Zmieniono motyw szachownicy na szmaragdowy leśny.');
      return;
    }

    // Pytanie o poziom / ranking / ELO
    if (
      rawLower.includes('jaki masz poziom') ||
      rawLower.includes('jaki poziom') ||
      rawLower.includes('jakie masz elo') ||
      rawLower.includes('jaki masz ranking') ||
      rawLower.includes('jaki ranking') ||
      rawLower.includes('jakie elo')
    ) {
      const elo = this.settings.engineElo || 1500;
      const cat = this.getEloCategory(elo);
      const depth = this.settings.engineDepth || 10;
      this.speak(`Mój aktualny ranking to ${elo} ELO, poziom ${cat}, a głębokość myślenia to ${depth} półruchów.`);
      return;
    }

    // Słowne ustawienie trudności
    if (rawLower.includes('poziom początkujący')) {
      this.setEloAndDepth(800, 4);
      return;
    }
    if (rawLower.includes('poziom amator') || rawLower.includes('poziom nowicjusz')) {
      this.setEloAndDepth(1200, 6);
      return;
    }
    if (rawLower.includes('poziom klubowy') || rawLower.includes('poziom średni')) {
      this.setEloAndDepth(1500, 10);
      return;
    }
    if (rawLower.includes('poziom zaawansowany') || rawLower.includes('poziom ekspert')) {
      this.setEloAndDepth(1800, 12);
      return;
    }
    if (rawLower.includes('poziom mistrz') && !rawLower.includes('arcymistrz')) {
      this.setEloAndDepth(2200, 14);
      return;
    }
    if (rawLower.includes('poziom arcymistrz') || rawLower.includes('poziom maksymalny') || rawLower.includes('poziom maks')) {
      this.setEloAndDepth(2800, 18);
      return;
    }

    // Ustawienie ELO liczbowo (np. "ustaw elo 1600", "poziom 1400", "ranking 2000")
    const setEloMatch = rawLower.match(/(?:ustaw|zmień)?\s*(?:poziom|ranking|elo)\s*(?:na)?\s*(\d{3,4})/i);
    if (setEloMatch) {
      const targetElo = parseInt(setEloMatch[1], 10);
      if (targetElo >= 800 && targetElo <= 2800) {
        this.setEloAndDepth(targetElo);
        return;
      }
    }
    if (rawLower.includes('graj') || rawLower.includes('ruch silnika') || rawLower.includes('twój ruch')) {
      this.playEngineMove();
      return;
    }

    // 2. Parse as a chess move
    const clean = this.normalizePolishSpeech(commandToProcess);
    remoteLog('INFO', `Speech parsed: "${raw}" -> "${commandToProcess}" -> "${clean}"`);

    const legalMoves = this.game.moves({ verbose: true });
    if (legalMoves.length === 0 || this.isGameOver()) {
      this.speak('Partia jest już zakończona.');
      return;
    }

    let matchedMove = this.findMatchingMove(clean, legalMoves);

    if (matchedMove) {
      // Turn action received: end active listening session for this turn
      this.isListeningRequested = false;
      const res = this.makeMove(matchedMove, false);
      if (!res) {
        this.speak('Niepoprawny ruch. Spróbuj jeszcze raz.', false, () => {
          if (!this.isGameOver()) {
            this.isListeningRequested = true;
            setTimeout(() => this.startListening(), 250);
          }
        });
      }
    } else {
      this.speak(`Rozpoznano: "${commandToProcess}". To nie jest poprawny ruch w tej pozycji. Spróbuj jeszcze raz.`, false, () => {
        if (!this.isGameOver()) {
          this.isListeningRequested = true;
          setTimeout(() => this.startListening(), 250);
        }
      });
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
      this.applyEngineStrength();
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
      this.applyEngineStrength();
      this.el.engineStatus.querySelector('.status-dot').className = 'status-dot';
      this.el.engineStatus.querySelector('.status-text').textContent = 'Stockfish';
      if (this.el.engineStatus) {
        this.el.engineStatus.title = `Stan silnika Stockfish (${this.settings.engineElo || 1500} ELO)`;
      }

      if (typeof this.engineOnReadyCallback === 'function') {
        const cb = this.engineOnReadyCallback;
        this.engineOnReadyCallback = null;
        cb();
      }

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
        this.latestEval = {
          fen: this.game.fen(),
          type: 'cp',
          evalScore: evalScore,
          cp: cp,
          turn: this.game.turn()
        };
        this.el.engineEvalText.textContent = `Ocena: ${evalScore > 0 ? '+' : ''}${evalScore.toFixed(1)}`;
      } else if (mateMatch) {
        const mateVal = parseInt(mateMatch[1], 10);
        const whiteMate = (this.game.turn() === 'w' ? mateVal : -mateVal);
        this.latestEval = {
          fen: this.game.fen(),
          type: 'mate',
          mate: whiteMate,
          turn: this.game.turn()
        };
        this.el.engineEvalText.textContent = `Mat w ${mateVal}`;
      }
    }

    // Best move received
    if (line.startsWith('bestmove')) {
      this.isEngineThinking = false;
      this.setSpeechIndicator(false, 'Gotowy');

      const parts = line.split(' ');
      const moveStr = parts[1];
      const action = this.pendingEngineAction;
      this.pendingEngineAction = null;

      const actionType = typeof action === 'string' ? action : (action ? action.type : null);
      const actionFen = typeof action === 'object' && action ? action.fen : null;

      // Jeśli pozycja zmieniła się w międzyczasie, ignoruj nieaktualny wynik
      if (actionFen && actionFen !== this.game.fen()) {
        remoteLog('INFO', `Ignored outdated bestmove ${moveStr} for old FEN`);
        return;
      }

      if (actionType === 'draw_offer') {
        this.decideEngineDrawProposal();
        return;
      }

      if (actionType === 'play') {
        if (moveStr && moveStr !== '(none)') {
          const from = moveStr.substring(0, 2);
          const to = moveStr.substring(2, 4);
          const promotion = moveStr.length > 4 ? moveStr[4].toLowerCase() : undefined;
          this.makeMove({ from, to, promotion }, true);
        }
      } else if (actionType === 'hint') {
        if (moveStr && moveStr !== '(none)') {
          const from = moveStr.substring(0, 2);
          const to = moveStr.substring(2, 4);
          const promotion = moveStr.length > 4 ? moveStr[4].toLowerCase() : undefined;

          // Znajdź dokładny legalny ruch w chess.js dla pełnego obiektu ruchu (san, piece, flags)
          const legalMoves = this.game.moves({ verbose: true });
          const matchedMove = legalMoves.find(m =>
            m.from === from &&
            m.to === to &&
            (!promotion || m.promotion === promotion)
          );

          let plDesc = '';
          let moveSan = '';
          if (matchedMove) {
            plDesc = this.formatMoveToPolish(matchedMove);
            moveSan = matchedMove.san;
          } else {
            const pieceOnFrom = this.game.get(from);
            plDesc = this.formatMoveToPolish({
              from,
              to,
              piece: pieceOnFrom ? pieceOnFrom.type : 'p',
              promotion
            });
            moveSan = `${from}-${to}`;
          }

          let hintPrefix = 'Podpowiedź dla Ciebie: najlepszy ruch to';
          if (this.settings.gameMode !== 'vs-engine') {
            const colorPl = this.game.turn() === 'w' ? 'Białych' : 'Czarnych';
            hintPrefix = `Podpowiedź dla ${colorPl}: najlepszy ruch to`;
          }

          const speechText = `${hintPrefix} ${plDesc}.`;
          this.el.engineEvalText.textContent = `Podpowiedź: ${moveSan}`;
          if (this.el.speechDisplayText) {
            this.el.speechDisplayText.textContent = `💡 ${hintPrefix} ${plDesc} (${moveSan})`;
          }

          // Podświetl pole początkowe bierki na szachownicy
          this.selectedSquare = from;
          this.renderBoardPieces();

          this.speak(speechText, false, () => {
            if (this.settings.autoListenAfterEngine && !this.isGameOver()) {
              setTimeout(() => this.startListening(), 250);
            }
          });
        } else {
          this.speak('Nie znalazłem dobrego ruchu w tej pozycji.');
        }
      }
    }
  }

  // --- Draw Proposal Handling ("Janusz proponuję remis") ---
  handleDrawProposal() {
    if (this.isGameOver()) {
      this.speak('Partia jest już zakończona.');
      return;
    }

    if (this.settings.gameMode !== 'vs-engine') {
      this.acceptDraw('Partia zakończona remisem po uzgodnieniu stron.');
      return;
    }

    const botName = this.settings.botName || 'Janusz';

    // If we already have recent evaluation for this exact position, decide immediately
    if (this.latestEval && this.latestEval.fen === this.game.fen()) {
      this.decideEngineDrawProposal();
      return;
    }

    // Otherwise, request quick evaluation from Stockfish
    if (this.stockfishReady) {
      this.setDisplayText(`${botName}: Zastanawiam się nad propozycją remisu...`);
      this.setSpeechIndicator(true, 'Analizuję remis...');

      this.stopAndQueueEngine(() => {
        const currentFen = this.game.fen();
        this.isEngineThinking = true;
        this.pendingEngineAction = { type: 'draw_offer', fen: currentFen };
        this.stockfish.postMessage(`position fen ${currentFen}`);
        this.stockfish.postMessage('go depth 8');
      });

      // Safety timeout in case worker doesn't respond promptly
      setTimeout(() => {
        if (this.pendingEngineAction && this.pendingEngineAction.type === 'draw_offer') {
          this.pendingEngineAction = null;
          this.decideEngineDrawProposal();
        }
      }, 700);
    } else {
      this.decideEngineDrawProposal();
    }
  }

  getEngineAdvantagePawns() {
    const engineColor = this.settings.playerColor === 'w' ? 'b' : 'w';

    if (this.latestEval && this.latestEval.fen === this.game.fen()) {
      if (this.latestEval.type === 'mate') {
        const isEngineMating = (engineColor === 'w' && this.latestEval.mate > 0) ||
                               (engineColor === 'b' && this.latestEval.mate < 0);
        return isEngineMating ? 999 : -999;
      }
      if (this.latestEval.type === 'cp') {
        return engineColor === 'w' ? this.latestEval.evalScore : -this.latestEval.evalScore;
      }
    }

    return this.calculateMaterialAdvantage(engineColor);
  }

  calculateMaterialAdvantage(color) {
    const weights = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };
    let whiteMat = 0;
    let blackMat = 0;
    const board = this.game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          const val = weights[piece.type] || 0;
          if (piece.color === 'w') whiteMat += val;
          else blackMat += val;
        }
      }
    }
    return color === 'w' ? (whiteMat - blackMat) : (blackMat - whiteMat);
  }

  decideEngineDrawProposal() {
    const botName = this.settings.botName || 'Janusz';
    const advantage = this.getEngineAdvantagePawns();
    remoteLog('INFO', `Draw evaluation for ${botName}: engine advantage = ${advantage.toFixed(2)} pawns`);

    // Significant advantage threshold: > 1.3 pawns (or forced mate)
    const SIGNIFICANT_ADVANTAGE_THRESHOLD = 1.3;

    if (advantage > SIGNIFICANT_ADVANTAGE_THRESHOLD) {
      // Reject draw
      let reason = 'Moja pozycja jest zbyt dobra, gramy dalej! Twój ruch.';
      if (advantage >= 3.0) {
        reason = 'Mam zbyt dużą przewagę, nie mogę przyjąć remisu! Twój ruch.';
      }

      const speech = `Odrzucam propozycję remisu. ${reason}`;
      this.setDisplayText(`${botName}: ${speech}`);
      this.speak(speech, false, () => {
        if (this.settings.autoListenAfterEngine && !this.isGameOver() && this.game.turn() === this.settings.playerColor) {
          this.isListeningRequested = true;
          setTimeout(() => this.startListening(), 250);
        }
      });
    } else {
      // Accept draw
      let comment = 'Dobra partia!';
      if (advantage < -1.0) {
        comment = 'Miałeś lepszą pozycję, chętnie przyjmuję remis!';
      } else {
        comment = 'Zgadzam się na remis, wyrównana walka! Dobra partia.';
      }
      this.acceptDraw(`${botName}: ${comment}`);
    }
  }

  acceptDraw(message) {
    this.customGameEnd = 'draw_agreed';
    if (this.engineTimer) clearTimeout(this.engineTimer);
    this.isEngineThinking = false;
    this.pendingEngineAction = null;
    this.stopListening();

    this.updateUI();
    this.el.gameStatusText.textContent = ' — Remis (zgoda stron)';
    this.setDisplayText(message);
    this.speak('Zgadzam się na remis! Partia zakończona remisem.', true);
  }

  stopAndQueueEngine(callback) {
    if (!this.stockfishReady) return;
    if (this.isEngineThinking) {
      this.engineOnReadyCallback = callback;
      this.stockfish.postMessage('stop');
      this.stockfish.postMessage('isready');
    } else {
      callback();
    }
  }

  playEngineMove() {
    if (this.isGameOver()) {
      this.handleGameOver();
      return;
    }
    if (!this.stockfishReady) return;

    this.stopAndQueueEngine(() => {
      const currentFen = this.game.fen();
      this.isEngineThinking = true;
      this.pendingEngineAction = { type: 'play', fen: currentFen };
      this.setSpeechIndicator(true, 'Silnik myśli...');
      this.el.engineEvalText.textContent = 'Ocena: obliczanie...';

      this.applyEngineStrength();
      this.stockfish.postMessage(`position fen ${currentFen}`);
      this.stockfish.postMessage(`go depth ${this.settings.engineDepth}`);
    });
  }

  requestEngineHint() {
    if (this.isGameOver()) {
      this.speak('Partia jest już zakończona.');
      return;
    }
    if (!this.stockfishReady) {
      this.speak('Silnik szachowy nie jest jeszcze gotowy.');
      return;
    }

    if (this.settings.gameMode === 'vs-engine') {
      if (this.game.turn() !== this.settings.playerColor) {
        this.speak('Teraz ruch silnika. Poczekaj na ruch przeciwnika.');
        if (!this.isEngineThinking) {
          this.playEngineMove();
        }
        return;
      }
    }

    this.stopAndQueueEngine(() => {
      const currentFen = this.game.fen();
      this.isEngineThinking = true;
      this.pendingEngineAction = { type: 'hint', fen: currentFen };
      this.setSpeechIndicator(true, 'Szukam najlepszego ruchu...');
      this.el.engineEvalText.textContent = 'Szukam podpowiedzi...';

      this.stockfish.postMessage(`position fen ${currentFen}`);
      this.stockfish.postMessage(`go depth ${this.settings.engineDepth}`);
    });
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
    if (this.isGameOver()) {
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
          if (this.settings.autoListenAfterEngine && !this.isGameOver()) {
            setTimeout(() => this.startListening(), 250);
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
      this.isEngineThinking = true;
      this.pendingEngineAction = null;
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
    if (this.isGameOver()) {
      this.speak('Partia jest już zakończona.');
      return;
    }
    this.customGameEnd = 'resigned';
    this.stopListening();
    this.updateUI();
    const speech = 'Poddajesz partię. Silnik wygrywa. Chcesz zagrać jeszcze raz? Kliknij nowa partia.';
    this.el.gameStatusText.textContent = ' — Poddanie partii';
    this.speak(speech, true);
  }

  // --- Smart Undo ---
  undoMove() {
    if (this.customGameEnd) {
      this.customGameEnd = null;
      this.updateUI();
      this.speak('Cofnięto zakończenie partii. Wznawiamy grę.');
      return;
    }

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
    this.customGameEnd = null;
    this.latestEval = null;

    if (this.settings.autoFlipBoard) {
      this.isBoardFlipped = (color === 'b');
    }

    if (this.stockfishReady) {
      this.stockfish.postMessage('ucinewgame');
      this.applyEngineStrength();
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

  // --- Fullscreen Chessboard Mode ---
  enterFullscreenBoard() {
    this.isFullscreenBoard = true;
    if (this.el.chessboardWrapper) {
      this.el.chessboardWrapper.classList.add('fullscreen-active');
    }
    if (this.el.boardAccordion) {
      this.el.boardAccordion.classList.add('expanded');
    }
    document.body.style.overflow = 'hidden';

    try {
      const el = this.el.chessboardWrapper || document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      }
    } catch (e) {}

    this.updateFullscreenUI();
  }

  exitFullscreenBoard(callNativeExit = true) {
    this.isFullscreenBoard = false;
    if (this.el.chessboardWrapper) {
      this.el.chessboardWrapper.classList.remove('fullscreen-active');
    }
    document.body.style.overflow = '';

    if (callNativeExit && document.fullscreenElement) {
      try {
        document.exitFullscreen().catch(() => {});
      } catch (e) {}
    }
  }

  toggleFullscreenBoard() {
    if (this.isFullscreenBoard) {
      this.exitFullscreenBoard();
    } else {
      this.enterFullscreenBoard();
    }
  }

  updateFullscreenUI() {
    if (!this.el.fsTurnMarker || !this.el.fsTurnLabel) return;
    const isWhite = this.game.turn() === 'w';
    this.el.fsTurnMarker.className = `piece-marker ${isWhite ? 'white' : 'black'}`;
    this.el.fsTurnLabel.textContent = isWhite ? 'Ruch Białych' : 'Ruch Czarnych';

    if (this.el.fsStatusBadge) {
      if (this.customGameEnd === 'draw_agreed' || this.game.in_draw()) {
        this.el.fsStatusBadge.textContent = ' — REMIS';
      } else if (this.customGameEnd === 'resigned') {
        this.el.fsStatusBadge.textContent = ' — PODDANIE';
      } else if (this.game.in_checkmate()) {
        this.el.fsStatusBadge.textContent = ' — MAT!';
      } else if (this.game.in_check()) {
        this.el.fsStatusBadge.textContent = ' — SZACH';
      } else {
        this.el.fsStatusBadge.textContent = '';
      }
    }

    if (this.el.btnFsVoice && this.el.fsVoiceLabel) {
      if (this.isListening) {
        this.el.btnFsVoice.classList.add('listening');
        this.el.fsVoiceLabel.textContent = 'Słucham...';
      } else {
        this.el.btnFsVoice.classList.remove('listening');
        this.el.fsVoiceLabel.textContent = 'Głos';
      }
    }
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
        img.className = `piece-img piece-${piece.color === 'w' ? 'white' : 'black'}`;
        img.dataset.pieceColor = piece.color;
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

    if (this.customGameEnd === 'draw_agreed') {
      this.el.gameStatusText.textContent = ' — REMIS (ZGODA STRON)';
    } else if (this.customGameEnd === 'resigned') {
      this.el.gameStatusText.textContent = ' — PODDANIE PARTII';
    } else if (this.game.in_checkmate()) {
      this.el.gameStatusText.textContent = ' — MAT!';
    } else if (this.game.in_check()) {
      this.el.gameStatusText.textContent = ' — SZACH';
    } else if (this.game.in_draw()) {
      this.el.gameStatusText.textContent = ' — REMIS';
    } else {
      this.el.gameStatusText.textContent = '';
    }

    this.renderBoardPieces();
    this.updateFullscreenUI();
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
    if (this.el.btnAuxFullscreen) {
      this.el.btnAuxFullscreen.addEventListener('click', () => this.enterFullscreenBoard());
    }
    this.el.btnCopyFen.addEventListener('click', () => {
      navigator.clipboard.writeText(this.game.fen()).then(() => {
        this.speak('Skopiowano pozycję do schowka.');
      });
    });

    // Fullscreen Board Toggle Buttons
    if (this.el.btnHeaderFullscreen) {
      this.el.btnHeaderFullscreen.addEventListener('click', (e) => {
        e.stopPropagation();
        this.enterFullscreenBoard();
      });
    }
    if (this.el.btnCloseFullscreen) {
      this.el.btnCloseFullscreen.addEventListener('click', () => this.exitFullscreenBoard());
    }

    // Fullscreen Bottom Controls
    if (this.el.btnFsUndo) {
      this.el.btnFsUndo.addEventListener('click', () => this.undoMove());
    }
    if (this.el.btnFsVoice) {
      this.el.btnFsVoice.addEventListener('click', () => this.toggleListening());
    }
    if (this.el.btnFsEngine) {
      this.el.btnFsEngine.addEventListener('click', () => this.playEngineMove());
    }
    if (this.el.btnFsFlip) {
      this.el.btnFsFlip.addEventListener('click', () => this.toggleBoardFlip());
    }

    // Keyboard & Native Fullscreen Change Handlers
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isFullscreenBoard) {
        this.exitFullscreenBoard();
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && this.isFullscreenBoard) {
        this.exitFullscreenBoard(false);
      }
    });

    // Manual Input
    const executeManualMove = () => {
      const val = this.el.manualMoveInput.value.trim();
      if (!val) return;
      // Allow both direct move ("e4") and wake-word addressed move ("Janusz e4")
      const { command } = this.extractBotCommand(val, this.settings.botName);
      const inputToUse = command || val;
      this.handleVoiceCommand(inputToUse, true);
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

    // Board Opacity Slider & Presets (Temporary test feature)
    if (this.el.boardOpacitySlider) {
      this.el.boardOpacitySlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.settings.boardBgOpacity = val;
        if (this.el.boardOpacityVal) {
          this.el.boardOpacityVal.textContent = `${val}%`;
        }
        this.applyBoardBgOpacity(val);
        this.updateOpacityPresetButtons(val);
      });

      this.el.boardOpacitySlider.addEventListener('change', () => {
        this.saveSettings();
      });

      const presetBtns = document.querySelectorAll('.btn-opacity-preset');
      presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const val = parseInt(btn.dataset.val, 10);
          this.settings.boardBgOpacity = val;
          this.el.boardOpacitySlider.value = val;
          if (this.el.boardOpacityVal) {
            this.el.boardOpacityVal.textContent = `${val}%`;
          }
          this.applyBoardBgOpacity(val);
          this.updateOpacityPresetButtons(val);
          this.saveSettings();
        });
      });
    }

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

    if (this.el.botNameInput) {
      this.el.botNameInput.addEventListener('input', (e) => {
        this.settings.botName = e.target.value.trim() || 'Janusz';
        this.updateModeLabels();
      });
      this.el.botNameInput.addEventListener('change', () => {
        this.saveSettings();
      });
    }

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

    // Piece Glow Sliders (temporary testing controls)
    if (this.el.pieceGlowWhiteSize) {
      this.el.pieceGlowWhiteSize.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.settings.pieceGlowWhiteSize = val;
        if (this.el.pieceGlowWhiteSizeVal) this.el.pieceGlowWhiteSizeVal.textContent = `${val}px`;
        this.applyPieceGlow();
        this.updateGlowPresetButtons(this.settings.pieceGlowWhiteSize, this.settings.pieceGlowWhiteOpacity, this.settings.pieceGlowBlackSize, this.settings.pieceGlowBlackOpacity);
      });
      this.el.pieceGlowWhiteSize.addEventListener('change', () => this.saveSettings());
    }

    if (this.el.pieceGlowWhiteOpacity) {
      this.el.pieceGlowWhiteOpacity.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.settings.pieceGlowWhiteOpacity = val;
        if (this.el.pieceGlowWhiteOpacityVal) this.el.pieceGlowWhiteOpacityVal.textContent = `${val}%`;
        this.applyPieceGlow();
        this.updateGlowPresetButtons(this.settings.pieceGlowWhiteSize, this.settings.pieceGlowWhiteOpacity, this.settings.pieceGlowBlackSize, this.settings.pieceGlowBlackOpacity);
      });
      this.el.pieceGlowWhiteOpacity.addEventListener('change', () => this.saveSettings());
    }

    if (this.el.pieceGlowBlackSize) {
      this.el.pieceGlowBlackSize.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.settings.pieceGlowBlackSize = val;
        if (this.el.pieceGlowBlackSizeVal) this.el.pieceGlowBlackSizeVal.textContent = `${val}px`;
        this.applyPieceGlow();
        this.updateGlowPresetButtons(this.settings.pieceGlowWhiteSize, this.settings.pieceGlowWhiteOpacity, this.settings.pieceGlowBlackSize, this.settings.pieceGlowBlackOpacity);
      });
      this.el.pieceGlowBlackSize.addEventListener('change', () => this.saveSettings());
    }

    if (this.el.pieceGlowBlackOpacity) {
      this.el.pieceGlowBlackOpacity.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.settings.pieceGlowBlackOpacity = val;
        if (this.el.pieceGlowBlackOpacityVal) this.el.pieceGlowBlackOpacityVal.textContent = `${val}%`;
        this.applyPieceGlow();
        this.updateGlowPresetButtons(this.settings.pieceGlowWhiteSize, this.settings.pieceGlowWhiteOpacity, this.settings.pieceGlowBlackSize, this.settings.pieceGlowBlackOpacity);
      });
      this.el.pieceGlowBlackOpacity.addEventListener('change', () => this.saveSettings());
    }

    // Piece Glow Preset Buttons
    const glowPresetBtns = document.querySelectorAll('.btn-glow-preset');
    glowPresetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        if (preset === 'subtle') {
          this.settings.pieceGlowWhiteSize = 3;
          this.settings.pieceGlowWhiteOpacity = 60;
          this.settings.pieceGlowBlackSize = 3;
          this.settings.pieceGlowBlackOpacity = 60;
        } else if (preset === 'default') {
          this.settings.pieceGlowWhiteSize = 5;
          this.settings.pieceGlowWhiteOpacity = 85;
          this.settings.pieceGlowBlackSize = 5;
          this.settings.pieceGlowBlackOpacity = 85;
        } else if (preset === 'strong') {
          this.settings.pieceGlowWhiteSize = 8;
          this.settings.pieceGlowWhiteOpacity = 100;
          this.settings.pieceGlowBlackSize = 8;
          this.settings.pieceGlowBlackOpacity = 100;
        } else if (preset === 'off') {
          this.settings.pieceGlowWhiteSize = 0;
          this.settings.pieceGlowWhiteOpacity = 0;
          this.settings.pieceGlowBlackSize = 0;
          this.settings.pieceGlowBlackOpacity = 0;
        }
        this.syncPieceGlowToUI();
        this.saveSettings();
      });
    });

    // Stockfish Engine ELO & Depth Controls
    if (this.el.engineElo) {
      this.el.engineElo.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.settings.engineElo = val;
        this.updateEloDisplay(val);
        this.updateEloPresetButtons(val);
        this.updateModeLabels();
        this.applyEngineStrength();
        this.saveSettings();
      });
    }

    if (this.el.eloPresetButtons) {
      this.el.eloPresetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const elo = parseInt(btn.dataset.elo, 10);
          const depth = parseInt(btn.dataset.depth, 10);
          this.settings.engineElo = elo;
          if (this.el.engineElo) this.el.engineElo.value = elo;
          this.updateEloDisplay(elo);
          this.updateEloPresetButtons(elo);

          if (!isNaN(depth)) {
            this.settings.engineDepth = depth;
            if (this.el.engineDepth) this.el.engineDepth.value = depth;
            if (this.el.engineDepthVal) this.el.engineDepthVal.textContent = depth;
          }

          this.updateModeLabels();
          this.applyEngineStrength();
          this.saveSettings();
        });
      });
    }

    if (this.el.engineDepth) {
      this.el.engineDepth.addEventListener('input', (e) => {
        this.settings.engineDepth = parseInt(e.target.value, 10);
        this.el.engineDepthVal.textContent = this.settings.engineDepth;
        this.updateModeLabels();
        this.applyEngineStrength();
        this.saveSettings();
      });
    }

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
