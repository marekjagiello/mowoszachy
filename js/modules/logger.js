/**
 * js/modules/logger.js
 * Zdalne logowanie błędów i zdarzeń diagnostycznych do lokalnego endpointu /api/log
 */

export function remoteLog(type, message, stack = '') {
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, message, stack })
  }).catch(() => {});
}

export function initGlobalErrorLogging() {
  window.addEventListener('error', (e) => {
    remoteLog('ERROR', e.message || 'Window error', e.filename ? `${e.filename}:${e.lineno}` : '');
  });

  window.addEventListener('unhandledrejection', (e) => {
    remoteLog('ERROR', `Unhandled Promise Rejection: ${e.reason}`);
  });
}
