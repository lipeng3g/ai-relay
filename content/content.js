// AI Relay · content script (isolated world)
// Responsibilities:
//   1. Inject page-inject.js into the page context (so it can patch fetch).
//   2. Listen for 'airelay:capture' CustomEvents from the page.
//   3. Persist captured messages to chrome.storage.local.
//
// Core session logic lives in lib/session-store.js (shared with tests).
// This file wires that logic to chrome.storage and DOM events.

(function () {
  // --- Check capture toggle before injecting ---
  function injectPageScript() {
    try {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('content/page-inject.js');
      s.async = false;
      (document.head || document.documentElement).appendChild(s);
      s.onload = () => s.remove();
    } catch (e) {
      // ignore — fetch-proxy based capture won't work but extension UI still loads
    }
  }

  chrome.storage.local.get(['airelay.captureEnabled'], (res) => {
    if (res['airelay.captureEnabled']) {
      injectPageScript();
    }
  });

  // --- Storage I/O (chrome.storage.local) ---
  const STORAGE_KEY = 'airelay.sessions.v1';
  const MAX_SESSIONS = 20;

  function readAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => resolve(res[STORAGE_KEY] || {}));
    });
  }
  function writeAll(map) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: map }, resolve);
    });
  }

  // --- Session logic (mirrored in lib/session-store.js for testability) ---

  function sessionKey(platform, convId) {
    return `${platform}::${convId || 'default'}`;
  }

  function trimSessions(map) {
    const keys = Object.keys(map);
    if (keys.length > MAX_SESSIONS) {
      keys
        .sort((a, b) => (map[a].updatedAt || 0) - (map[b].updatedAt || 0))
        .slice(0, keys.length - MAX_SESSIONS)
        .forEach((k) => delete map[k]);
    }
  }

  function applyCapture(map, detail, meta) {
    if (!detail || !detail.platform || !detail.role || !detail.content) return map;
    const { platform, convId, role, content, messageId } = detail;
    const key = sessionKey(platform, convId);

    if (convId) {
      const defaultKey = sessionKey(platform, null);
      const orphan = map[defaultKey];
      if (orphan && orphan.messages?.length > 0 && !map[key]) {
        map[key] = { ...orphan, convId, updatedAt: Date.now() };
        delete map[defaultKey];
      } else if (orphan) {
        delete map[defaultKey];
      }
    }

    const sess = map[key] || {
      platform,
      convId: convId || null,
      url: meta?.url || '',
      title: meta?.title || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };

    if (messageId) {
      const idx = sess.messages.findIndex((m) => m.messageId === messageId);
      if (idx !== -1) {
        sess.messages[idx] = { role, content, messageId, ts: Date.now() };
        sess.updatedAt = Date.now();
        map[key] = sess;
        return map;
      }
    } else {
      const last = sess.messages[sess.messages.length - 1];
      if (last && last.role === role && last.content === content && !last.messageId) return map;
    }

    sess.messages.push({ role, content, messageId: messageId || null, ts: Date.now() });
    sess.updatedAt = Date.now();
    if (meta?.url) sess.url = meta.url;
    if (meta?.title) sess.title = meta.title;
    map[key] = sess;

    trimSessions(map);
    return map;
  }

  function applyHistory(map, detail, meta) {
    if (!detail || !detail.platform || !detail.convId || !Array.isArray(detail.messages)) return map;
    if (detail.messages.length === 0) return map;

    const { platform, convId, messages, title } = detail;
    const key = sessionKey(platform, convId);
    const existing = map[key];

    const incoming = messages.map((m) => ({
      role: m.role,
      content: m.content,
      messageId: m.messageId || null,
      ts: Date.now(),
    }));

    let merged = incoming;

    if (existing && existing.messages.length > 0) {
      const incomingIds = new Set(incoming.filter((m) => m.messageId).map((m) => m.messageId));
      const incomingFingerprints = new Set(
        incoming.map((m) => m.role + '::' + (m.content || '').slice(0, 200))
      );

      const extras = [];
      for (const m of existing.messages) {
        if (m.messageId && incomingIds.has(m.messageId)) continue;
        const fp = m.role + '::' + (m.content || '').slice(0, 200);
        if (incomingFingerprints.has(fp)) continue;
        extras.push(m);
      }

      if (extras.length > 0) {
        merged = [...incoming, ...extras];
      }
    }

    map[key] = {
      platform,
      convId,
      url: meta?.url || '',
      title: title || meta?.title || '',
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
      messages: merged,
    };

    trimSessions(map);
    return map;
  }

  // --- Async wrappers that read/write chrome.storage ---

  async function handleCapture(detail) {
    const map = await readAll();
    const meta = { url: location.href, title: document.title };
    const updated = applyCapture(map, detail, meta);
    if (updated) await writeAll(updated);
  }

  async function handleHistory(detail) {
    const map = await readAll();
    const meta = { url: location.href, title: document.title };
    const updated = applyHistory(map, detail, meta);
    if (updated) await writeAll(updated);
  }

  window.addEventListener('airelay:capture', (ev) => {
    handleCapture(ev.detail).catch(() => {});
  });
  window.addEventListener('airelay:history', (ev) => {
    handleHistory(ev.detail).catch(() => {});
  });
})();
