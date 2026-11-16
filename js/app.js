/**
 * js/app.js
 * MowoSzachy - Główny kontroler aplikacji
 * Koordynuje silnik reguł szachowych (chess.js), syntezę i rozpoznawanie mowy,
 * silnik Stockfish UCI oraz renderowanie szachownicy i interfejsu mobilnego.
 */

import { Chess } from './vendor/chess.min.js';
import {
  PIECE_NAMES_PL,
  DEFAULT_SETTINGS,
  getEloCategory,
  getSkillLevelFromElo
} from './modules/constants.js';
import { remoteLog, initGlobalErrorLogging } from './modules/logger.js';
import { SettingsManager } from './modules/settings.js';
import { AudioManager } from './modules/audio.js';
import { SpeechSynthesizer } from './modules/speech-synthesis.js';
import { SpeechRecognizer } from './modules/speech-rec.js';
import {
  normalizePolishSpeech,
  extractBotCommand,
  isSpokenDrawProposal,
  formatMoveToPolish,
  describePositionInPolish,
  findMatchingMove
} from './modules/speech-parser.js';
import { StockfishClient } from './modules/stockfish-client.js';
import { BoardRenderer } from './modules/board-renderer.js';

initGlobalErrorLogging();

class MowoSzachyApp {
  constructor() {
    this.game = new Chess();

    // Stan partii i interfejsu
    this.selectedSquare = null;
    this.lastMoveSquares = [];
    this.isBoardFlipped = false;
    this.isFullscreenBoard = false;
    this.customGameEnd = null; // 'draw_agreed' | 'resigned' | null
    this.latestEval = null;    // { fen, type: 'cp'|'mate', evalScore, cp, mate }
    this.engineTimer = null;

    // Załadowanie ustawień
    this.settings = SettingsManager.load();

    // Cache elementów DOM
    this.initElements();

    // Moduł audio (chime)
    this.audio = new AudioManager();

    // Moduł syntezy mowy (TTS)
    this.tts = new SpeechSynthesizer({
      rate: this.settings.speechRate,
      onStart: (text) => {
        this.setDisplayText(text);
        this.setSpeechIndicator(true, 'Czytam na głos...');
        this.stt.pauseForTTS();
      },
      onEnd: () => {
        this.setSpeechIndicator(false, 'Gotowy');
        this.stt.resumeAfterTTS();
      },
      onVoicesChanged: (voices, currentVoice) => {
        this.populateVoiceSelect(voices, currentVoice);
      }
    });

    // Moduł rozpoznawania mowy (STT)
    this.stt = new SpeechRecognizer({
      getBotName: () => this.settings.botName || 'Janusz',
      isGameOver: () => this.isGameOver(),
      isSpeaking: () => this.tts.isSpeaking,
      checkCommandValid: (text) => this.isRecognizedCommandOrMove(text),
      onCommandReady: (command) => this.executeVoiceAction(command),
      onWakeWordWaiting: (botName) => {
        this.setSpeechIndicator(true, `Słucham «${botName}»... powiedz ruch`);
        this.setDisplayText(`(Słucham bota «${botName}»... podaj ruch, np. «e4» lub «skoczek na f3»)`);
      },
      onThinkingAloud: (raw, botName) => {
        this.setDisplayText(`(Myślisz na głos: "${raw}" — powiedz np. «${botName} e4» lub «${botName} proponuję remis»)`);
        this.setSpeechIndicator(true, `Słucham (hasło: «${botName}»)...`);
      },
      onWakeWordPrompt: (botName) => {
        this.speak('Słucham! Jaki ruch?', false, () => {
          if (this.stt.isListeningRequested && !this.isGameOver()) {
            setTimeout(() => this.stt.start(), 250);
          }
        });
      },
      onStatusChange: (isListening, statusText) => {
        this.updateListeningUI(isListening, statusText);
      },
      onError: (errorMsg) => {
        this.speak(errorMsg);
      }
    });

    // Klient silnika Stockfish.js UCI
    this.engine = new StockfishClient({
      onReady: () => {
        this.el.engineStatus.querySelector('.status-dot').className = 'status-dot';
        this.el.engineStatus.querySelector('.status-text').textContent = 'Stockfish';
        this.el.engineStatus.title = `Stan silnika Stockfish (${this.settings.engineElo || 1500} ELO)`;
        this.applyEngineStrength();

        // Jeśli partia zaczyna się od ruchu silnika (gracz jako Czarne)
        if (this.settings.gameMode === 'vs-engine' && this.settings.playerColor === 'b' && this.game.history().length === 0) {
          setTimeout(() => this.playEngineMove(), 600);
        }
      },
      onEval: (evalData) => {
        this.handleEngineEval(evalData);
      },
      onBestMove: (moveStr, action) => {
        this.handleEngineBestMove(moveStr, action);
      },
      onError: (msg) => {
        this.el.engineStatus.querySelector('.status-dot').className = 'status-dot error';
        this.el.engineStatus.querySelector('.status-text').textContent = 'Błąd silnika';
      }
    });

    // Renderer szachownicy
    this.board = new BoardRenderer(this.el.chessboard);

    // Inicjalizacja komponentów
    this.syncSettingsToUI();
    this.tts.init(this.settings.voiceIndex);
    this.initBoardUI();
    this.attachEventListeners();
    this.updateUI();

    remoteLog('INFO', `MowoSzachy initialized. Mode: ${this.settings.gameMode}, Color: ${this.settings.playerColor}`);
  }

  isGameOver() {
    return Boolean(this.customGameEnd) || this.game.game_over();
  }

  speak(text, priority = false, onComplete = null) {
    this.stt.clearVoiceWaitTimer();
    this.tts.speak(text, priority, onComplete);
  }

  setDisplayText(text) {
    if (this.el.speechDisplayText) {
      this.el.speechDisplayText.textContent = text;
    }
  }

  setSpeechIndicator(active, text) {
    if (this.el.speechStatus) {
      this.el.speechStatus.querySelector('.status-dot').className = `status-dot ${active ? 'active' : ''}`;
      this.el.speechStatus.querySelector('.status-text').textContent = text;
    }
    if (this.el.speechStateLabel) {
      this.el.speechStateLabel.textContent = text;
    }
    if (this.el.speechWaves) {
      this.el.speechWaves.className = `speech-waves ${active ? 'listening' : ''}`;
    }
  }

  updateListeningUI(isListening, statusText) {
    const bot = this.settings.botName || 'Janusz';
    if (isListening) {
      this.el.btnVoiceInput.classList.add('listening');
      this.el.voiceBtnLabel.textContent = 'Słucham...';
      if (this.el.btnFsVoice) this.el.btnFsVoice.classList.add('listening');
      if (this.el.fsVoiceLabel) this.el.fsVoiceLabel.textContent = 'Słucham...';
      this.setSpeechIndicator(true, statusText || `Słucham (hasło: «${bot}»)...`);
    } else {
      this.el.btnVoiceInput.classList.remove('listening');
      this.el.voiceBtnLabel.textContent = 'Powiedz ruch';
      if (this.el.btnFsVoice) this.el.btnFsVoice.classList.remove('listening');
      if (this.el.fsVoiceLabel) this.el.fsVoiceLabel.textContent = 'Głos';
      this.setSpeechIndicator(false, statusText || 'Gotowy');
    }
  }

  populateVoiceSelect(voices, currentVoice) {
    if (!this.el.voiceSelect) return;
    this.el.voiceSelect.innerHTML = '';
    voices.forEach((voice, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `${voice.name} (${voice.lang})${voice.default ? ' — domyślny' : ''}`;
      this.el.voiceSelect.appendChild(option);
    });
    if (currentVoice) {
      const idx = voices.indexOf(currentVoice);
      if (idx >= 0) this.el.voiceSelect.value = idx;
      this.el.speechStatus.querySelector('.status-dot').className = 'status-dot';
    }
  }

  // --- Walidacja i rozpoznawanie komend ---
  isRecognizedCommandOrMove(text) {
    if (!text || !text.trim()) return false;
    const rawLower = text.toLowerCase().trim();

    if (isSpokenDrawProposal(rawLower)) return true;
    if (rawLower.includes('nowa partia') || rawLower.includes('zacznij od nowa') || rawLower.includes('zresetuj')) return true;
    if (rawLower.includes('graj białymi') || rawLower.includes('zagraj białymi')) return true;
    if (rawLower.includes('graj czarnymi') || rawLower.includes('zagraj czarnymi')) return true;
    if (rawLower.includes('poddaję') || rawLower.includes('rezygnuję') || rawLower.includes('poddanie')) return true;
    if (rawLower.includes('cofnij') || rawLower.includes('cofnij ruch') || rawLower.includes('wróć')) return true;
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
    ) return true;
    if (rawLower.includes('przeczytaj pozycję') || rawLower.includes('jaka pozycja') || rawLower.includes('czytaj pozycję') || rawLower.includes('stan gry')) return true;
    if (rawLower.includes('powtórz') || rawLower.includes('ostatni ruch') || rawLower.includes('jaki był ruch') || rawLower.includes('co zagrałeś')) return true;
    if (rawLower.includes('odwróć') && (rawLower.includes('szachownicę') || rawLower.includes('deskę'))) return true;
    if (rawLower.includes('motyw zelda') || rawLower.includes('motyw fantasy')) return true;
    if (rawLower.includes('motyw drewno') || rawLower.includes('motyw klasyczny')) return true;
    if (rawLower.includes('motyw błękit') || rawLower.includes('motyw niebieski') || rawLower.includes('motyw blue')) return true;
    if (rawLower.includes('motyw zieleń') || rawLower.includes('motyw zielony') || rawLower.includes('motyw green')) return true;
    if (
      rawLower.includes('jaki masz poziom') ||
      rawLower.includes('jaki poziom') ||
      rawLower.includes('jakie masz elo') ||
      rawLower.includes('jaki masz ranking') ||
      rawLower.includes('jaki ranking') ||
      rawLower.includes('jakie elo')
    ) return true;
    if (
      rawLower.includes('poziom początkujący') ||
      rawLower.includes('poziom amator') ||
      rawLower.includes('poziom nowicjusz') ||
      rawLower.includes('poziom klubowy') ||
      rawLower.includes('poziom średni') ||
      rawLower.includes('poziom zaawansowany') ||
      rawLower.includes('poziom ekspert') ||
      rawLower.includes('poziom mistrz') ||
      rawLower.includes('poziom arcymistrz') ||
      rawLower.includes('poziom maksymalny') ||
      rawLower.includes('poziom maks')
    ) return true;
    if (rawLower.match(/(?:ustaw|zmień)?\s*(?:poziom|ranking|elo)\s*(?:na)?\s*(\d{3,4})/i)) return true;
    if (rawLower.includes('graj') || rawLower.includes('ruch silnika') || rawLower.includes('twój ruch')) return true;

    // Legalny ruch szachowy w bieżącej pozycji
    try {
      if (!this.isGameOver()) {
        if (this.settings.gameMode === 'vs-engine') {
          if (this.engine.isThinking || Boolean(this.engineTimer) || this.game.turn() !== this.settings.playerColor) {
            return false;
          }
        }
        const legalMoves = this.game.moves({ verbose: true });
        if (legalMoves.length > 0) {
          const clean = normalizePolishSpeech(text);
          const matched = findMatchingMove(clean, legalMoves);
          if (matched) return true;
        }
      }
    } catch (e) {}

    return false;
  }

  handleVoiceCommand(raw, bypassWakeWord = false) {
    if (!raw || !raw.trim()) return;

    if (bypassWakeWord) {
      this.stt.clearVoiceWaitTimer();
      this.executeVoiceAction(raw.trim());
      return;
    }

    this.stt.handleIncomingSpeech(raw);
  }

  executeVoiceAction(commandToProcess) {
    this.stt.clearVoiceWaitTimer();
    const rawLower = commandToProcess.toLowerCase().trim();

    // 1. Komendy aplikacyjne
    if (isSpokenDrawProposal(rawLower)) {
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
      this.setBoardTheme('zelda', 'Zmieniono motyw szachownicy na Zelda Fantasy.');
      return;
    }
    if (rawLower.includes('motyw drewno') || rawLower.includes('motyw klasyczny')) {
      this.setBoardTheme('wood', 'Zmieniono motyw szachownicy na klasyczne drewno.');
      return;
    }
    if (rawLower.includes('motyw błękit') || rawLower.includes('motyw niebieski') || rawLower.includes('motyw blue')) {
      this.setBoardTheme('blue', 'Zmieniono motyw szachownicy na błękitny marmur.');
      return;
    }
    if (rawLower.includes('motyw zieleń') || rawLower.includes('motyw zielony') || rawLower.includes('motyw green')) {
      this.setBoardTheme('green', 'Zmieniono motyw szachownicy na szmaragdowy leśny.');
      return;
    }

    if (
      rawLower.includes('jaki masz poziom') ||
      rawLower.includes('jaki poziom') ||
      rawLower.includes('jakie masz elo') ||
      rawLower.includes('jaki masz ranking') ||
      rawLower.includes('jaki ranking') ||
      rawLower.includes('jakie elo')
    ) {
      const elo = this.settings.engineElo || 1500;
      const cat = getEloCategory(elo);
      const depth = this.settings.engineDepth || 10;
      this.speak(`Mój aktualny ranking to ${elo} ELO, poziom ${cat}, a głębokość myślenia to ${depth} półruchów.`);
      return;
    }

    if (rawLower.includes('poziom początkujący')) { this.setEloAndDepth(800, 4); return; }
    if (rawLower.includes('poziom amator') || rawLower.includes('poziom nowicjusz')) { this.setEloAndDepth(1200, 6); return; }
    if (rawLower.includes('poziom klubowy') || rawLower.includes('poziom średni')) { this.setEloAndDepth(1500, 10); return; }
    if (rawLower.includes('poziom zaawansowany') || rawLower.includes('poziom ekspert')) { this.setEloAndDepth(1800, 12); return; }
    if (rawLower.includes('poziom mistrz') && !rawLower.includes('arcymistrz')) { this.setEloAndDepth(2200, 14); return; }
    if (rawLower.includes('poziom arcymistrz') || rawLower.includes('poziom maksymalny') || rawLower.includes('poziom maks')) { this.setEloAndDepth(2800, 18); return; }

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

    // 2. Parsowanie jako ruch szachowy
    const clean = normalizePolishSpeech(commandToProcess);
    remoteLog('INFO', `Speech parsed to move: "${commandToProcess}" -> "${clean}"`);

    const legalMoves = this.game.moves({ verbose: true });
    if (legalMoves.length === 0 || this.isGameOver()) {
      this.speak('Partia jest już zakończona.');
      return;
    }

    // Blokada ruchu za bota w trybie vs-engine
    if (this.settings.gameMode === 'vs-engine') {
      if (this.engine.isThinking || Boolean(this.engineTimer) || this.game.turn() !== this.settings.playerColor) {
        const botName = this.settings.botName || 'Janusz';
        const opponentColorPl = this.game.turn() === 'w' ? 'Białych' : 'Czarnych';
        this.speak(`Teraz ruch ${opponentColorPl}. ${botName} myśli nad ruchem, poczekaj na swoją kolej.`);
        return;
      }
    }

    let matchedMove = findMatchingMove(clean, legalMoves);

    if (matchedMove) {
      this.stt.isListeningRequested = false;
      const res = this.makeMove(matchedMove, false);
      if (!res) {
        this.speak('Niepoprawny ruch. Spróbuj jeszcze raz.', false, () => {
          if (!this.isGameOver()) {
            this.stt.isListeningRequested = true;
            setTimeout(() => this.stt.start(), 250);
          }
        });
      }
    } else {
      this.speak(`Rozpoznano: "${commandToProcess}". To nie jest poprawny ruch w tej pozycji. Spróbuj jeszcze raz.`, false, () => {
        if (!this.isGameOver()) {
          this.stt.isListeningRequested = true;
          setTimeout(() => this.stt.start(), 250);
        }
      });
    }
  }

  // --- Obsługa silnika i ewaluacji ---
  handleEngineEval(evalData) {
    if (evalData.type === 'cp') {
      const evalScore = (this.game.turn() === 'w' ? evalData.cp : -evalData.cp) / 100;
      this.latestEval = {
        fen: this.game.fen(),
        type: 'cp',
        evalScore,
        cp: evalData.cp,
        turn: this.game.turn()
      };
      this.el.engineEvalText.textContent = `Ocena: ${evalScore > 0 ? '+' : ''}${evalScore.toFixed(1)}`;
    } else if (evalData.type === 'mate') {
      const whiteMate = this.game.turn() === 'w' ? evalData.mate : -evalData.mate;
      this.latestEval = {
        fen: this.game.fen(),
        type: 'mate',
        evalScore: whiteMate > 0 ? 999 : -999,
        mate: whiteMate,
        turn: this.game.turn()
      };
      this.el.engineEvalText.textContent = `Mat w ${evalData.mate}`;
    }
  }

  handleEngineBestMove(moveStr, action) {
    this.setSpeechIndicator(false, 'Gotowy');

    const actionType = typeof action === 'string' ? action : (action ? action.type : null);
    const actionFen = typeof action === 'object' && action ? action.fen : null;

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

        const legalMoves = this.game.moves({ verbose: true });
        const matchedMove = legalMoves.find(m =>
          m.from === from && m.to === to && (!promotion || m.promotion === promotion)
        );

        let plDesc = '';
        let moveSan = '';
        if (matchedMove) {
          plDesc = formatMoveToPolish(matchedMove);
          moveSan = matchedMove.san;
        } else {
          const pieceOnFrom = this.game.get(from);
          plDesc = formatMoveToPolish({
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

        this.selectedSquare = from;
        this.renderBoardPieces();

        this.speak(speechText, false, () => {
          if (this.settings.autoListenAfterEngine && !this.isGameOver()) {
            setTimeout(() => this.stt.start(), 250);
          }
        });
      } else {
        this.speak('Nie znalazłem dobrego ruchu w tej pozycji.');
      }
    }
  }

  playEngineMove() {
    if (this.isGameOver()) {
      this.handleGameOver();
      return;
    }
    if (!this.engine.isReady) return;

    this.setSpeechIndicator(true, 'Silnik myśli...');
    this.el.engineEvalText.textContent = 'Ocena: obliczanie...';
    this.applyEngineStrength();
    this.engine.search(this.game.fen(), this.settings.engineDepth, { type: 'play', fen: this.game.fen() });
  }

  requestEngineHint() {
    if (this.isGameOver()) {
      this.speak('Partia jest już zakończona.');
      return;
    }
    if (!this.engine.isReady) {
      this.speak('Silnik szachowy nie jest jeszcze gotowy.');
      return;
    }

    if (this.settings.gameMode === 'vs-engine') {
      if (this.game.turn() !== this.settings.playerColor) {
        this.speak('Teraz ruch silnika. Poczekaj na ruch przeciwnika.');
        if (!this.engine.isThinking) {
          this.playEngineMove();
        }
        return;
      }
    }

    this.setSpeechIndicator(true, 'Szukam najlepszego ruchu...');
    this.el.engineEvalText.textContent = 'Szukam podpowiedzi...';
    this.engine.search(this.game.fen(), this.settings.engineDepth, { type: 'hint', fen: this.game.fen() });
  }

  applyEngineStrength() {
    this.engine.applyStrength(this.settings.engineElo || 1500, this.settings.engineDepth || 10);
  }

  // --- Wykonywanie ruchów i pętla gry ---
  makeMove(moveObj, isEngine = false) {
    if (this.isGameOver()) return false;

    // Blokada ruchu za bota w trybie vs-engine
    if (!isEngine && this.settings.gameMode === 'vs-engine') {
      if (this.engine.isThinking || Boolean(this.engineTimer)) {
        remoteLog('WARN', 'Blocked human move: Engine is currently thinking');
        return false;
      }
      if (this.game.turn() !== this.settings.playerColor) {
        remoteLog('WARN', `Blocked human move: Not player's turn (Turn: ${this.game.turn()}, Player: ${this.settings.playerColor})`);
        return false;
      }
    }

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
    const plMove = formatMoveToPolish(move);
    this.el.lastMoveText.textContent = `Ostatni: ${move.san} (${plMove})`;

    if (this.isGameOver()) {
      if (isEngineMove) this.audio.playChime(this.settings.soundAlert);
      this.handleGameOver(move, isEngineMove);
      return;
    }

    if (isEngineMove) {
      this.audio.playChime(this.settings.soundAlert);
      let speech = `Silnik zagrał: ${plMove}.`;
      if (this.game.in_check()) speech += ' Szach!';
      speech += ' Twój ruch.';

      if (this.settings.autoSpeakEngine) {
        this.speak(speech, false, () => {
          if (this.settings.autoListenAfterEngine && !this.isGameOver()) {
            setTimeout(() => this.stt.start(), 250);
          }
        });
      } else {
        this.setDisplayText(speech);
      }
    } else {
      let speech = `Twój ruch: ${plMove}.`;
      if (this.game.in_check()) speech += ' Szach!';
      this.speak(speech);

      if (this.settings.gameMode === 'vs-engine' && this.settings.autoEngineResponse) {
        if (this.game.turn() !== this.settings.playerColor) {
          if (this.engineTimer) clearTimeout(this.engineTimer);
          this.engineTimer = setTimeout(() => {
            this.playEngineMove();
          }, 650);
        }
      }
    }

    // Ewaluacja w tle
    if (this.engine.isReady && !this.engine.isThinking) {
      this.engine.search(this.game.fen(), 6, null);
    }
  }

  handleGameOver(lastMove = null, wasEngineMove = false) {
    this.engine.stop();
    this.updateUI();

    let title = '';
    let speech = '';

    if (this.game.in_checkmate()) {
      const loser = this.game.turn();
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
    this.stt.stop();
    this.updateUI();
    const speech = 'Poddajesz partię. Silnik wygrywa. Chcesz zagrać jeszcze raz? Kliknij nowa partia.';
    this.el.gameStatusText.textContent = ' — Poddanie partii';
    this.speak(speech, true);
  }

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
    if (this.latestEval && this.latestEval.fen === this.game.fen()) {
      this.decideEngineDrawProposal();
      return;
    }

    if (this.engine.isReady) {
      this.setDisplayText(`${botName}: Zastanawiam się nad propozycją remisu...`);
      this.setSpeechIndicator(true, 'Analizuję remis...');
      this.engine.search(this.game.fen(), 10, { type: 'draw_offer', fen: this.game.fen() });
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

    if (advantage > 1.3) {
      let reason = 'Moja pozycja jest zbyt dobra, gramy dalej! Twój ruch.';
      if (advantage >= 3.0) {
        reason = 'Mam zbyt dużą przewagę, nie mogę przyjąć remisu! Twój ruch.';
      }
      const speech = `Odrzucam propozycję remisu. ${reason}`;
      this.setDisplayText(`${botName}: ${speech}`);
      this.speak(speech, false, () => {
        if (this.settings.autoListenAfterEngine && !this.isGameOver() && this.game.turn() === this.settings.playerColor) {
          this.stt.isListeningRequested = true;
          setTimeout(() => this.stt.start(), 250);
        }
      });
    } else {
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
    this.engine.stop();
    this.stt.stop();

    this.updateUI();
    this.el.gameStatusText.textContent = ' — Remis (zgoda stron)';
    this.setDisplayText(message);
    this.speak('Zgadzam się na remis! Partia zakończona remisem.', true);
  }

  undoMove() {
    if (this.customGameEnd) {
      this.customGameEnd = null;
      this.updateUI();
      this.speak('Cofnięto zakończenie partii. Wznawiamy grę.');
      return;
    }

    if (this.engine.isThinking) {
      this.engine.stop();
      const undone = this.game.undo();
      if (undone) {
        this.updateLastMoveFromHistory();
        this.updateUI();
        this.speak('Zatrzymano silnik i cofnięto Twój ruch. Twój ruch.');
        return;
      }
    }

    if (this.settings.gameMode === 'vs-engine') {
      const history = this.game.history();
      if (history.length === 0) {
        this.speak('Brak ruchów do cofnięcia.');
        return;
      }

      if (this.game.turn() === this.settings.playerColor) {
        if (history.length === 1) {
          this.game.undo();
          this.updateLastMoveFromHistory();
          this.updateUI();
          this.speak('Cofnięto ruch początkowy silnika.');
          return;
        }

        this.game.undo();
        const playerMove = this.game.undo();
        this.updateLastMoveFromHistory();
        this.updateUI();

        const plPlayer = formatMoveToPolish(playerMove);
        this.speak(`Cofnięto ruch silnika oraz Twój ruch ${plPlayer}. Twój ruch.`);
      } else {
        this.game.undo();
        this.updateLastMoveFromHistory();
        this.updateUI();
        this.speak('Cofnięto Twój ruch. Twój ruch.');
      }
    } else {
      const undone = this.game.undo();
      if (undone) {
        this.updateLastMoveFromHistory();
        this.updateUI();
        const plMove = formatMoveToPolish(undone);
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
      this.el.lastMoveText.textContent = `Ostatni: ${last.san} (${formatMoveToPolish(last)})`;
    } else {
      this.lastMoveSquares = [];
      this.el.lastMoveText.textContent = 'Ostatni: —';
    }
  }

  repeatLastMove() {
    const history = this.game.history({ verbose: true });
    if (history.length > 0) {
      const last = history[history.length - 1];
      const actor = (this.settings.gameMode === 'vs-engine' && last.color !== this.settings.playerColor)
        ? 'Silnik zagrał: '
        : 'Ostatni ruch: ';
      this.speak(`${actor}${formatMoveToPolish(last)}`);
    } else {
      this.speak('Nie wykonano jeszcze żadnego ruchu w tej partii.');
    }
  }

  readFullPosition() {
    const fullSpeech = describePositionInPolish(this.game);
    this.speak(fullSpeech);
  }

  // --- Nowa partia & kolory ---
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
    SettingsManager.save(this.settings);

    this.game.reset();
    this.lastMoveSquares = [];
    this.selectedSquare = null;
    this.customGameEnd = null;
    this.latestEval = null;

    if (this.settings.autoFlipBoard) {
      this.isBoardFlipped = (color === 'b');
    }

    if (this.engine.isReady) {
      this.engine.newGame();
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
  }

  // --- Pełny ekran szachownicy ---
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
      if (this.stt.isListening) {
        this.el.btnFsVoice.classList.add('listening');
        this.el.fsVoiceLabel.textContent = 'Słucham...';
      } else {
        this.el.btnFsVoice.classList.remove('listening');
        this.el.fsVoiceLabel.textContent = 'Głos';
      }
    }
  }

  // --- Renderowanie i kliknięcia na szachownicy ---
  initBoardUI() {
    this.board.initBoard(this.isBoardFlipped, (squareId) => this.handleSquareClick(squareId));
  }

  renderBoardPieces() {
    this.board.renderPieces(this.game, this.selectedSquare, this.lastMoveSquares);
  }

  handleSquareClick(squareId) {
    if (this.isGameOver()) return;

    if (this.settings.gameMode === 'vs-engine') {
      if (this.engine.isThinking || Boolean(this.engineTimer) || this.game.turn() !== this.settings.playerColor) {
        this.selectedSquare = null;
        this.renderBoardPieces();
        return;
      }
    }

    if (!this.selectedSquare) {
      const piece = this.game.get(squareId);
      if (this.settings.gameMode === 'vs-engine' && piece && piece.color !== this.settings.playerColor) {
        return;
      }
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
          const piece = this.game.get(to);
          const isOwnPiece = this.settings.gameMode === 'vs-engine'
            ? (piece && piece.color === this.settings.playerColor && piece.color === this.game.turn())
            : (piece && piece.color === this.game.turn());
          if (isOwnPiece) {
            this.selectedSquare = to;
          }
        }
      }
      this.renderBoardPieces();
    }
  }

  // --- Ustawienia wizualne i ELO ---
  setBoardTheme(theme, speechText = null) {
    this.settings.boardTheme = theme;
    if (this.el.boardThemeSelect) this.el.boardThemeSelect.value = theme;
    SettingsManager.save(this.settings);
    this.board.applyTheme(theme);
    if (speechText) this.speak(speechText);
  }

  setEloAndDepth(elo, depth) {
    this.settings.engineElo = elo;
    if (depth !== undefined && !isNaN(depth)) {
      this.settings.engineDepth = depth;
    }
    this.syncSettingsToUI();
    this.applyEngineStrength();
    this.updateModeLabels();
    SettingsManager.save(this.settings);
    const cat = getEloCategory(elo);
    this.speak(`Ustawiono mój ranking na ${elo} ELO, poziom ${cat}, a głębokość myślenia na ${this.settings.engineDepth} półruchów.`);
  }

  updateEloDisplay(elo) {
    if (this.el.engineEloVal) this.el.engineEloVal.textContent = elo;
    if (this.el.engineEloCategory) this.el.engineEloCategory.textContent = getEloCategory(elo);
    if (this.el.engineSkillVal) this.el.engineSkillVal.textContent = getSkillLevelFromElo(elo);
  }

  updateEloPresetButtons(elo) {
    if (!this.el.eloPresetButtons) return;
    this.el.eloPresetButtons.forEach(btn => {
      const btnElo = parseInt(btn.dataset.elo, 10);
      btn.classList.toggle('active', btnElo === elo);
    });
  }

  updateOpacityPresetButtons(val) {
    const numericVal = parseInt(val, 10);
    const presetBtns = document.querySelectorAll('.btn-opacity-preset');
    presetBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.val, 10) === numericVal);
    });
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

    BoardRenderer.applyPieceGlow(whiteSize, whiteOpacity, blackSize, blackOpacity);
    this.updateGlowPresetButtons(whiteSize, whiteOpacity, blackSize, blackOpacity);
  }

  updateModeLabels() {
    if (this.settings.gameMode === 'vs-engine') {
      const sideName = this.settings.playerColor === 'w' ? 'Białe' : 'Czarne';
      const engineSide = this.settings.playerColor === 'w' ? 'Czarne' : 'Białe';
      const botName = this.settings.botName || 'Janusz';
      const elo = this.settings.engineElo || 1500;
      this.el.modeLabelText.textContent = `Gracz (${sideName}) vs ${botName} (${elo} ELO)`;
      if (this.el.modePill) {
        this.el.modePill.title = `Tryb: Gracz vs Silnik ${botName} (${elo} ELO, ${getEloCategory(elo)}, głębokość ${this.settings.engineDepth})`;
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
    this.board.applyTheme(this.settings.boardTheme || 'wood');

    if (this.el.boardOpacitySlider) {
      const opVal = this.settings.boardBgOpacity !== undefined ? this.settings.boardBgOpacity : 50;
      this.el.boardOpacitySlider.value = opVal;
      if (this.el.boardOpacityVal) {
        this.el.boardOpacityVal.textContent = `${opVal}%`;
      }
      this.board.applyBgOpacity(opVal);
      this.updateOpacityPresetButtons(opVal);
    }

    this.syncPieceGlowToUI();
  }

  updateUI() {
    const turn = this.game.turn();
    const isWhite = turn === 'w';

    const isEngineTurn = this.settings.gameMode === 'vs-engine' &&
      (turn !== this.settings.playerColor || this.engine.isThinking || Boolean(this.engineTimer));
    if (this.el.chessboard) {
      this.el.chessboard.classList.toggle('engine-turn', isEngineTurn);
    }
    if (isEngineTurn) {
      this.selectedSquare = null;
    }

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

  initElements() {
    this.el = {
      engineStatus: document.getElementById('engineStatus'),
      speechStatus: document.getElementById('speechStatus'),
      btnOpenSettings: document.getElementById('btnOpenSettings'),
      modeBar: document.getElementById('modeBar'),
      modePill: document.getElementById('modePill'),
      modeLabelText: document.getElementById('modeLabelText'),
      btnSideToggle: document.getElementById('btnSideToggle'),
      sideIcon: document.getElementById('sideIcon'),
      sideLabel: document.getElementById('sideLabel'),
      turnMarker: document.getElementById('turnMarker'),
      turnLabel: document.getElementById('turnLabel'),
      moveCount: document.getElementById('moveCount'),
      gameStatusText: document.getElementById('gameStatusText'),
      speechStateLabel: document.getElementById('speechStateLabel'),
      speechWaves: document.getElementById('speechWaves'),
      speechDisplayText: document.getElementById('speechDisplayText'),
      lastMoveText: document.getElementById('lastMoveText'),
      engineEvalText: document.getElementById('engineEvalText'),
      btnReadPosition: document.getElementById('btnReadPosition'),
      btnVoiceInput: document.getElementById('btnVoiceInput'),
      voiceBtnLabel: document.getElementById('voiceBtnLabel'),
      btnPlayEngineMove: document.getElementById('btnPlayEngineMove'),
      btnReadHint: document.getElementById('btnReadHint'),
      btnReadLastMove: document.getElementById('btnReadLastMove'),
      manualMoveInput: document.getElementById('manualMoveInput'),
      btnSendManualMove: document.getElementById('btnSendManualMove'),
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
      pieceGlowWhiteSize: document.getElementById('pieceGlowWhiteSize'),
      pieceGlowWhiteSizeVal: document.getElementById('pieceGlowWhiteSizeVal'),
      pieceGlowWhiteOpacity: document.getElementById('pieceGlowWhiteOpacity'),
      pieceGlowWhiteOpacityVal: document.getElementById('pieceGlowWhiteOpacityVal'),
      pieceGlowBlackSize: document.getElementById('pieceGlowBlackSize'),
      pieceGlowBlackSizeVal: document.getElementById('pieceGlowBlackSizeVal'),
      pieceGlowBlackOpacity: document.getElementById('pieceGlowBlackOpacity'),
      pieceGlowBlackOpacityVal: document.getElementById('pieceGlowBlackOpacityVal'),
      glowSettingsHeader: document.getElementById('glowSettingsHeader'),
      newGameModal: document.getElementById('newGameModal'),
      btnCloseNewGame: document.getElementById('btnCloseNewGame'),
      btnChooseWhite: document.getElementById('btnChooseWhite'),
      btnChooseBlack: document.getElementById('btnChooseBlack')
    };
  }

  attachEventListeners() {
    this.el.btnSideToggle.addEventListener('click', () => this.showNewGameModal());
    this.el.modePill.addEventListener('click', () => this.el.settingsModal.classList.add('open'));
    this.el.btnReadPosition.addEventListener('click', () => this.readFullPosition());
    this.el.btnVoiceInput.addEventListener('click', () => this.stt.toggle());
    this.el.btnPlayEngineMove.addEventListener('click', () => this.playEngineMove());
    this.el.btnReadHint.addEventListener('click', () => this.requestEngineHint());
    this.el.btnReadLastMove.addEventListener('click', () => this.repeatLastMove());

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

    if (this.el.btnHeaderFullscreen) {
      this.el.btnHeaderFullscreen.addEventListener('click', (e) => {
        e.stopPropagation();
        this.enterFullscreenBoard();
      });
    }
    if (this.el.btnCloseFullscreen) {
      this.el.btnCloseFullscreen.addEventListener('click', () => this.exitFullscreenBoard());
    }

    if (this.el.btnFsUndo) this.el.btnFsUndo.addEventListener('click', () => this.undoMove());
    if (this.el.btnFsVoice) this.el.btnFsVoice.addEventListener('click', () => this.stt.toggle());
    if (this.el.btnFsEngine) this.el.btnFsEngine.addEventListener('click', () => this.playEngineMove());
    if (this.el.btnFsFlip) this.el.btnFsFlip.addEventListener('click', () => this.toggleBoardFlip());

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

    const executeManualMove = () => {
      const val = this.el.manualMoveInput.value.trim();
      if (!val) return;
      const { command } = extractBotCommand(val, this.settings.botName);
      const inputToUse = command || val;
      this.handleVoiceCommand(inputToUse, true);
      this.el.manualMoveInput.value = '';
    };
    this.el.btnSendManualMove.addEventListener('click', executeManualMove);
    this.el.manualMoveInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeManualMove();
    });

    this.el.boardToggle.addEventListener('click', () => {
      this.el.boardAccordion.classList.toggle('expanded');
    });

    if (this.el.boardOpacitySlider) {
      this.el.boardOpacitySlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.settings.boardBgOpacity = val;
        if (this.el.boardOpacityVal) {
          this.el.boardOpacityVal.textContent = `${val}%`;
        }
        this.board.applyBgOpacity(val);
        this.updateOpacityPresetButtons(val);
      });

      this.el.boardOpacitySlider.addEventListener('change', () => {
        SettingsManager.save(this.settings);
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
          this.board.applyBgOpacity(val);
          this.updateOpacityPresetButtons(val);
          SettingsManager.save(this.settings);
        });
      });
    }

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

    this.el.gameModeSelect.addEventListener('change', (e) => {
      this.settings.gameMode = e.target.value;
      this.updateModeLabels();
      SettingsManager.save(this.settings);
      this.updateUI();
    });

    this.el.playerColorSelect.addEventListener('change', (e) => {
      this.settings.playerColor = e.target.value;
      if (this.settings.autoFlipBoard) {
        this.isBoardFlipped = (this.settings.playerColor === 'b');
        this.initBoardUI();
        this.renderBoardPieces();
      }
      this.updateModeLabels();
      SettingsManager.save(this.settings);
      this.updateUI();
    });

    if (this.el.botNameInput) {
      this.el.botNameInput.addEventListener('change', (e) => {
        const val = e.target.value.trim();
        this.settings.botName = val || 'Janusz';
        this.el.botNameInput.value = this.settings.botName;
        this.updateModeLabels();
        SettingsManager.save(this.settings);
      });
    }

    this.el.autoEngineResponse.addEventListener('change', (e) => {
      this.settings.autoEngineResponse = e.target.checked;
      SettingsManager.save(this.settings);
    });

    this.el.autoListenAfterEngine.addEventListener('change', (e) => {
      this.settings.autoListenAfterEngine = e.target.checked;
      SettingsManager.save(this.settings);
    });

    this.el.soundAlert.addEventListener('change', (e) => {
      this.settings.soundAlert = e.target.checked;
      SettingsManager.save(this.settings);
    });

    this.el.autoFlipBoard.addEventListener('change', (e) => {
      this.settings.autoFlipBoard = e.target.checked;
      if (this.settings.autoFlipBoard) {
        this.isBoardFlipped = (this.settings.playerColor === 'b');
        this.initBoardUI();
        this.renderBoardPieces();
      }
      SettingsManager.save(this.settings);
    });

    if (this.el.boardThemeSelect) {
      this.el.boardThemeSelect.addEventListener('change', (e) => {
        this.settings.boardTheme = e.target.value;
        this.board.applyTheme(this.settings.boardTheme);
        SettingsManager.save(this.settings);
      });
    }

    if (this.el.pieceGlowWhiteSize) {
      this.el.pieceGlowWhiteSize.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.settings.pieceGlowWhiteSize = val;
        if (this.el.pieceGlowWhiteSizeVal) this.el.pieceGlowWhiteSizeVal.textContent = `${val}px`;
        BoardRenderer.applyPieceGlow(val, this.settings.pieceGlowWhiteOpacity, this.settings.pieceGlowBlackSize, this.settings.pieceGlowBlackOpacity);
        this.updateGlowPresetButtons(val, this.settings.pieceGlowWhiteOpacity, this.settings.pieceGlowBlackSize, this.settings.pieceGlowBlackOpacity);
      });
      this.el.pieceGlowWhiteSize.addEventListener('change', () => SettingsManager.save(this.settings));
    }

    if (this.el.pieceGlowWhiteOpacity) {
      this.el.pieceGlowWhiteOpacity.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.settings.pieceGlowWhiteOpacity = val;
        if (this.el.pieceGlowWhiteOpacityVal) this.el.pieceGlowWhiteOpacityVal.textContent = `${val}%`;
        BoardRenderer.applyPieceGlow(this.settings.pieceGlowWhiteSize, val, this.settings.pieceGlowBlackSize, this.settings.pieceGlowBlackOpacity);
        this.updateGlowPresetButtons(this.settings.pieceGlowWhiteSize, val, this.settings.pieceGlowBlackSize, this.settings.pieceGlowBlackOpacity);
      });
      this.el.pieceGlowWhiteOpacity.addEventListener('change', () => SettingsManager.save(this.settings));
    }

    if (this.el.pieceGlowBlackSize) {
      this.el.pieceGlowBlackSize.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.settings.pieceGlowBlackSize = val;
        if (this.el.pieceGlowBlackSizeVal) this.el.pieceGlowBlackSizeVal.textContent = `${val}px`;
        BoardRenderer.applyPieceGlow(this.settings.pieceGlowWhiteSize, this.settings.pieceGlowWhiteOpacity, val, this.settings.pieceGlowBlackOpacity);
        this.updateGlowPresetButtons(this.settings.pieceGlowWhiteSize, this.settings.pieceGlowWhiteOpacity, val, this.settings.pieceGlowBlackOpacity);
      });
      this.el.pieceGlowBlackSize.addEventListener('change', () => SettingsManager.save(this.settings));
    }

    if (this.el.pieceGlowBlackOpacity) {
      this.el.pieceGlowBlackOpacity.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.settings.pieceGlowBlackOpacity = val;
        if (this.el.pieceGlowBlackOpacityVal) this.el.pieceGlowBlackOpacityVal.textContent = `${val}%`;
        BoardRenderer.applyPieceGlow(this.settings.pieceGlowWhiteSize, this.settings.pieceGlowWhiteOpacity, this.settings.pieceGlowBlackSize, val);
        this.updateGlowPresetButtons(this.settings.pieceGlowWhiteSize, this.settings.pieceGlowWhiteOpacity, this.settings.pieceGlowBlackSize, val);
      });
      this.el.pieceGlowBlackOpacity.addEventListener('change', () => SettingsManager.save(this.settings));
    }

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
        SettingsManager.save(this.settings);
      });
    });

    if (this.el.engineElo) {
      this.el.engineElo.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.settings.engineElo = val;
        this.updateEloDisplay(val);
        this.updateEloPresetButtons(val);
        this.updateModeLabels();
        this.applyEngineStrength();
        SettingsManager.save(this.settings);
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
          SettingsManager.save(this.settings);
        });
      });
    }

    if (this.el.engineDepth) {
      this.el.engineDepth.addEventListener('input', (e) => {
        this.settings.engineDepth = parseInt(e.target.value, 10);
        this.el.engineDepthVal.textContent = this.settings.engineDepth;
        this.updateModeLabels();
        this.applyEngineStrength();
        SettingsManager.save(this.settings);
      });
    }

    this.el.voiceSelect.addEventListener('change', (e) => {
      const allVoices = this.tts.voices;
      const plVoices = allVoices.filter(v => v.lang.startsWith('pl') || v.lang.includes('PL'));
      const activeList = plVoices.length > 0 ? plVoices : allVoices;
      this.settings.voiceIndex = parseInt(e.target.value, 10);
      this.tts.setVoice(activeList[this.settings.voiceIndex] || null);
      SettingsManager.save(this.settings);
    });

    this.el.speechRate.addEventListener('input', (e) => {
      this.settings.speechRate = parseFloat(e.target.value);
      this.el.speechRateVal.textContent = this.settings.speechRate.toFixed(2);
      this.tts.setRate(this.settings.speechRate);
      SettingsManager.save(this.settings);
    });

    this.el.descriptionStyle.addEventListener('change', (e) => {
      this.settings.descriptionStyle = e.target.value;
      SettingsManager.save(this.settings);
    });

    this.el.autoSpeakEngineMove.addEventListener('change', (e) => {
      this.settings.autoSpeakEngine = e.target.checked;
      SettingsManager.save(this.settings);
    });

    this.el.btnCloseNewGame.addEventListener('click', () => this.closeNewGameModal());
    this.el.btnChooseWhite.addEventListener('click', () => this.startNewGame('w'));
    this.el.btnChooseBlack.addEventListener('click', () => this.startNewGame('b'));

    this.el.newGameModal.addEventListener('click', (e) => {
      if (e.target === this.el.newGameModal) this.closeNewGameModal();
    });
  }
}

// Inicjalizacja aplikacji po załadowaniu DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!window.app) window.app = new MowoSzachyApp();
  });
} else {
  if (!window.app) window.app = new MowoSzachyApp();
}

export { MowoSzachyApp };
