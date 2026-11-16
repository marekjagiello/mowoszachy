/**
 * js/modules/speech-rec.js
 * Rozpoznawanie mowy w języku polskim (Web Speech API) wraz z buforem oczekiwania na ruch
 */

import { extractBotCommand } from './speech-parser.js';
import { remoteLog } from './logger.js';

export class SpeechRecognizer {
  constructor(options = {}) {
    this.recognition = null;
    this.isListening = false;
    this.isListeningRequested = false;
    this.isTemporarilyPausedForTTS = false;
    this.wakeWordArmedUntil = 0;

    // Bufor akumulacji mowy i timer oczekiwania
    this.pendingVoiceTimer = null;
    this.pendingVoiceBuffer = '';
    this.isWaitingAfterWakeWord = false;
    this.restartListeningTimer = null;

    // Callbacks
    this.getBotName = options.getBotName || (() => 'Janusz');
    this.isGameOver = options.isGameOver || (() => false);
    this.isSpeaking = options.isSpeaking || (() => false);
    this.checkCommandValid = options.checkCommandValid || (() => false);
    this.onCommandReady = options.onCommandReady || (() => {});
    this.onWakeWordWaiting = options.onWakeWordWaiting || (() => {});
    this.onWakeWordPrompt = options.onWakeWordPrompt || (() => {});
    this.onThinkingAloud = options.onThinkingAloud || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onError = options.onError || (() => {});

    this.init();
  }

  isSupported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'pl-PL';
    this.recognition.continuous = true;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.isListening = true;
      const bot = this.getBotName();
      this.onStatusChange(true, `Słucham (hasło: «${bot}»)...`);
    };

    this.recognition.onresult = (event) => {
      const resultsLen = event.results.length;
      const lastResult = event.results[resultsLen - 1];
      const transcript = lastResult[0].transcript.trim();
      remoteLog('INFO', 'Speech recognized: ' + transcript);
      this.handleIncomingSpeech(transcript);
    };

    this.recognition.onerror = (event) => {
      remoteLog('WARN', 'Speech recognition error: ' + event.error);
      if (event.error === 'not-allowed') {
        this.isListeningRequested = false;
        this.stop();
        this.onError('Brak uprawnień do mikrofonu. Zezwól na dostęp w przeglądarce.');
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.restartListeningTimer) clearTimeout(this.restartListeningTimer);

      if (this.isListeningRequested && !this.isSpeaking() && !this.isTemporarilyPausedForTTS && !this.isGameOver()) {
        this.restartListeningTimer = setTimeout(() => {
          if (this.isListeningRequested && !this.isSpeaking() && !this.isTemporarilyPausedForTTS && !this.isGameOver()) {
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

      this.onStatusChange(false, 'Gotowy');
    };
  }

  start() {
    if (!this.recognition) return;
    this.isListeningRequested = true;
    try {
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

  stop() {
    this.isListeningRequested = false;
    if (this.restartListeningTimer) clearTimeout(this.restartListeningTimer);
    this.clearVoiceWaitTimer();
    if (!this.recognition) return;
    try {
      this.recognition.stop();
    } catch (e) {}
    this.isListening = false;
    this.onStatusChange(false, 'Gotowy');
  }

  toggle() {
    if (this.isListeningRequested || this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  pauseForTTS() {
    if (this.recognition && this.isListening) {
      this.isTemporarilyPausedForTTS = true;
      try { this.recognition.abort(); } catch (e) {}
    }
  }

  resumeAfterTTS() {
    if (this.isTemporarilyPausedForTTS) {
      this.isTemporarilyPausedForTTS = false;
      if (this.isListeningRequested && !this.isGameOver()) {
        setTimeout(() => {
          if (this.isListeningRequested && !this.isSpeaking() && !this.isGameOver()) {
            this.start();
          }
        }, 350);
      }
    }
  }

  clearVoiceWaitTimer() {
    if (this.pendingVoiceTimer) {
      clearTimeout(this.pendingVoiceTimer);
      this.pendingVoiceTimer = null;
    }
    this.pendingVoiceBuffer = '';
    this.isWaitingAfterWakeWord = false;
  }

  handleIncomingSpeech(raw) {
    if (!raw || !raw.trim()) return;

    const botName = this.getBotName();
    const trimmed = raw.trim();
    const { hasBotName, command } = extractBotCommand(trimmed, botName);

    // 1. Jeśli jesteśmy w trakcie buforowania po wcześniejszym wywołaniu bota
    if (this.isWaitingAfterWakeWord) {
      if (this.pendingVoiceTimer) clearTimeout(this.pendingVoiceTimer);

      const newPart = hasBotName ? command : trimmed;
      if (newPart) {
        this.pendingVoiceBuffer = (this.pendingVoiceBuffer + ' ' + newPart).trim();
      }

      remoteLog('INFO', `Voice buffer updated: "${this.pendingVoiceBuffer}"`);

      // Jeśli bufor tworzy już poprawny ruch lub komendę, wykonaj natychmiast
      if (this.checkCommandValid(this.pendingVoiceBuffer)) {
        const cmdToRun = this.pendingVoiceBuffer;
        this.clearVoiceWaitTimer();
        this.onCommandReady(cmdToRun);
        return;
      }

      // W przeciwnym razie czekamy kolejne 2.2s na dokończenie
      this.onWakeWordWaiting(botName);
      this.pendingVoiceTimer = setTimeout(() => {
        this.finishVoiceWait(botName);
      }, 2200);
      return;
    }

    // 2. Nowa wypowiedź bez hasła bota
    if (!hasBotName) {
      // Sprawdź czy bot jest uzbrojony (np. po wcześniejszym "Słucham! Jaki ruch?")
      if (Date.now() < this.wakeWordArmedUntil) {
        this.wakeWordArmedUntil = 0;

        if (this.checkCommandValid(trimmed)) {
          this.onCommandReady(trimmed);
          return;
        }

        // Zacznij akumulację
        this.isWaitingAfterWakeWord = true;
        this.pendingVoiceBuffer = trimmed;
        this.onWakeWordWaiting(botName);
        this.pendingVoiceTimer = setTimeout(() => {
          this.finishVoiceWait(botName);
        }, 2200);
        return;
      }

      // Gracz myśli na głos
      remoteLog('INFO', `Ignored thinking aloud (no wake word "${botName}"): "${raw}"`);
      this.onThinkingAloud(raw, botName);
      return;
    }

    // 3. Imię bota padło w bieżącej wypowiedzi
    if (this.pendingVoiceTimer) clearTimeout(this.pendingVoiceTimer);

    const cmd = (command || '').trim();

    // Jeśli całe polecenie zostało wypowiedziane na raz (np. "Janusz e4"), wykonaj od razu
    if (cmd && this.checkCommandValid(cmd)) {
      this.clearVoiceWaitTimer();
      this.onCommandReady(cmd);
      return;
    }

    // Jeśli padło tylko imię bota lub niepełny ruch, czekamy na odpowiedź gracza
    this.isWaitingAfterWakeWord = true;
    this.pendingVoiceBuffer = cmd;
    remoteLog('INFO', `Wake word "${botName}" detected. Waiting for user command (buffer: "${this.pendingVoiceBuffer}")...`);

    this.onWakeWordWaiting(botName);

    // 2.5 sekundy czasu na podanie ruchu
    this.pendingVoiceTimer = setTimeout(() => {
      this.finishVoiceWait(botName);
    }, 2500);
  }

  finishVoiceWait(botName) {
    this.pendingVoiceTimer = null;
    this.isWaitingAfterWakeWord = false;

    const buffer = (this.pendingVoiceBuffer || '').trim();
    this.pendingVoiceBuffer = '';

    if (!buffer) {
      // Gracz zawołał tylko imię bota i milczał
      remoteLog('INFO', 'Wake word timeout with empty buffer. Prompting user.');
      this.wakeWordArmedUntil = Date.now() + 10000;
      this.onWakeWordPrompt(botName);
      return;
    }

    remoteLog('INFO', `Processing buffered voice command: "${buffer}"`);
    this.onCommandReady(buffer);
  }
}
