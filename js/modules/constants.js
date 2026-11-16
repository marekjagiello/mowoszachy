/**
 * js/modules/constants.js
 * Stałe, mapowania bierek oraz domyślne ustawienia gry
 */

export const PIECE_NAMES_PL = {
  p: 'pionek',
  n: 'skoczek',
  b: 'goniec',
  r: 'wieża',
  q: 'hetman',
  k: 'król'
};

export const PIECE_SYMBOLS = {
  p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
  P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔'
};

export const DEFAULT_SETTINGS = {
  gameMode: 'vs-engine',       // 'vs-engine' | 'analysis'
  playerColor: 'w',            // 'w' | 'b'
  botName: 'Janusz',           // Wake-word / bot name (np. "Janusz e4", "Janusz proponuję remis")
  autoEngineResponse: true,
  autoListenAfterEngine: false,
  soundAlert: true,
  autoFlipBoard: true,
  boardTheme: 'wood',          // 'wood' | 'zelda' | 'blue' | 'green'
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
  settingsVersion: 5
};

export function getEloCategory(elo) {
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

export function getSkillLevelFromElo(elo) {
  // Stockfish Skill Level ranges from 0 to 20
  // Elo 800 maps to Skill Level 0, Elo 2800 maps to Skill Level 20
  const clamped = Math.max(800, Math.min(2800, elo));
  return Math.round((clamped - 800) / 100);
}
