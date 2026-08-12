// AICarry · session-store.js
// Pure-logic session management (no DOM/chrome APIs).
// Loaded as a content script before content.js at runtime; required by tests in Node.

(function (exports) {
  const MAX_SESSIONS = 20;

  function sessionKey(platform, convId) {
    return `${platform}::${convId || 'default'}`;
  }

  function isGeminiTransportArtifact(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    return /^![A-Za-z0-9_-]{20,}$/.test(text)
      || /^[0-9a-f]{24,}$/i.test(text)
      || /^(?:c_|r_|rc_)[A-Za-z0-9_-]{8,}$/.test(text)
      || (/^[A-Za-z0-9_-]{32,}$/.test(text) && !/[\s\u3400-\u9fff]/.test(text));
  }

  function findGeminiPrompt(node) {
    let bestNatural = { text: '', depth: -1 };
    let bestFallback = { text: '', depth: -1 };
    const stack = [{ value: node, depth: 0 }];

    while (stack.length) {
      const { value, depth } = stack.pop();
      if (value == null) continue;
      if (typeof value === 'string') {
        const text = value.trim();
        if (!text) continue;
        if ((text.startsWith('[') && text.endsWith(']'))
          || (text.startsWith('{') && text.endsWith('}'))) {
          try {
            stack.push({ value: JSON.parse(text), depth: depth + 1 });
            continue;
          } catch {}
        }
        if (isGeminiTransportArtifact(text)) continue;
        const naturalLanguage = /[\s\u3400-\u9fff]/.test(text);
        const current = naturalLanguage ? bestNatural : bestFallback;
        if (depth > current.depth || (depth === current.depth && text.length > current.text.length)) {
          const candidate = { text, depth };
          if (naturalLanguage) bestNatural = candidate;
          else bestFallback = candidate;
        }
        continue;
      }
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) {
          stack.push({ value: value[i], depth: depth + 1 });
        }
        continue;
      }
      if (typeof value === 'object') {
        for (const child of Object.values(value)) {
          stack.push({ value: child, depth: depth + 1 });
        }
      }
    }

    return bestNatural.text || bestFallback.text;
  }

  function normalizeGeminiUserText(value) {
    const text = String(value || '').trim();
    if (!text || isGeminiTransportArtifact(text)) return '';
    if ((text.startsWith('[') && text.endsWith(']'))
      || (text.startsWith('{') && text.endsWith('}'))) {
      const extracted = findGeminiPrompt(text);
      if (extracted && !isGeminiTransportArtifact(extracted)) return extracted;
    }
    return text;
  }

  function normalizeMessage(platform, message) {
    if (!message?.role || !message?.content) return null;
    let content = message.content;
    if (platform === 'gemini') {
      content = message.role === 'user' ? normalizeGeminiUserText(content) : content;
      if (!content || isGeminiTransportArtifact(content)) return null;
    }
    return { ...message, content };
  }

  function sameMessageIdentity(left, right) {
    if (!left || !right || left.role !== right.role) return false;
    if (left.messageId && right.messageId) return left.messageId === right.messageId;
    return !left.messageId && !right.messageId && left.content === right.content;
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
    const normalized = normalizeMessage(detail.platform, detail);
    if (!normalized) return map;
    const { platform, convId, role, content, messageId } = normalized;
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

    const { platform, convId, messages, title } = detail;
    const key = sessionKey(platform, convId);
    const existing = map[key];

    const incoming = messages
      .map((message) => normalizeMessage(platform, message))
      .filter(Boolean)
      .map((m) => ({
        role: m.role,
        content: m.content,
        messageId: m.messageId || null,
        ts: Date.now(),
      }));

    if (incoming.length === 0) {
      if (existing && platform === 'gemini') {
        const cleaned = existing.messages
          .map((message) => normalizeMessage(platform, message))
          .filter(Boolean);
        if (cleaned.length !== existing.messages.length
          || cleaned.some((message, index) => message.content !== existing.messages[index]?.content)) {
          map[key] = { ...existing, messages: cleaned, updatedAt: Date.now() };
        }
      }
      return map;
    }

    let merged = incoming;

    if (existing && existing.messages.length > 0) {
      const normalizedExisting = existing.messages
        .map((message) => normalizeMessage(platform, message))
        .filter(Boolean);
      const incomingIsExistingPrefix = incoming.length <= normalizedExisting.length
        && incoming.every((message, index) => sameMessageIdentity(message, normalizedExisting[index]));

      // A stale history response is an exact prefix of locally captured live
      // messages, so keep only that trailing live tail. If the sequences
      // diverge mid-conversation, the user switched/edited a branch and the
      // incoming active history is authoritative; old-branch messages must
      // not be appended to relay context.
      if (incomingIsExistingPrefix && normalizedExisting.length > incoming.length) {
        merged = [...incoming, ...normalizedExisting.slice(incoming.length)];
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

  exports.sessionKey = sessionKey;
  exports.trimSessions = trimSessions;
  exports.handleCapture = handleCapture;
  exports.handleHistory = handleHistory;
  exports.isGeminiTransportArtifact = isGeminiTransportArtifact;
  exports.normalizeGeminiUserText = normalizeGeminiUserText;
  exports.MAX_SESSIONS = MAX_SESSIONS;
})(typeof module !== 'undefined' ? module.exports : (globalThis.AIRelaySessionStore = {}));
