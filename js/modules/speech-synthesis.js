/**
 * js/modules/speech-synthesis.js
 * Synteza mowy w języku polskim (Web Speech API - SpeechSynthesis)
 */

import { remoteLog } from './logger.js';

export class SpeechSynthesizer {
  constructor(options = {}) {
    this.isSpeaking = false;
    this.currentVoice = null;
    this.voices = [];
    this.rate = options.rate || 1.0;
    this.onStart = options.onStart || null;
    this.onEnd = options.onEnd || null;
    this.onVoicesChanged = options.onVoicesChanged || null;
  }

  isSupported() {
    return 'speechSynthesis' in window;
  }

  init(savedVoiceIndex = -1) {
    if (!this.isSupported()) return;

    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      if (!allVoices || allVoices.length === 0) return;

      this.voices = allVoices;
      const plVoices = allVoices.filter(v => v.lang.startsWith('pl') || v.lang.includes('PL'));
      const activeList = plVoices.length > 0 ? plVoices : allVoices;

      if (savedVoiceIndex >= 0 && activeList[savedVoiceIndex]) {
        this.currentVoice = activeList[savedVoiceIndex];
      } else {
        this.currentVoice = plVoices.length > 0 ? plVoices[0] : (allVoices[0] || null);
      }

      if (this.onVoicesChanged) {
        this.onVoicesChanged(activeList, this.currentVoice);
      }
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  setVoice(voice) {
    this.currentVoice = voice;
  }

  setRate(rate) {
    this.rate = parseFloat(rate) || 1.0;
  }

  cancel() {
    if (this.isSupported()) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
  }

  speak(text, priority = false, onComplete = null) {
    if (!this.isSupported()) {
      if (this.onStart) this.onStart(text);
      if (this.onEnd) this.onEnd();
      if (onComplete) onComplete();
      return;
    }

    if (priority || window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    this.isSpeaking = true;
    if (this.onStart) this.onStart(text);

    const utterance = new SpeechSynthesisUtterance(text);
    if (this.currentVoice) utterance.voice = this.currentVoice;
    utterance.lang = this.currentVoice ? this.currentVoice.lang : 'pl-PL';
    utterance.rate = this.rate;
    utterance.pitch = 1.0;

    let finished = false;
    const finishSpeech = () => {
      if (finished) return;
      finished = true;
      this.isSpeaking = false;
      if (this.onEnd) this.onEnd();
      if (onComplete) onComplete();
    };

    utterance.onend = finishSpeech;
    utterance.onerror = (e) => {
      remoteLog('WARN', 'Speech error: ' + (e.error || 'unknown'));
      finishSpeech();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      remoteLog('WARN', 'Speech speak exception: ' + e.message);
      finishSpeech();
    }
  }
}
