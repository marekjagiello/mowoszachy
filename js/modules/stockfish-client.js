/**
 * js/modules/stockfish-client.js
 * Klient Web Worker silnika szachowego Stockfish.js wg protokołu UCI
 */

import { getSkillLevelFromElo } from './constants.js';
import { remoteLog } from './logger.js';

export class StockfishClient {
  constructor(options = {}) {
    this.worker = null;
    this.isReady = false;
    this.isThinking = false;
    this.pendingAction = null;
    this.onReadyCallback = null;
    this.latestEval = null;

    this.onReady = options.onReady || (() => {});
    this.onEval = options.onEval || (() => {});
    this.onBestMove = options.onBestMove || (() => {});
    this.onError = options.onError || (() => {});

    this.init();
  }

  init() {
    try {
      this.worker = new Worker('js/vendor/stockfish.js');
      this.worker.onmessage = (e) => this.handleMessage(e.data);
      this.worker.postMessage('uci');
      this.worker.postMessage('isready');
    } catch (e) {
      remoteLog('ERROR', 'Failed to load Stockfish worker: ' + e.message);
      this.onError('Nie udało się załadować silnika szachowego Stockfish.');
    }
  }

  handleMessage(line) {
    if (typeof line !== 'string') return;

    if (line === 'readyok' || line.includes('id name Stockfish')) {
      this.isReady = true;

      if (typeof this.onReadyCallback === 'function') {
        const cb = this.onReadyCallback;
        this.onReadyCallback = null;
        cb();
      }

      this.onReady();
    }

    // Parsowanie ewaluacji
    if (line.startsWith('info') && line.includes('score')) {
      const cpMatch = line.match(/score cp (-?\d+)/);
      const mateMatch = line.match(/score mate (-?\d+)/);
      if (cpMatch) {
        const cp = parseInt(cpMatch[1], 10);
        this.latestEval = { type: 'cp', cp };
        this.onEval(this.latestEval);
      } else if (mateMatch) {
        const mate = parseInt(mateMatch[1], 10);
        this.latestEval = { type: 'mate', mate };
        this.onEval(this.latestEval);
      }
    }

    // Najlepszy ruch znaleziony przez silnik
    if (line.startsWith('bestmove')) {
      this.isThinking = false;
      const parts = line.split(' ');
      const moveStr = parts[1];
      const action = this.pendingAction;
      this.pendingAction = null;

      this.onBestMove(moveStr, action);
    }
  }

  applyStrength(elo = 1500, depth = 10) {
    if (!this.worker) return;
    const skillLevel = getSkillLevelFromElo(elo);
    try {
      this.worker.postMessage(`setoption name Skill Level value ${skillLevel}`);
      this.worker.postMessage(`setoption name UCI_LimitStrength value ${elo < 2800 ? 'true' : 'false'}`);
      this.worker.postMessage(`setoption name UCI_Elo value ${elo}`);
      remoteLog('INFO', `Engine strength set to ELO ${elo} (Skill Level ${skillLevel}/20, Depth ${depth})`);
    } catch (e) {
      remoteLog('WARN', 'Failed to apply engine strength: ' + e.message);
    }
  }

  stopAndQueue(callback) {
    if (!this.isReady) return;
    if (this.isThinking) {
      this.onReadyCallback = callback;
      this.worker.postMessage('stop');
      this.worker.postMessage('isready');
    } else {
      callback();
    }
  }

  search(fen, depth, action) {
    if (!this.isReady || !this.worker) return;
    this.stopAndQueue(() => {
      this.isThinking = true;
      this.pendingAction = action;
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
  }

  newGame() {
    if (!this.isReady || !this.worker) return;
    this.worker.postMessage('ucinewgame');
  }

  stop() {
    if (this.worker && this.isThinking) {
      this.worker.postMessage('stop');
      this.isThinking = false;
      this.pendingAction = null;
    }
  }
}
