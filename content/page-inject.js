// AI Relay · page-inject.js
// Runs in PAGE context. Patches fetch to capture AI conversations.
// All protocol parsing lives in lib/parsers.js (window.AIRelayParsers),
// injected before this script — this file only handles URL routing,
// request-body extraction and stream teeing.
// CRITICAL: Must not degrade page performance. Only intercept targeted URLs.

(function () {
  if (window.__AI_RELAY_INJECTED__) return;
  window.__AI_RELAY_INJECTED__ = true;

  const P = window.AIRelayParsers;
  if (!P) {
    document.documentElement?.setAttribute('data-airelay-page', 'parser-missing');
    console.error('[AI Relay] interceptor failed: AIRelayParsers is unavailable');
    return;
  }

  document.documentElement?.setAttribute('data-airelay-page', 'active');
  console.info('[AI Relay] page interceptor active');

  let CAPTURE_ENABLED = document.documentElement?.dataset?.airelayCapture === 'on';
  let DEBUG = document.documentElement?.dataset?.airelayDebug === 'on';
  function dbg(...args) {
    if (DEBUG) try { console.log('[AI Relay]', ...args); } catch {}
  }

  window.addEventListener('airelay:config', (event) => {
    CAPTURE_ENABLED = !!event.detail?.captureEnabled;
    DEBUG = !!event.detail?.debugEnabled;
    dbg('debug logging enabled');
  });

  function isCaptureEnabled() {
    return CAPTURE_ENABLED || document.documentElement?.dataset?.airelayCapture === 'on';
  }

  const EVENT_CAPTURE = 'airelay:capture';
  const EVENT_HISTORY = 'airelay:history';

  const host = location.hostname;
  const PLATFORM = host.includes('chatgpt.com') ? 'chatgpt'
    : host.includes('claude.ai') ? 'claude'
    : host.includes('grok.com') ? 'grok'
    : host.includes('gemini.google.com') ? 'gemini'
    : null;
  if (!PLATFORM) return;

  dbg(`platform=${PLATFORM}, patching fetch...`);

  // ---- URL matchers ----

  const STREAM_RE = PLATFORM === 'chatgpt'
    ? /\/backend-(api|anon)\/(f\/)?conversation(\?|$)/
    : PLATFORM === 'claude'
    ? /\/chat_conversations\/[^/]+\/completion/
    : PLATFORM === 'grok'
    ? /\/rest\/app-chat\/conversations\/(new|[^/]+\/responses)/
    : /\/_\/BardChatUi\/data\/assistant\.lamda\.BardFrontendService\/StreamGenerate/;

  const HISTORY_RE = PLATFORM === 'chatgpt'
    ? /\/backend-(api|anon)\/(f\/)?conversation\/[a-f0-9-]{20,}$/
    : PLATFORM === 'claude'
    ? /\/chat_conversations\/[^/]+$/
    : PLATFORM === 'grok'
    ? /\/conversations\/[a-f0-9-]+\/load-responses/
    : /\/_\/BardChatUi\/data\/batchexecute/;

  function isStreamUrl(url) { return STREAM_RE.test(url); }

  function isHistoryUrl(url) {
    const path = url.split('?')[0];
    if (PLATFORM === 'claude' && path.endsWith('/completion')) return false;
    return HISTORY_RE.test(path);
  }

  function extractConvId(url) {
    if (PLATFORM === 'claude') {
      const m = url.match(/chat_conversations\/([^/?]+)/);
      return m ? m[1] : null;
    }
    if (PLATFORM === 'grok') {
      const m = url.match(/\/(?:conversations|c)\/([a-f0-9-]+)/);
      return m ? m[1] : null;
    }
    if (PLATFORM === 'gemini') {
      // Gemini conversation IDs are not in the URL path — they live inside
      // the BatchExecute payload. Stream parser extracts them from response.
      return null;
    }
    const m = url.match(/\/conversation\/([a-f0-9-]{20,})/);
    return m ? m[1] : null;
  }

  // ---- Dispatch ----

  function emit(detail) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_CAPTURE, { detail }));
      dbg('capture', detail.role, `${(detail.content || '').length} chars`);
    } catch {}
  }

  function emitHistory(detail) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_HISTORY, { detail }));
      dbg('history', detail.messages?.length, 'msgs');
    } catch {}
  }

  // ---- Request-body helpers ----
  // Only read string/ArrayBuffer/URLSearchParams bodies. Never consume
  // ReadableStream bodies — that would break the real fetch.

  function tryParseBody(init) {
    if (!init?.body) return null;
    try {
      if (typeof init.body === 'string') return JSON.parse(init.body);
      if (init.body instanceof ArrayBuffer)
        return JSON.parse(new TextDecoder().decode(init.body));
    } catch {}
    return null;
  }

  // Gemini POST bodies come as form-urlencoded `f.req=<URL-encoded JSON>`;
  // the string is handed to parsers.extractUserFromGeminiBody as-is.
  function tryReadGeminiBody(init) {
    if (!init?.body) return null;
    try {
      if (typeof init.body === 'string') return init.body;
      if (init.body instanceof ArrayBuffer) return new TextDecoder().decode(init.body);
      if (typeof URLSearchParams !== 'undefined' && init.body instanceof URLSearchParams)
        return init.body.toString();
      if (typeof init.body.toString === 'function') return init.body.toString();
    } catch {}
    return null;
  }

  function extractUser(init) {
    if (PLATFORM === 'gemini') {
      const bodyStr = tryReadGeminiBody(init);
      return bodyStr ? P.extractUserFromGeminiBody(bodyStr) : null;
    }
    const body = tryParseBody(init);
    if (!body) return null;
    return PLATFORM === 'chatgpt' ? P.extractUserFromChatGPTBody(body)
      : PLATFORM === 'claude' ? P.extractUserFromClaudeBody(body)
      : P.extractUserFromGrokBody(body);
  }

  // ---- Stream collector ----
  // Buffers the full response text and parses once on finish. Per-response
  // payloads are at most a few hundred KB, and parsing off the complete text
  // keeps this file on the exact same code path as the Node test suite.

  function makeStreamCollector(urlConvId, pendingUser) {
    let text = '';
    let flushed = false;

    return {
      feed(chunk) { text += chunk; },
      finish() {
        if (flushed) return;
        flushed = true;
        let result;
        try {
          result = PLATFORM === 'chatgpt' ? P.parseChatGPTSSE(text, urlConvId)
            : PLATFORM === 'claude' ? P.parseClaudeStream(text, urlConvId)
            : PLATFORM === 'grok' ? P.parseGrokStream(text, urlConvId)
            : P.parseGeminiStream(text, urlConvId);
        } catch {
          document.documentElement?.setAttribute('data-airelay-last-result', 'stream-error');
          return;
        }

        const convId = result.convId || urlConvId || null;
        if (pendingUser) {
          emit({ platform: PLATFORM, convId, role: 'user', content: pendingUser, done: true });
        }
        for (const m of result.messages) {
          emit({ ...m, convId: m.convId || convId });
        }
        document.documentElement?.setAttribute(
          'data-airelay-last-result',
          result.messages.length > 0 ? `stream:${result.messages.length}` : 'stream-empty'
        );
      },
    };
  }

  // ---- Transparent stream tee ----
  // Passes data through unchanged while feeding a copy to the collector.
  // Avoids response.clone() so the page consumes the stream at full speed.

  function teeStream(originalBody, collector) {
    const decoder = new TextDecoder();

    return new ReadableStream({
      async start(controller) {
        const bodyReader = originalBody.getReader();
        try {
          while (true) {
            const { value, done } = await bodyReader.read();
            if (done) {
              collector.finish();
              controller.close();
              break;
            }
            controller.enqueue(value);
            try {
              const text = decoder.decode(value, { stream: true });
              collector.feed(text);
            } catch {}
          }
        } catch (err) {
          try { collector.finish(); } catch {}
          controller.error(err);
        }
      },
      cancel() {
        try { collector.finish(); } catch {}
      }
    });
  }

  // ---- fetch patch ----

  const origFetch = window.fetch.bind(window);
  const observedPostPaths = [];

  function recordPostRequest(url, transport) {
    if (PLATFORM !== 'gemini' && PLATFORM !== 'grok') return;
    try {
      const path = new URL(url, location.href).pathname;
      const entry = `${transport}:${path}`;
      if (!observedPostPaths.includes(entry)) {
        observedPostPaths.push(entry);
        if (observedPostPaths.length > 30) observedPostPaths.shift();
        document.documentElement?.setAttribute('data-airelay-posts', JSON.stringify(observedPostPaths));
        if (PLATFORM === 'gemini') {
          document.documentElement?.setAttribute(
            'data-airelay-gemini-posts',
            JSON.stringify(observedPostPaths.map((item) => item.replace(/^(?:fetch|xhr):/, '')))
          );
        }
      }
    } catch {}
  }

  function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input
      : input instanceof Request ? input.url : String(input);

    const method = ((init?.method) || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (!isCaptureEnabled()) return origFetch(input, init);

    if (method === 'POST') recordPostRequest(url, 'fetch');

    // Fast path: non-target URLs pass through with ZERO overhead
    const geminiRequestBody = PLATFORM === 'gemini' ? tryReadGeminiBody(init) : null;
    const isHistory = (method === 'GET' && isHistoryUrl(url))
      || (PLATFORM === 'grok' && method === 'POST' && /load-responses/.test(url))
      || (PLATFORM === 'gemini' && method === 'POST' && isHistoryUrl(url)
        && typeof geminiRequestBody === 'string' && geminiRequestBody.includes('hNvQHb'));
    const isStream = method === 'POST' && isStreamUrl(url);

    if (isHistory || isStream) {
      document.documentElement?.setAttribute('data-airelay-last-match', isHistory ? 'history' : 'stream');
    }

    if (!isHistory && !isStream) {
      return origFetch(input, init);
    }

    // ---- History load: parse response in background ----
    if (isHistory) {
      dbg('history-load');
      const p = origFetch(input, init);
      p.then(response => {
        const cloned = response.clone();
        // Gemini history is BatchExecute-encoded text, others are JSON
        const read = PLATFORM === 'gemini' ? cloned.text() : cloned.json();
        read.then(payload => {
          const msgs = PLATFORM === 'chatgpt' ? P.parseChatGPTHistory(payload)
            : PLATFORM === 'claude' ? P.parseClaudeHistory(payload)
            : PLATFORM === 'grok' ? P.parseGrokHistory(payload)
            : P.parseGeminiHistory(payload);
          if (msgs.length > 0) {
            const json = (payload && typeof payload === 'object') ? payload : {};
            emitHistory({
              platform: PLATFORM,
              convId: extractConvId(url) || json.conversation_id || json.uuid || json.conversationId || null,
              title: json.title || json.name || null,
              messages: msgs,
            });
          }
        }).catch(() => {});
      }).catch(() => {});
      return p;
    }

    // ---- Stream intercept: tee the response body ----
    dbg('stream-intercept');

    const urlConvId = extractConvId(url);
    let pendingUser = null;
    const user = (input instanceof Request) ? null : extractUser(init);
    if (user) {
      const knownConvId = user.convId || urlConvId;
      if (knownConvId) {
        emit({ platform: PLATFORM, convId: knownConvId, role: 'user', content: user.content, done: true });
      } else {
        // convId unknown (new conversation) — emit together with the parsed
        // stream so user and assistant land in the same session.
        pendingUser = user.content;
      }
    }

    return origFetch(input, init).then(response => {
      if (!response.body) return response;

      const collector = makeStreamCollector(urlConvId, pendingUser);
      const newBody = teeStream(response.body, collector);
      return new Response(newBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    });
  }

  // Install once, but never block the page from replacing fetch later.
  // A getter/setter trap can form a recursion cycle when a page reads our
  // wrapper, builds its own wrapper around it, and assigns that wrapper back.
  // Capture may stop if a site fully replaces fetch; page availability wins.
  try {
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: patchedFetch,
    });
    dbg('fetch patched via defineProperty');
  } catch {
    try { window.fetch = patchedFetch; } catch {}
  }

  // ---- XMLHttpRequest patch (Gemini capture only) ----
  // Gemini switched its conversation transport away from window.fetch in the
  // current web client. Observe only the same two target RPC paths and leave
  // every other XHR completely untouched.

  if (PLATFORM === 'gemini' && window.XMLHttpRequest) {
    const xhrProto = window.XMLHttpRequest.prototype;
    const origOpen = xhrProto.open;
    const origSend = xhrProto.send;
    const xhrMeta = new WeakMap();

    function readXhrText(xhr) {
      try {
        if (!xhr.responseType || xhr.responseType === 'text') return xhr.responseText || '';
        if (typeof xhr.response === 'string') return xhr.response;
        if (xhr.response instanceof ArrayBuffer) return new TextDecoder().decode(xhr.response);
      } catch {}
      return '';
    }

    function extractGeminiHistoryConvId(text) {
      try {
        const envelopes = P.parseGeminiBatchExecute(text);
        for (const env of envelopes) {
          if (env.rpcId && env.rpcId !== 'hNvQHb') continue;
          const turns = env.data?.[0];
          if (!Array.isArray(turns)) continue;
          for (const turn of turns) {
            const convId = turn?.[0]?.[0];
            if (typeof convId === 'string' && convId) return convId;
          }
        }
      } catch {}
      return null;
    }

    xhrProto.open = function(method, url) {
      xhrMeta.set(this, {
        method: String(method || 'GET').toUpperCase(),
        url: String(url || ''),
      });
      return origOpen.apply(this, arguments);
    };

    xhrProto.send = function(body) {
      const meta = xhrMeta.get(this) || { method: 'GET', url: '' };
      if (!isCaptureEnabled()) return origSend.apply(this, arguments);
      if (meta.method === 'POST') recordPostRequest(meta.url, 'xhr');

      const isHistory = meta.method === 'POST' && isHistoryUrl(meta.url)
        && typeof body === 'string' && body.includes('hNvQHb');
      const isStream = meta.method === 'POST' && isStreamUrl(meta.url);
      if (isHistory || isStream) {
        const route = isHistory ? 'history-xhr' : 'stream-xhr';
        document.documentElement?.setAttribute('data-airelay-last-match', route);
        dbg(route);

        const user = isStream ? extractUser({ body }) : null;
        this.addEventListener('loadend', () => {
          const text = readXhrText(this);
          if (!text) {
            document.documentElement?.setAttribute('data-airelay-last-result', `${route}-empty-response`);
            return;
          }

          if (isHistory) {
            let messages = [];
            try { messages = P.parseGeminiHistory(text); } catch {}
            const convId = extractGeminiHistoryConvId(text);
            if (messages.length > 0 && convId) {
              emitHistory({ platform: PLATFORM, convId, title: null, messages });
            }
            document.documentElement?.setAttribute(
              'data-airelay-last-result',
              messages.length > 0 ? `history:${messages.length}` : 'history-empty'
            );
            return;
          }

          let result;
          try { result = P.parseGeminiStream(text, null); } catch {}
          if (!result) {
            document.documentElement?.setAttribute('data-airelay-last-result', 'stream-error');
            return;
          }
          const convId = result.convId || null;
          if (user) emit({ platform: PLATFORM, convId, role: 'user', content: user.content, done: true });
          for (const message of result.messages) {
            emit({ ...message, convId: message.convId || convId });
          }
          document.documentElement?.setAttribute(
            'data-airelay-last-result',
            result.messages.length > 0 ? `stream:${result.messages.length}` : 'stream-empty'
          );
        }, { once: true });
      }

      return origSend.apply(this, arguments);
    };

    console.info(`[AI Relay] ${PLATFORM} XHR observer active`);
  }

  // ---- WebSocket observer (Grok capture) ----
  // Current Grok no longer sends chat traffic through window.fetch or XHR.
  // Debug mode logs each event type once; frame contents are never logged.

  if (PLATFORM === 'grok' && window.WebSocket) {
    const NativeWebSocket = window.WebSocket;
    const observedWsPaths = [];
    const observedWsEventTypes = new Set();
    const grokWsAccumulator = P.makeGrokWsAccumulator(extractConvId(location.href));

    function handleGrokWsFrame(direction, text) {
      let result;
      try { result = grokWsAccumulator.push(text, direction); } catch { return; }
      for (const message of result.messages) emit(message);
      if (result.messages.some((message) => message.role === 'assistant')) {
        document.documentElement?.setAttribute('data-airelay-last-result', 'websocket:1');
      }
    }

    function wsPath(url) {
      try {
        const parsed = new URL(String(url), location.href);
        return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
      } catch {
        return '(unparseable)';
      }
    }

    function recordWsConnection(url) {
      const path = wsPath(url);
      if (!observedWsPaths.includes(path)) {
        observedWsPaths.push(path);
        document.documentElement?.setAttribute('data-airelay-grok-websockets', JSON.stringify(observedWsPaths));
        dbg('grok-ws-open', path);
      }
    }

    function recordWsEventType(direction, text) {
      if (!DEBUG) return;
      try {
        const root = JSON.parse(text);
        let event = root?.event;
        if (typeof event === 'string') event = JSON.parse(event);
        const type = event?.type;
        if (typeof type !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,80}$/.test(type)) return;
        const key = `${direction}:${type}`;
        if (observedWsEventTypes.has(key)) return;
        observedWsEventTypes.add(key);
        dbg('grok-ws-event', direction, type);
      } catch {}
    }

    async function processWsFrame(direction, data) {
      if (!isCaptureEnabled()) return;
      let text = '';
      try {
        if (typeof data === 'string') text = data;
        else if (data instanceof ArrayBuffer) {
          text = new TextDecoder().decode(data);
        } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
          text = await data.text();
        }
      } catch {}
      if (!text) return;
      handleGrokWsFrame(direction, text);
      recordWsEventType(direction, text);
    }

    class AIRelayWebSocket extends NativeWebSocket {
      constructor(url, protocols) {
        if (protocols === undefined) super(url);
        else super(url, protocols);
        recordWsConnection(url);
        this.addEventListener('message', (event) => { void processWsFrame('in', event.data); });
      }

      send(data) {
        void processWsFrame('out', data);
        return super.send(data);
      }
    }

    window.WebSocket = AIRelayWebSocket;
    console.info('[AI Relay] Grok WebSocket observer active');
  }
})();
