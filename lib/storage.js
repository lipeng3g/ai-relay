// AICarry · storage.js
// Read-side chrome.storage.local wrapper for the side panel UI.
// Every mutation is routed through the background persistence queue so panel
// actions cannot race with capture writes from content scripts.

(function (global) {
  const KEY = 'airelay.sessions.v1';

  function sessionKey(platform, convId) {
    return `${platform}::${convId || 'default'}`;
  }

  async function readAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get([KEY], (res) => {
        resolve(res[KEY] || {});
      });
    });
  }

  async function requestMutation(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!response?.ok) reject(new Error(response?.error || 'Session mutation failed'));
        else resolve(response.result);
      });
    });
  }

  async function listRecent(n = 10) {
    const map = await readAll();
    return Object.values(map)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, n);
  }

  async function getSessionByKey(key) {
    if (!key) return null;
    const map = await readAll();
    return map[key] || null;
  }

  async function clearAll() {
    await requestMutation('airelay:clear-sessions');
  }

  async function deleteSessionByKey(key) {
    return Boolean(await requestMutation('airelay:delete-session', { key }));
  }

  global.AIRelayStorage = {
    listRecent,
    getSessionByKey,
    clearAll,
    deleteSessionByKey,
    sessionKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
