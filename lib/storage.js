// AI Relay · storage.js
// Minimal chrome.storage.local wrapper.  Loaded as plain script from popup.

(function (global) {
  const KEY = 'airelay.sessions.v1';
  const MAX_SESSIONS = 20;

  function now() {
    return Date.now();
  }

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

  async function writeAll(map) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [KEY]: map }, () => resolve());
    });
  }

  async function appendMessage({ platform, convId, role, content, messageId }) {
    if (!platform || !role || !content) return;
    const map = await readAll();
    const key = sessionKey(platform, convId);
    const sess = map[key] || {
      platform,
      convId: convId || null,
      createdAt: now(),
      updatedAt: now(),
      messages: [],
    };
    // de-dup by messageId within this session (assistant streaming emits multiple times only across sessions)
    if (messageId) {
      const existingIdx = sess.messages.findIndex((m) => m.messageId === messageId);
      if (existingIdx !== -1) {
        sess.messages[existingIdx] = { role, content, messageId, ts: now() };
        sess.updatedAt = now();
        map[key] = sess;
        await writeAll(map);
        return;
      }
    } else {
      // without a stable id, skip exact-duplicate consecutive messages
      const last = sess.messages[sess.messages.length - 1];
      if (last && last.role === role && last.content === content) return;
    }
    sess.messages.push({ role, content, messageId: messageId || null, ts: now() });
    sess.updatedAt = now();
    map[key] = sess;

    // ring buffer: drop oldest sessions beyond MAX_SESSIONS
    const keys = Object.keys(map);
    if (keys.length > MAX_SESSIONS) {
      keys
        .sort((a, b) => (map[a].updatedAt || 0) - (map[b].updatedAt || 0))
        .slice(0, keys.length - MAX_SESSIONS)
        .forEach((k) => delete map[k]);
    }
    await writeAll(map);
  }

  async function getSession(platform, convId) {
    const map = await readAll();
    return map[sessionKey(platform, convId)] || null;
  }

  async function listRecent(n = 10) {
    const map = await readAll();
    return Object.values(map)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, n);
  }

  async function clearAll() {
    await writeAll({});
  }

  async function deleteSession(platform, convId) {
    const map = await readAll();
    const key = sessionKey(platform, convId);
    if (key in map) {
      delete map[key];
      await writeAll(map);
      return true;
    }
    return false;
  }

  async function deleteSessionByKey(key) {
    const map = await readAll();
    if (key in map) {
      delete map[key];
      await writeAll(map);
      return true;
    }
    return false;
  }

  global.AIRelayStorage = {
    appendMessage,
    getSession,
    listRecent,
    clearAll,
    deleteSession,
    deleteSessionByKey,
    sessionKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
