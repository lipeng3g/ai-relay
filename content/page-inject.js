// AI Relay · page-inject.js
// Runs in PAGE context (not extension isolated world).
// Monkey-patches window.fetch to capture ChatGPT / Claude conversation streams
// without interfering with the original response. Emits CustomEvents that
// the isolated content script listens to.

(function () {
  if (window.__AI_RELAY_INJECTED__) return;
  window.__AI_RELAY_INJECTED__ = true;

  // Debug logging. Toggle via localStorage.setItem('airelay.debug', '1') on the page.
  const DEBUG = (() => {
    try { return localStorage.getItem('airelay.debug') === '1'; } catch { return false; }
  })();
  function dbg(...args) {
    if (!DEBUG) return;
    try { console.log('[AI Relay]', ...args); } catch {}
  }

  const EVENT_CAPTURE = 'airelay:capture';
  const EVENT_HISTORY = 'airelay:history';

  // ---------- Platform detection ----------

  const host = location.hostname;
  const PLATFORM = host.includes('chatgpt.com')
    ? 'chatgpt'
    : host.includes('claude.ai')
    ? 'claude'
    : host.includes('grok.com')
    ? 'grok'
    : null;

  if (!PLATFORM) return;

  dbg(`platform=${PLATFORM}, patching fetch...`);

  // --- Streaming endpoints (POST, new messages) ---
  const CHATGPT_API_RE = /\/backend-(api|anon)\/(f\/)?conversation(\?|$|\/)/;
  const CLAUDE_API_RE = /\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+\/completion/;
  const GROK_STREAM_RE = /\/rest\/app-chat\/conversations\/(new|[^/]+\/responses)/;

  function matchesStreamTarget(url) {
    if (PLATFORM === 'chatgpt') return CHATGPT_API_RE.test(url);
    if (PLATFORM === 'claude') return CLAUDE_API_RE.test(url);
    if (PLATFORM === 'grok') return GROK_STREAM_RE.test(url);
    return false;
  }

  // --- History load endpoints (GET or POST that returns full conversation) ---
  const GROK_HISTORY_RE = /\/rest\/app-chat\/conversations\/[a-f0-9-]+\/load-responses/;

  function matchesHistoryLoad(url) {
    const path = url.split('?')[0];
    if (PLATFORM === 'chatgpt') {
      return /\/backend-(api|anon)\/(f\/)?conversation\/[a-f0-9-]+$/.test(path);
    }
    if (PLATFORM === 'claude') {
      return /\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+$/.test(path)
        && !path.endsWith('/completion');
    }
    if (PLATFORM === 'grok') {
      return GROK_HISTORY_RE.test(path);
    }
    return false;
  }

  function extractConvId(url) {
    if (PLATFORM === 'claude') {
      const m = url.match(/chat_conversations\/([^/?]+)/);
      return m ? m[1] : null;
    }
    if (PLATFORM === 'grok') {
      const m = url.match(/\/conversations\/([a-f0-9-]+)/);
      return m ? m[1] : null;
    }
    const m = url.match(/\/conversation\/([^/?]+)/);
    return m ? m[1] : null;
  }

  // ---------- Dispatch helpers ----------

  function emit(detail) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_CAPTURE, { detail }));
      dbg('capture', detail.role, detail.content?.slice(0, 60));
    } catch (e) {
      // swallow
    }
  }

  function emitHistory(detail) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_HISTORY, { detail }));
      dbg('history', detail.platform, detail.convId, detail.messages?.length + ' msgs');
    } catch (e) {
      // swallow
    }
  }

  // ---------- History parsers (GET full conversation) ----------

  // ChatGPT returns a message tree with `mapping` + `current_node`.
  // Walk backwards from current_node via parent pointers → active branch.
  function parseChatGPTHistory(json) {
    const messages = [];
    const mapping = json.mapping;
    if (!mapping) return messages;

    let nodeId = json.current_node;
    if (!nodeId) {
      for (const [id, node] of Object.entries(mapping)) {
        if (!node.children?.length && node.message?.author?.role === 'assistant') {
          nodeId = id;
          break;
        }
      }
    }

    while (nodeId && mapping[nodeId]) {
      const node = mapping[nodeId];
      const msg = node.message;
      if (msg) {
        const role = msg.author?.role;
        if (role === 'user' || role === 'assistant') {
          const parts = msg.content?.parts || [];
          const text = parts
            .map((p) => (typeof p === 'string' ? p : p?.text || ''))
            .filter(Boolean)
            .join('\n');
          if (text.trim()) {
            messages.unshift({ role, content: text, messageId: msg.id });
          }
        }
      }
      nodeId = node.parent;
    }

    return messages;
  }

  // Claude returns a flat `chat_messages` array.
  function parseClaudeHistory(json) {
    const messages = [];
    const chatMessages = json.chat_messages;
    if (!Array.isArray(chatMessages)) return messages;

    for (const m of chatMessages) {
      const role = m.sender === 'human' ? 'user'
        : m.sender === 'assistant' ? 'assistant'
        : null;
      if (!role) continue;

      let text = '';
      if (Array.isArray(m.content)) {
        text = m.content
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text)
          .join('\n');
      }
      if (!text && typeof m.text === 'string') {
        text = m.text;
      }

      if (text.trim()) {
        messages.push({ role, content: text, messageId: m.uuid || null });
      }
    }

    return messages;
  }

  // ---------- Grok history parser ----------

  function parseGrokHistory(json) {
    const messages = [];
    const convMessages = json.messages || json.responses || [];
    if (!Array.isArray(convMessages)) return messages;

    for (const m of convMessages) {
      const sender = (m.sender || m.role || '').toString().toLowerCase();
      const role = (sender === '1' || sender === 'human' || sender === 'user') ? 'user'
        : (sender === '2' || sender === 'assistant' || sender === 'bot') ? 'assistant'
        : null;
      if (!role) continue;

      const text = m.message || m.content || m.text || '';
      if (typeof text === 'string' && text.trim()) {
        messages.push({ role, content: text, messageId: m.responseId || m.id || m.messageId || null });
      }
    }
    return messages;
  }

  // ---------- Grok stream reader ----------
  // Grok streams line-delimited JSON. Key shapes:
  //   { result: { userResponse: { message, sender:"human", responseId } } }  ← user echo
  //   { result: { token: "...", messageTag: "final", responseId } }           ← assistant text chunk
  //   { result: { token: "...", isThinking: true, messageTag: "tool_usage_card" } } ← skip
  //   { result: { isSoftStop: true } }                                        ← end
  //   { result: { modelResponse: { message: "full text", responseId } } }     ← full assembled response

  function makeGrokStreamReader(convId) {
    let buffer = '';
    let asstText = '';
    let asstId = null;
    let discoveredConvId = convId;
    let flushed = false;
    let userEmitted = false;

    function flush() {
      if (flushed) return;
      flushed = true;
      const content = asstText.trim();
      if (content) {
        emit({
          platform: 'grok',
          convId: discoveredConvId,
          role: 'assistant',
          content,
          messageId: asstId,
          done: true,
        });
      }
    }

    function handleLine(rawLine) {
      const line = rawLine.trim();
      if (!line) return;

      let obj;
      try { obj = JSON.parse(line); } catch { return; }

      const result = obj.result || obj;

      // Extract conversation context from userResponse (first line)
      if (result.userResponse) {
        const ur = result.userResponse;
        if (ur.parentResponseId) {
          // URL already has convId from path; but we can confirm from response
        }
        if (!userEmitted && ur.message && (ur.sender === 'human' || ur.sender === 1)) {
          userEmitted = true;
          // User message is emitted by the pendingUser mechanism in the main fetch patch
        }
        if (ur.responseId) asstId = ur.responseId;
        return;
      }

      // modelResponse contains the full assembled assistant message
      if (result.modelResponse) {
        const mr = result.modelResponse;
        if (mr.responseId) asstId = mr.responseId;
        if (mr.message && typeof mr.message === 'string') {
          asstText = mr.message;
        }
        flush();
        return;
      }

      if (result.responseId) asstId = result.responseId;

      // isSoftStop signals the end of the response
      if (result.isSoftStop) {
        flush();
        return;
      }

      // Only accumulate tokens from final assistant text, not tool calls / thinking
      if (typeof result.token === 'string' && result.token) {
        const tag = result.messageTag || '';
        if (tag === 'final' || (!tag && !result.isThinking)) {
          asstText += result.token;
        }
      }
    }

    return {
      feed(chunkText) {
        buffer += chunkText;
        let idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          handleLine(line);
        }
      },
      finish() {
        if (buffer) {
          handleLine(buffer);
          buffer = '';
        }
        flush();
      },
      getConvId() { return discoveredConvId; },
    };
  }

  // ---------- Request body parsing (user messages) ----------

  async function parseRequestBody(init) {
    if (!init || !init.body) return null;
    try {
      if (typeof init.body === 'string') return JSON.parse(init.body);
      if (init.body instanceof Blob) return JSON.parse(await init.body.text());
      if (init.body instanceof ArrayBuffer) {
        return JSON.parse(new TextDecoder().decode(init.body));
      }
      // FormData / URLSearchParams / ReadableStream — skip for MVP
      return null;
    } catch {
      return null;
    }
  }

  function extractUserFromChatGPTBody(body) {
    // Newer ChatGPT shape: { messages: [{ author: {role}, content: {parts: [...] } }], ... }
    if (!body || !Array.isArray(body.messages)) return null;
    for (let i = body.messages.length - 1; i >= 0; i--) {
      const m = body.messages[i];
      if (m?.author?.role === 'user') {
        const parts = m?.content?.parts || [];
        const text = parts
          .map((p) => (typeof p === 'string' ? p : p?.text || ''))
          .filter(Boolean)
          .join('\n');
        if (text) {
          return { role: 'user', content: text, messageId: m.id, convId: body.conversation_id || null };
        }
      }
    }
    return null;
  }

  function extractUserFromClaudeBody(body) {
    if (!body) return null;
    if (typeof body.prompt === 'string' && body.prompt.trim()) {
      return { role: 'user', content: body.prompt };
    }
    return null;
  }

  function extractUserFromGrokBody(body) {
    if (!body) return null;
    // Grok sends conversation history as "responses" array; the last human entry is the new user message
    const responses = body.responses;
    if (Array.isArray(responses) && responses.length > 0) {
      for (let i = responses.length - 1; i >= 0; i--) {
        const r = responses[i];
        if (r && (r.sender === 1 || r.sender === 'human') && r.message) {
          return { role: 'user', content: r.message };
        }
      }
    }
    if (typeof body.message === 'string' && body.message.trim()) {
      return { role: 'user', content: body.message };
    }
    return null;
  }

  // ---------- SSE stream parsing (assistant messages) ----------

  // Generic line splitter for SSE.  Each event is separated by \n\n and lines
  // within an event start with "data: " or "event: " etc.
  function makeSSEReader(onEvent) {
    let buffer = '';
    return function feed(chunkText) {
      buffer += chunkText;
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = raw.split('\n');
        const ev = { event: 'message', data: '' };
        for (const line of lines) {
          if (line.startsWith('data:')) ev.data += line.slice(5).trimStart() + '\n';
          else if (line.startsWith('event:')) ev.event = line.slice(6).trim();
        }
        ev.data = ev.data.replace(/\n$/, '');
        if (ev.data) onEvent(ev);
      }
    };
  }

  // ChatGPT: 2025-2026 SSE uses "delta_encoding"+patches. Older versions
  // embed a full `message` object directly. We track ONLY assistant state,
  // ignoring system messages that can overwrite accumulated content.
  function makeChatGPTAssistantAccumulator(urlConvId) {
    let asst = null; // { id, parts: string[], status }
    let lastConvId = urlConvId;

    function flush() {
      if (asst && Array.isArray(asst.parts)) {
        const text = asst.parts.join('');
        if (text.trim()) {
          emit({
            platform: 'chatgpt',
            convId: lastConvId || asst.id,
            role: 'assistant',
            content: text,
            messageId: asst.id,
            done: true,
          });
        }
      }
      asst = null;
    }

    function handleFullMessage(msg) {
      if (msg?.author?.role !== 'assistant') return;
      const parts = (msg.content?.parts || []).map((p) =>
        typeof p === 'string' ? p : p?.text || ''
      );
      if (!asst || asst.id !== msg.id) {
        asst = { id: msg.id, parts: parts.slice(), status: msg.status };
      } else {
        const hasNewContent = parts.some((p) => p && p.length);
        if (hasNewContent) asst.parts = parts.slice();
        if (msg.status) asst.status = msg.status;
      }
    }

    function appendToCurrent(text, partIdx) {
      if (!asst || typeof text !== 'string') return;
      const idx = typeof partIdx === 'number' ? partIdx : Math.max(0, asst.parts.length - 1);
      while (asst.parts.length <= idx) asst.parts.push('');
      asst.parts[idx] += text;
    }

    function applyPatch(path, op, value) {
      // Full-root replace/add: { p: "", o: "add"|"replace", v: { message: {...} } }
      if ((op === 'add' || op === 'replace') && value?.message?.author) {
        handleFullMessage(value.message);
        return;
      }

      // Content parts append/replace
      const m = path?.match(/^\/message\/content\/parts\/(\d+)$/);
      if (m) {
        const idx = Number(m[1]);
        if (op === 'append' && typeof value === 'string') {
          appendToCurrent(value, idx);
        } else if (typeof value === 'string' && asst) {
          while (asst.parts.length <= idx) asst.parts.push('');
          asst.parts[idx] = value;
        }
        return;
      }

      // Status update
      if (path === '/message/status' && asst) {
        asst.status = value;
        return;
      }

      // Nested patch array: { o: "patch", v: [{ p, o, v }, ...] }
      if (op === 'patch' && Array.isArray(value)) {
        for (const p of value) applyPatch(p.p || '', p.o || 'replace', p.v);
      }
    }

    return function onEvent(ev) {
      if (!ev.data) return;
      if (ev.data === '[DONE]') {
        flush();
        return;
      }

      let obj;
      try {
        obj = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (obj.conversation_id) lastConvId = obj.conversation_id;
      if (obj.v?.conversation_id) lastConvId = obj.v.conversation_id;

      // Format A (legacy): { message: {author, content}, conversation_id }
      if (obj.message?.author) {
        handleFullMessage(obj.message);
        return;
      }

      // Format B: { v: { message: {...} } } — full-message inside delta wrapper
      if (obj.v && typeof obj.v === 'object' && obj.v.message?.author) {
        handleFullMessage(obj.v.message);
        return;
      }

      // Format C: explicit patch { p, o, v }
      if (typeof obj.p === 'string' && obj.p.length > 0) {
        applyPatch(obj.p, obj.o || 'replace', obj.v);
        return;
      }

      // Format D: array of patches { patches: [...] } or { v: [...] }
      if (Array.isArray(obj.patches)) {
        for (const p of obj.patches) applyPatch(p.p || '', p.o || 'replace', p.value ?? p.v);
        return;
      }
      if (Array.isArray(obj.v)) {
        for (const p of obj.v) {
          if (p && typeof p === 'object' && typeof p.p === 'string') {
            applyPatch(p.p, p.o || 'replace', p.v);
          }
        }
        return;
      }

      // Format E: bare { v: "text chunk" } — append to active assistant content
      if (typeof obj.v === 'string' && asst) {
        appendToCurrent(obj.v);
        return;
      }

      // Format F: { p:"", o:"add"|"replace", v:{message:...} } handled in applyPatch via p length check above;
      //          but p === "" and op add is common for the first seed. Handle explicitly:
      if (obj.p === '' && (obj.o === 'add' || obj.o === 'replace') && obj.v?.message?.author) {
        handleFullMessage(obj.v.message);
        return;
      }
    };
  }

  // Claude: the stream is NOT standard SSE (no \n\n event separators).
  // It's line-delimited JSON, with an optional "data: " prefix per line.
  // Strategy: feed raw text chunks, split by newline, try to JSON.parse each
  // non-empty line (stripping "data: " / "event: ..." prefixes), and aggregate
  // content_block_delta.text into a single assistant message.
  function makeClaudeStreamReader(convId) {
    let buffer = '';
    let asstText = '';
    let asstId = null;
    let flushed = false;

    function flush() {
      if (flushed) return;
      flushed = true;
      if (asstText.trim()) {
        emit({
          platform: 'claude',
          convId,
          role: 'assistant',
          content: asstText,
          messageId: asstId,
          done: true,
        });
      }
    }

    function handleLine(rawLine) {
      let line = rawLine.trim();
      if (!line) return;
      // strip SSE prefixes if present
      if (line.startsWith('event:')) return; // event name; content is in data line
      if (line.startsWith('data:')) line = line.slice(5).trimStart();
      if (!line || line === '[DONE]') return;

      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        return;
      }

      const type = obj.type;

      if (type === 'message_start' && obj.message) {
        asstId = obj.message.uuid || obj.message.id || asstId;
        // message.content may be empty array initially
        if (Array.isArray(obj.message.content)) {
          for (const b of obj.message.content) {
            if (b?.type === 'text' && typeof b.text === 'string') asstText += b.text;
          }
        }
        return;
      }

      if (type === 'content_block_start' && obj.content_block) {
        if (obj.content_block.type === 'text' && typeof obj.content_block.text === 'string') {
          asstText += obj.content_block.text;
        }
        return;
      }

      if (type === 'content_block_delta' && obj.delta) {
        // Anthropic: delta.type === 'text_delta', delta.text === chunk
        if (obj.delta.type === 'text_delta' && typeof obj.delta.text === 'string') {
          asstText += obj.delta.text;
        } else if (typeof obj.delta.text === 'string') {
          asstText += obj.delta.text;
        }
        return;
      }

      if (type === 'completion' && typeof obj.completion === 'string') {
        asstText += obj.completion;
        return;
      }

      if (
        type === 'message_stop' ||
        type === 'message_complete' ||
        type === 'message_delta' // often carries stop_reason
      ) {
        // We don't necessarily flush here — streams can continue across such
        // events in the legacy/hybrid format. Safe to flush on the first stop
        // after we've accumulated text.
        if (asstText.trim()) flush();
        return;
      }
    }

    return {
      feed(chunkText) {
        buffer += chunkText;
        let idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          handleLine(line);
        }
      },
      finish() {
        if (buffer) {
          handleLine(buffer);
          buffer = '';
        }
        flush();
      },
    };
  }

  // ---------- fetch patch ----------
  // Some sites (Grok/Sentry/Datadog) re-assign window.fetch after our patch.
  // We use defineProperty to intercept re-assignment and always stay on top.

  let origFetch = window.fetch.bind(window);

  function patchedFetch(input, init) {
    return _patchedFetchImpl(input, init);
  }

  try {
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      enumerable: true,
      get() { return patchedFetch; },
      set(newFetch) {
        if (newFetch !== patchedFetch && typeof newFetch === 'function') {
          dbg('fetch re-assigned by 3rd party, wrapping their version');
          origFetch = newFetch.bind(window);
        }
      },
    });
    dbg('fetch protected via defineProperty');
  } catch (e) {
    console.warn('[AI Relay] defineProperty failed, falling back to direct assignment:', e.message);
    window.fetch = patchedFetch;
  }

  async function _patchedFetchImpl(input, init) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
        ? input.url
        : String(input);

    const method = (
      (init && init.method) ||
      (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();

    // --- Path A: History load (GET or POST that returns full conversation) ---
    const isGrokHistoryPost = PLATFORM === 'grok' && method === 'POST' && GROK_HISTORY_RE.test(url);
    if ((method === 'GET' && matchesHistoryLoad(url)) || isGrokHistoryPost) {
      dbg('history-load', url);
      const response = await origFetch(input, init);
      try {
        const cloned = response.clone();
        const json = await cloned.json();
        const convId = extractConvId(url);
        const msgs = PLATFORM === 'chatgpt'
          ? parseChatGPTHistory(json)
          : PLATFORM === 'grok'
          ? parseGrokHistory(json)
          : parseClaudeHistory(json);
        if (msgs.length > 0) {
          emitHistory({
            platform: PLATFORM,
            convId: convId || json.conversation_id || json.uuid || json.conversationId || null,
            title: json.title || json.name || null,
            messages: msgs,
          });
        }
      } catch (e) {
        dbg('history-parse-error', e?.message);
      }
      return response;
    }

    // --- Path B: Streaming target (POST new message) ---
    if (!matchesStreamTarget(url)) {
      return origFetch(input, init);
    }

    dbg('intercepted', method, url);

    // --- Capture user message from request body (best effort) ---
    // We don't emit immediately; we wait until the SSE stream reveals the
    // conversation_id (new chats POST before a convId exists, so the user msg
    // would otherwise land in a "default" session separate from the assistant
    // response). Stash it and emit once we know the convId.
    let pendingUser = null;
    try {
      let bodyObj = null;
      if (input instanceof Request) {
        try {
          const cloned = input.clone();
          const txt = await cloned.text();
          if (txt) bodyObj = JSON.parse(txt);
        } catch {}
      } else if (init && init.body) {
        bodyObj = await parseRequestBody(init);
      }

      if (bodyObj) {
        const userMsg =
          PLATFORM === 'chatgpt'
            ? extractUserFromChatGPTBody(bodyObj)
            : PLATFORM === 'grok'
            ? extractUserFromGrokBody(bodyObj)
            : extractUserFromClaudeBody(bodyObj);
        if (userMsg) {
          const urlConvId = extractConvId(url);
          const knownConvId = userMsg.convId || urlConvId;
          if (knownConvId) {
            // We already know the conversation id, emit immediately.
            emit({
              platform: PLATFORM,
              convId: knownConvId,
              role: 'user',
              content: userMsg.content,
              done: true,
            });
          } else {
            // New conversation — defer until SSE gives us a convId.
            pendingUser = userMsg.content;
          }
        }
      }
    } catch {
      // non-fatal
    }

    // --- Execute real fetch ---
    const response = await origFetch(input, init);

    // --- Clone response and stream-parse in background ---
    try {
      const convId = extractConvId(url);
      const cloned = response.clone();
      const reader = cloned.body?.getReader();
      if (!reader) throw new Error('no body reader');
      const decoder = new TextDecoder();

      if (PLATFORM === 'grok') {
        const grokReader = makeGrokStreamReader(convId);
        let dbgCount = 0;
        const DBG_MAX = 12;
        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              const txt = decoder.decode(value, { stream: true });
              if (DEBUG && dbgCount < DBG_MAX) {
                const firstLine = txt.split('\n').find((l) => l.trim());
                if (firstLine) {
                  dbg(`grok-sse#${dbgCount}`, firstLine.slice(0, 300));
                  dbgCount++;
                }
              }
              grokReader.feed(txt);
              if (pendingUser && grokReader.getConvId()) {
                emit({
                  platform: 'grok',
                  convId: grokReader.getConvId(),
                  role: 'user',
                  content: pendingUser,
                  done: true,
                });
                pendingUser = null;
              }
            }
            grokReader.finish();
          } catch {}
        })();
      } else if (PLATFORM === 'claude') {
        const claudeReader = makeClaudeStreamReader(convId);
        let dbgCount = 0;
        const DBG_MAX = 12;
        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              const txt = decoder.decode(value, { stream: true });
              if (DEBUG && dbgCount < DBG_MAX) {
                const firstLine = txt.split('\n').find((l) => l.trim());
                if (firstLine) {
                  dbg(`claude-sse#${dbgCount}`, firstLine.slice(0, 300));
                  dbgCount++;
                }
              }
              if (pendingUser) {
                emit({
                  platform: 'claude',
                  convId,
                  role: 'user',
                  content: pendingUser,
                  done: true,
                });
                pendingUser = null;
              }
              claudeReader.feed(txt);
            }
            claudeReader.finish();
          } catch {}
        })();
      } else {
        // ChatGPT: standard SSE with \n\n event delimiters + delta_encoding patches
        const accumulator = makeChatGPTAssistantAccumulator(convId);

        let dbgCount = 0;
        const DBG_MAX = 8;
        const wrappedAccumulator = (ev) => {
          if (DEBUG && dbgCount < DBG_MAX) {
            dbg(`sse#${dbgCount}`, `event="${ev.event}"`, ev.data?.slice(0, 300));
            dbgCount++;
          }
          // Flush pending user message once we learn the convId from SSE.
          if (pendingUser && ev.data) {
            try {
              const probe = JSON.parse(ev.data);
              const cid =
                probe?.conversation_id ||
                probe?.v?.conversation_id ||
                probe?.v?.message?.conversation_id ||
                probe?.input_message?.conversation_id ||
                null;
              if (cid) {
                emit({
                  platform: PLATFORM,
                  convId: cid,
                  role: 'user',
                  content: pendingUser,
                  done: true,
                });
                pendingUser = null;
              }
            } catch {}
          }
          accumulator(ev);
        };
        const sse = makeSSEReader(wrappedAccumulator);

        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              sse(decoder.decode(value, { stream: true }));
            }
            // flush with a fake DONE to finalize ChatGPT accumulator
            sse('data: [DONE]\n\n');
          } catch {
            // stream errors are non-fatal for us
          }
        })();
      }
    } catch {
      // swallow
    }

    return response;
  }
})();
