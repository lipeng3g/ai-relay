// AICarry · ui-helpers.js
// Pure UI data helpers shared by the Side Panel and Node tests.

(function (exports) {
  const PLATFORM_TITLE_SUFFIX = /\s+(?:[-|·]\s*)?(?:ChatGPT|Claude|Google\s+Gemini|Gemini|Grok)$/i;

  function truncate(text, maxLength) {
    if (!text) return '';
    const value = String(text).trim();
    return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
  }

  function firstUserMessage(session) {
    const message = session?.messages?.find((item) => item.role === 'user');
    return message?.content ? truncate(message.content, 80) : '';
  }

  function cleanKnownPlatformSuffix(title) {
    return String(title || '').trim().replace(PLATFORM_TITLE_SUFFIX, '').trim();
  }

  function sessionTitle(session, noTitle, maxLength) {
    const fallback = noTitle || '(untitled)';
    const limit = maxLength || 50;
    if (session?.title && !String(session.title).startsWith('http')) {
      const cleaned = cleanKnownPlatformSuffix(session.title);
      if (cleaned) return truncate(cleaned, limit);
    }
    return firstUserMessage(session) || fallback;
  }

  function normalizeConversationUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\/$/, '') || '/';
      return `${parsed.origin}${path}`;
    } catch {
      return String(url).split(/[?#]/)[0].replace(/\/$/, '');
    }
  }

  function urlHasConversationId(url, convId) {
    if (!url || !convId) return false;
    try {
      return new URL(url).pathname
        .split('/')
        .filter(Boolean)
        .some((segment) => decodeURIComponent(segment) === String(convId));
    } catch {
      return String(url).split(/[?#]/)[0].split('/').filter(Boolean).includes(String(convId));
    }
  }

  function findSessionForTab(sessions, tab, platform) {
    if (!platform || !tab?.url || !Array.isArray(sessions)) return null;
    const byConversationId = sessions.find((session) =>
      session.platform === platform && session.convId && urlHasConversationId(tab.url, session.convId)
    );
    if (byConversationId) return byConversationId;

    const tabUrl = normalizeConversationUrl(tab.url);
    return sessions.find((session) =>
      session.platform === platform && session.url && normalizeConversationUrl(session.url) === tabUrl
    ) || null;
  }

  function getSessionSourceUrl(session) {
    if (session?.url) return session.url;
    if (!session?.convId) return null;
    if (session.platform === 'chatgpt') return `https://chatgpt.com/c/${session.convId}`;
    if (session.platform === 'claude') return `https://claude.ai/chat/${session.convId}`;
    if (session.platform === 'grok') return `https://grok.com/c/${session.convId}`;
    if (session.platform === 'gemini') return `https://gemini.google.com/app/${session.convId}`;
    return null;
  }

  function isNewChatUrl(platform, url) {
    try {
      const path = new URL(url).pathname.replace(/\/$/, '') || '/';
      if (platform === 'chatgpt') return path === '/';
      if (platform === 'claude') return path === '/' || path === '/new';
      if (platform === 'gemini') return path === '/' || path === '/app';
      if (platform === 'grok') return path === '/';
    } catch {}
    return false;
  }

  function emptyStateKind({ captureEnabled, contentStatus, platform, url }) {
    if (!captureEnabled) return 'captureOff';
    if (!contentStatus?.injected) return 'notInjected';
    if (contentStatus.status === 'error') return 'error';
    if (isNewChatUrl(platform, url)) return 'newChat';
    return 'waiting';
  }

  function relayDestination(sourcePlatform, currentPlatform) {
    if (currentPlatform && currentPlatform !== sourcePlatform) {
      return { kind: 'current', platform: currentPlatform };
    }
    return { kind: 'choose', platform: null };
  }

  function filterSessions(sessions, { query = '', platform = 'all', noTitle = '(untitled)' } = {}) {
    const normalizedQuery = String(query).trim().toLocaleLowerCase();
    return (Array.isArray(sessions) ? sessions : []).filter((session) => {
      if (platform !== 'all' && session.platform !== platform) return false;
      if (normalizedQuery && !sessionTitle(session, noTitle).toLocaleLowerCase().includes(normalizedQuery)) return false;
      return true;
    });
  }

  function reconcileTransientSessions(sessionMap, state = {}) {
    const stored = sessionMap && typeof sessionMap === 'object' ? sessionMap : {};
    const sessionExists = (session) => {
      if (!session) return false;
      if (!session.platform || !session.convId) return true;
      return Boolean(stored[`${session.platform}::${session.convId}`]);
    };
    return {
      currentSession: sessionExists(state.currentSession) ? state.currentSession : null,
      relayTask: sessionExists(state.relayTask?.session) ? state.relayTask : null,
      previewContext: sessionExists(state.previewContext?.session) ? state.previewContext : null,
      detailSession: sessionExists(state.detailSession) ? state.detailSession : null,
    };
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function inlineMarkdown(value) {
    const code = [];
    let text = escapeHtml(value).replace(/`([^`]+)`/g, (_match, content) => {
      const token = `\u0000CODE${code.length}\u0000`;
      code.push(`<code>${content}</code>`);
      return token;
    });
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return text.replace(/\u0000CODE(\d+)\u0000/g, (_match, index) => code[Number(index)] || '');
  }

  function tableCells(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
  }

  function renderSafeMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const html = [];
    let listType = null;
    let orderedNext = null;
    let inCode = false;
    let codeLang = '';
    let codeLines = [];

    function closeList() {
      if (listType) html.push(`</${listType}>`);
      listType = null;
      orderedNext = null;
    }
    function flushCode() {
      const langClass = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : '';
      html.push(`<pre><code${langClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      codeLines = [];
      codeLang = '';
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fence = line.match(/^```\s*([\w+-]*)\s*$/);
      if (fence) {
        if (inCode) {
          flushCode();
          inCode = false;
        } else {
          closeList();
          inCode = true;
          codeLang = fence[1] || '';
        }
        continue;
      }
      if (inCode) {
        codeLines.push(line);
        continue;
      }
      if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
        closeList();
        const headers = tableCells(line);
        i += 1;
        const rows = [];
        while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim()) {
          rows.push(tableCells(lines[++i]));
        }
        html.push('<div class="md-table-wrap"><table><thead><tr>' + headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('') + '</tr></thead><tbody>' +
          rows.map((row) => '<tr>' + row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>');
        continue;
      }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = heading[1].length + 2;
        html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
        continue;
      }
      const unordered = line.match(/^\s*[-*]\s+(.+)$/);
      const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
      if (unordered || ordered) {
        const nextType = ordered ? 'ol' : 'ul';
        const orderedNumber = ordered ? Number(ordered[1]) : null;
        if (listType !== nextType || (ordered && orderedNext !== orderedNumber)) {
          closeList();
          listType = nextType;
          const start = orderedNumber !== null && orderedNumber !== 1 ? ` start="${orderedNumber}"` : '';
          html.push(`<${listType}${start}>`);
        }
        html.push(`<li>${inlineMarkdown(ordered ? ordered[2] : unordered[1])}</li>`);
        if (ordered) orderedNext = orderedNumber + 1;
        continue;
      }
      closeList();
      if (!line.trim()) html.push('<div class="md-gap"></div>');
      else html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
    closeList();
    if (inCode) flushCode();
    return html.join('');
  }

  exports.truncate = truncate;
  exports.firstUserMessage = firstUserMessage;
  exports.cleanKnownPlatformSuffix = cleanKnownPlatformSuffix;
  exports.sessionTitle = sessionTitle;
  exports.normalizeConversationUrl = normalizeConversationUrl;
  exports.urlHasConversationId = urlHasConversationId;
  exports.findSessionForTab = findSessionForTab;
  exports.getSessionSourceUrl = getSessionSourceUrl;
  exports.isNewChatUrl = isNewChatUrl;
  exports.emptyStateKind = emptyStateKind;
  exports.relayDestination = relayDestination;
  exports.filterSessions = filterSessions;
  exports.reconcileTransientSessions = reconcileTransientSessions;
  exports.escapeHtml = escapeHtml;
  exports.renderSafeMarkdown = renderSafeMarkdown;
})(typeof module !== 'undefined' ? module.exports : (window.AIRelayUIHelpers = {}));
