// AI Relay · session-store.js
// Pure-logic session management (no DOM/chrome APIs).
// Used by content.js at runtime and by tests directly.

const MAX_SESSIONS = 20;

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

function handleCapture(map, detail, meta) {
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

  // Retry handling: consecutive assistant messages → replace last one
  const last = sess.messages[sess.messages.length - 1];
  if (last && last.role === role && role === 'assistant') {
    sess.messages[sess.messages.length - 1] = { role, content, messageId: messageId || null, ts: Date.now() };
  } else {
    sess.messages.push({ role, content, messageId: messageId || null, ts: Date.now() });
  }
  sess.updatedAt = Date.now();
  if (meta?.url) sess.url = meta.url;
  if (meta?.title) sess.title = meta.title;
  map[key] = sess;

  trimSessions(map);
  return map;
}

function handleHistory(map, detail, meta) {
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sessionKey, trimSessions, handleCapture, handleHistory, MAX_SESSIONS };
}
