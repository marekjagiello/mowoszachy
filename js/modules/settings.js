/**
 * js/modules/settings.js
 * Zarządzanie trwałym zapisem ustawień użytkownika w localStorage oraz migracja wersji
 */

import { DEFAULT_SETTINGS } from './constants.js';
import { remoteLog } from './logger.js';

const SETTINGS_KEY = 'mowoszachy_settings';

export class SettingsManager {
  static load() {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.settingsVersion !== 5) {
          parsed.boardBgOpacity = 50;
          if (parsed.pieceGlowWhiteSize === undefined) parsed.pieceGlowWhiteSize = 5;
          if (parsed.pieceGlowWhiteOpacity === undefined) parsed.pieceGlowWhiteOpacity = 85;
          if (parsed.pieceGlowBlackSize === undefined) parsed.pieceGlowBlackSize = 5;
          if (parsed.pieceGlowBlackOpacity === undefined) parsed.pieceGlowBlackOpacity = 85;
          if (!parsed.botName) parsed.botName = 'Janusz';
          if (parsed.engineElo === undefined) parsed.engineElo = 1500;
          if (parsed.engineDepth === undefined) parsed.engineDepth = 10;
          parsed.settingsVersion = 5;
        }
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      remoteLog('WARN', 'Could not load settings: ' + e.message);
    }
    return { ...DEFAULT_SETTINGS };
  }

  static save(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      remoteLog('WARN', 'Could not save settings: ' + e.message);
    }
  }
}
