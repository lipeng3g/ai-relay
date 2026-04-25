// AI Relay · page-inject.js
// Runs in PAGE context. Patches fetch to capture AI conversations.
// CRITICAL: Must not degrade page performance. Only intercept targeted URLs.

(function () {
  if (window.__AI_RELAY_INJECTED__) return;
  window.__AI_RELAY_INJECTED__ = true;

  const DEBUG = (() => {
    try { return localStorage.getItem('airelay.debug') === '1'; } catch { return false; }
  })();
  function dbg(...args) {
    if (DEBUG) try { console.log('[AI Relay]', ...args); } catch {}
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
      const m = url.match(/\/conversations\/([a-f0-9-]+)/);
      return m ? m[1] : null;
    }
    if (PLATFORM === 'gemini') {
      // Gemini conversation IDs are not in the URL path — they live inside
      // the BatchExecute payload. Stream reader extracts them from response.
      return null;
    }
    const m = url.match(/\/conversation\/([a-f0-9-]{20,})/);
    return m ? m[1] : null;
  }

  // ---- Dispatch ----

  function emit(detail) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_CAPTURE, { detail }));
      dbg('capture', detail.role, (detail.content || '').slice(0, 60));
    } catch {}
  }

  function emitHistory(detail) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_HISTORY, { detail }));
      dbg('history', detail.convId, detail.messages?.length, 'msgs');
    } catch {}
  }

  // ---- History parsers ----

  function parseChatGPTHistory(json) {
    const mapping = json.mapping;
    if (!mapping) return [];
    const messages = [];
    let nodeId = json.current_node;
    if (!nodeId) {
      for (const [id, node] of Object.entries(mapping)) {
        if (!node.children?.length && node.message?.author?.role === 'assistant') { nodeId = id; break; }
      }
    }
    while (nodeId && mapping[nodeId]) {
      const node = mapping[nodeId];
      const msg = node.message;
      if (msg) {
        const role = msg.author?.role;
        if (role === 'user' || role === 'assistant') {
          const text = (msg.content?.parts || [])
            .map(p => typeof p === 'string' ? p : p?.text || '').filter(Boolean).join('\n');
          if (text.trim()) messages.unshift({ role, content: text, messageId: msg.id });
        }
      }
      nodeId = node.parent;
    }
    return messages;
  }

  function parseClaudeHistory(json) {
    const msgs = json.chat_messages;
    if (!Array.isArray(msgs)) return [];
    const leaf = json.current_leaf_message_uuid;

    // Build uuid→message map and resolve active branch via leaf traversal
    const byUuid = new Map();
    for (const m of msgs) byUuid.set(m.uuid, m);

    let activeMsgs;
    if (leaf && byUuid.has(leaf)) {
      const chain = [];
      let cur = byUuid.get(leaf);
      while (cur) {
        chain.push(cur);
        const pid = cur.parent_message_uuid;
        cur = (pid && pid !== '00000000-0000-4000-8000-000000000000') ? byUuid.get(pid) : null;
      }
      activeMsgs = chain.reverse();
    } else {
      activeMsgs = msgs;
    }

    const out = [];
    for (const m of activeMsgs) {
      const role = m.sender === 'human' ? 'user' : m.sender === 'assistant' ? 'assistant' : null;
      if (!role) continue;
      const parts = [];
      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === 'text' && typeof b.text === 'string' && b.text.trim())
            parts.push(b.text);
          // Extract Artifact code (create_file / create / update_file)
          if (b.type === 'tool_use' && b.input?.file_text) {
            const fname = b.input.path?.split('/').pop() || b.input.description || 'artifact';
            parts.push(`\n\`\`\`\n// ${fname}\n${b.input.file_text}\n\`\`\``);
          }
        }
      }
      let text = parts.join('\n');
      if (!text && typeof m.text === 'string') text = m.text;
      if (text.trim()) out.push({ role, content: text, messageId: m.uuid || null });
    }
    return out;
  }

  function parseGrokHistory(json) {
    const arr = json.messages || json.responses || [];
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const m of arr) {
      const s = (m.sender || m.role || '').toString().toLowerCase();
      const role = (s === '1' || s === 'human' || s === 'user') ? 'user'
        : (s === '2' || s === 'assistant' || s === 'bot') ? 'assistant' : null;
      if (!role) continue;
      const text = m.message || m.content || m.text || '';
      if (typeof text === 'string' && text.trim())
        out.push({ role, content: text, messageId: m.responseId || m.id || m.messageId || null });
    }
    return out;
  }

  // ---- Gemini BatchExecute helpers (shared by stream + history) ----
  // Field paths verified against real recordings (2026-04-25):
  //   stream: data[1][0]=convId, data[1][1]=respId, data[4][0][1][0]=asst text
  //   history (rpcId=hNvQHb):
  //     data[0][i][0][0]=convId, data[0][i][0][1]=user-respId,
  //     data[0][i][2][0][0]=user text,
  //     data[0][i][3][0][0][0]=rc id, data[0][i][3][0][0][1][0]=asst text

  function parseGeminiBatchExecute(text) {
    if (!text || typeof text !== 'string') return [];
    let body = text;
    if (body.startsWith(")]}'")) body = body.slice(4);
    const envelopes = [];
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || /^\d+$/.test(line) || !line.startsWith('[')) continue;
      let outer;
      try { outer = JSON.parse(line); } catch { continue; }
      if (!Array.isArray(outer)) continue;
      for (const item of outer) {
        if (!Array.isArray(item) || item[0] !== 'wrb.fr') continue;
        let data = null;
        if (typeof item[2] === 'string' && item[2].length > 0) {
          try { data = JSON.parse(item[2]); } catch {}
        }
        envelopes.push({ rpcId: item[1] || null, data });
      }
    }
    return envelopes;
  }

  // Used only by extractUser fallback for request body parsing.
  function findLongestStringIn(node, minLen) {
    minLen = minLen == null ? 30 : minLen;
    let best = '';
    const stack = [node];
    while (stack.length) {
      const n = stack.pop();
      if (n == null) continue;
      if (typeof n === 'string') {
        if (n.length > best.length) best = n;
      } else if (Array.isArray(n)) {
        for (let i = n.length - 1; i >= 0; i--) stack.push(n[i]);
      } else if (typeof n === 'object') {
        for (const v of Object.values(n)) stack.push(v);
      }
    }
    return best.length >= minLen ? best : '';
  }

  function parseGeminiHistory(text) {
    const envelopes = typeof text === 'string'
      ? parseGeminiBatchExecute(text)
      : (text && typeof text === 'object' ? [{ rpcId: 'hNvQHb', data: text }] : []);
    const messages = [];
    for (const env of envelopes) {
      if (env.rpcId && env.rpcId !== 'hNvQHb') continue;
      const turns = env.data && env.data[0];
      if (!Array.isArray(turns)) continue;
      for (const turn of turns) {
        if (!Array.isArray(turn)) continue;
        const userRespId = turn[0] && turn[0][1];
        const userText = turn[2] && turn[2][0] && turn[2][0][0];
        if (typeof userText === 'string' && userText.trim()) {
          messages.push({ role: 'user', content: userText, messageId: typeof userRespId === 'string' ? userRespId : null });
        }
        const asstNode = turn[3] && turn[3][0] && turn[3][0][0];
        const asstChunkId = asstNode && asstNode[0];
        const asstText = asstNode && asstNode[1] && asstNode[1][0];
        if (typeof asstText === 'string' && asstText.trim()) {
          messages.push({
            role: 'assistant',
            content: asstText,
            messageId: typeof asstChunkId === 'string' ? asstChunkId : null,
          });
        }
      }
    }
    return messages;
  }

  // ---- Lightweight body-text extractor (for user messages) ----
  // Only reads string/ArrayBuffer bodies. Never reads ReadableStream bodies
  // to avoid consuming the request body before the real fetch.

  function tryParseBody(init) {
    if (!init?.body) return null;
    try {
      if (typeof init.body === 'string') return JSON.parse(init.body);
      if (init.body instanceof ArrayBuffer)
        return JSON.parse(new TextDecoder().decode(init.body));
    } catch {}
    return null;
  }

  // Gemini POST bodies come as form-urlencoded `f.req=<URL-encoded JSON>`.
  // Returns the parsed JSON array (BatchExecute params) or null.
  function tryParseGeminiBody(init) {
    if (!init?.body) return null;
    let bodyStr = '';
    try {
      if (typeof init.body === 'string') {
        bodyStr = init.body;
      } else if (init.body instanceof ArrayBuffer) {
        bodyStr = new TextDecoder().decode(init.body);
      } else if (typeof URLSearchParams !== 'undefined' && init.body instanceof URLSearchParams) {
        bodyStr = init.body.toString();
      } else if (init.body && typeof init.body.toString === 'function') {
        bodyStr = init.body.toString();
      } else {
        return null;
      }
    } catch { return null; }
    if (typeof bodyStr !== 'string' || !bodyStr) return null;
    const m = bodyStr.match(/(?:^|&)f\.req=([^&]+)/);
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch { return null; }
  }

  function extractUser(body) {
    if (!body) return null;
    if (PLATFORM === 'chatgpt') {
      if (!Array.isArray(body.messages)) return null;
      for (let i = body.messages.length - 1; i >= 0; i--) {
        const m = body.messages[i];
        if (m?.author?.role === 'user') {
          const text = (m.content?.parts || [])
            .map(p => typeof p === 'string' ? p : p?.text || '').filter(Boolean).join('\n');
          if (text) return { content: text, messageId: m.id, convId: body.conversation_id || null };
        }
      }
    } else if (PLATFORM === 'claude') {
      if (typeof body.prompt === 'string' && body.prompt.trim())
        return { content: body.prompt };
    } else if (PLATFORM === 'grok') {
      const responses = body.responses;
      if (Array.isArray(responses)) {
        for (let i = responses.length - 1; i >= 0; i--) {
          const r = responses[i];
          if (r && (r.sender === 1 || r.sender === 'human') && r.message)
            return { content: r.message };
        }
      }
      if (typeof body.message === 'string' && body.message.trim())
        return { content: body.message };
    } else if (PLATFORM === 'gemini') {
      // body is the parsed BatchExecute params (nested array).
      // Heuristic: longest string in payload is the user prompt.
      // TODO: validate against real fixture and use a precise field path.
      const text = findLongestStringIn(body, 1);
      if (text) return { content: text };
    }
    return null;
  }

  // ---- Stream readers (lightweight — only accumulate final text) ----

  function makeChatGPTStreamReader(urlConvId) {
    let buffer = '';
    let asstParts = [];
    let asstId = null;
    let lastConvId = urlConvId;
    let flushed = false;

    function flush() {
      if (flushed) return;
      flushed = true;
      const text = asstParts.join('').trim();
      if (text) emit({ platform: 'chatgpt', convId: lastConvId, role: 'assistant', content: text, messageId: asstId, done: true });
    }

    function handleMsg(msg) {
      if (msg?.author?.role !== 'assistant') return;
      const parts = (msg.content?.parts || []).map(p => typeof p === 'string' ? p : p?.text || '');
      if (!asstId || asstId !== msg.id) {
        asstId = msg.id;
        asstParts = parts.slice();
      } else if (parts.some(p => p.length)) {
        asstParts = parts.slice();
      }
    }

    function applyPatch(path, op, value) {
      if ((op === 'add' || op === 'replace') && value?.message?.author) { handleMsg(value.message); return; }
      const pm = path?.match(/^\/message\/content\/parts\/(\d+)$/);
      if (pm) {
        const idx = Number(pm[1]);
        while (asstParts.length <= idx) asstParts.push('');
        if (op === 'append' && typeof value === 'string') asstParts[idx] += value;
        else if (typeof value === 'string') asstParts[idx] = value;
        return;
      }
      if (op === 'patch' && Array.isArray(value))
        for (const p of value) applyPatch(p.p || '', p.o || 'replace', p.v);
    }

    function handleSSEData(data) {
      if (data === '[DONE]') { flush(); return; }
      let obj;
      try { obj = JSON.parse(data); } catch { return; }
      if (obj.conversation_id) lastConvId = obj.conversation_id;
      if (obj.v?.conversation_id) lastConvId = obj.v.conversation_id;
      if (obj.message?.author) { handleMsg(obj.message); return; }
      if (obj.v?.message?.author) { handleMsg(obj.v.message); return; }
      if (typeof obj.p === 'string' && obj.p.length > 0) { applyPatch(obj.p, obj.o || 'replace', obj.v); return; }
      if (Array.isArray(obj.patches)) { for (const p of obj.patches) applyPatch(p.p || '', p.o || 'replace', p.value ?? p.v); return; }
      if (Array.isArray(obj.v)) { for (const p of obj.v) if (p?.p != null) applyPatch(p.p, p.o || 'replace', p.v); return; }
      if (typeof obj.v === 'string' && asstParts.length) { asstParts[asstParts.length - 1] += obj.v; return; }
      if (obj.p === '' && obj.v?.message?.author) { handleMsg(obj.v.message); return; }
    }

    return {
      feed(chunk) {
        buffer += chunk;
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let data = '';
          for (const line of raw.split('\n')) {
            if (line.startsWith('data:')) data += line.slice(5).trimStart() + '\n';
          }
          data = data.replace(/\n$/, '');
          if (data) handleSSEData(data);
        }
      },
      finish() { this.feed('\n\ndata: [DONE]\n\n'); },
      getConvId() { return lastConvId; },
    };
  }

  function makeClaudeStreamReader(convId) {
    let buffer = '';
    let asstText = '';
    let asstId = null;
    let flushed = false;
    // Track current tool_use block for Artifact extraction
    let curToolName = null;
    let curToolInput = '';

    function flushTool() {
      if (!curToolName || !curToolInput) { curToolName = null; curToolInput = ''; return; }
      try {
        const inp = JSON.parse(curToolInput);
        if (inp.file_text) {
          const fname = inp.path?.split('/').pop() || inp.description || 'artifact';
          asstText += `\n\`\`\`\n// ${fname}\n${inp.file_text}\n\`\`\``;
        }
      } catch {}
      curToolName = null;
      curToolInput = '';
    }

    function flush() {
      if (flushed) return;
      flushed = true;
      flushTool();
      if (asstText.trim()) emit({ platform: 'claude', convId, role: 'assistant', content: asstText, messageId: asstId, done: true });
    }

    function handleLine(raw) {
      let line = raw.trim();
      if (!line || line.startsWith('event:')) return;
      if (line.startsWith('data:')) line = line.slice(5).trimStart();
      if (!line || line === '[DONE]') return;
      let obj;
      try { obj = JSON.parse(line); } catch { return; }
      if (obj.type === 'message_start' && obj.message) {
        asstId = obj.message.uuid || obj.message.id || asstId;
        return;
      }
      if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta' && typeof obj.delta.text === 'string') {
        asstText += obj.delta.text;
        return;
      }
      // Accumulate tool_use input JSON for Artifact extraction
      if (obj.type === 'content_block_start' && obj.content_block?.type === 'tool_use') {
        flushTool();
        curToolName = obj.content_block.name || '';
        curToolInput = '';
        return;
      }
      if (obj.type === 'content_block_delta' && obj.delta?.type === 'input_json_delta' && typeof obj.delta.partial_json === 'string') {
        curToolInput += obj.delta.partial_json;
        return;
      }
      if (obj.type === 'content_block_stop' && curToolName) {
        flushTool();
        return;
      }
      if (obj.type === 'content_block_start' && obj.content_block?.type === 'text' && typeof obj.content_block.text === 'string') {
        asstText += obj.content_block.text;
        return;
      }
      if (obj.type === 'completion' && typeof obj.completion === 'string') { asstText += obj.completion; return; }
      if (obj.type === 'message_stop' || obj.type === 'message_complete') { if (asstText.trim()) flush(); }
    }

    return {
      feed(chunk) {
        buffer += chunk;
        let idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          handleLine(buffer.slice(0, idx));
          buffer = buffer.slice(idx + 1);
        }
      },
      finish() { if (buffer) handleLine(buffer); buffer = ''; flush(); },
    };
  }

  function makeGrokStreamReader(convId) {
    let buffer = '';
    let asstText = '';
    let asstId = null;
    let flushed = false;

    function flush() {
      if (flushed) return;
      flushed = true;
      if (asstText.trim()) emit({ platform: 'grok', convId, role: 'assistant', content: asstText, messageId: asstId, done: true });
    }

    function handleLine(raw) {
      const line = raw.trim();
      if (!line) return;
      let obj;
      try { obj = JSON.parse(line); } catch { return; }
      const r = obj.result || obj;
      if (r.modelResponse) {
        if (r.modelResponse.responseId) asstId = r.modelResponse.responseId;
        if (typeof r.modelResponse.message === 'string') asstText = r.modelResponse.message;
        flush();
        return;
      }
      if (r.responseId) asstId = r.responseId;
      if (r.isSoftStop) { flush(); return; }
      if (typeof r.token === 'string' && r.token) {
        const tag = r.messageTag || '';
        if (tag === 'final' || (!tag && !r.isThinking)) asstText += r.token;
      }
    }

    return {
      feed(chunk) {
        buffer += chunk;
        let idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          handleLine(buffer.slice(0, idx));
          buffer = buffer.slice(idx + 1);
        }
      },
      finish() { if (buffer) handleLine(buffer); buffer = ''; flush(); },
    };
  }

  function makeGeminiStreamReader(convId) {
    // StreamGenerate returns length-prefixed BatchExecute envelopes. We
    // accumulate the full body and parse on finish — Gemini's per-envelope
    // assistant text is cumulative (each envelope contains the full text so
    // far at data[4][0][1][0]), so picking the longest one yields the final
    // answer without incremental tracking.
    let buffer = '';
    let lastConvId = convId;
    let asstId = null;
    let flushed = false;

    function flush() {
      if (flushed) return;
      flushed = true;
      const envelopes = parseGeminiBatchExecute(buffer);
      let asstText = '';
      for (const env of envelopes) {
        const data = env.data;
        if (!Array.isArray(data)) continue;
        const cid = data[1] && data[1][0];
        const rid = data[1] && data[1][1];
        if (typeof cid === 'string' && /^c_/.test(cid) && !lastConvId) lastConvId = cid;
        if (typeof rid === 'string' && /^r_/.test(rid)) asstId = rid;
        const text = data[4] && data[4][0] && data[4][0][1] && data[4][0][1][0];
        if (typeof text === 'string' && text.length > asstText.length) asstText = text;
      }
      if (asstText.trim()) {
        emit({ platform: 'gemini', convId: lastConvId, role: 'assistant', content: asstText, messageId: asstId, done: true });
      }
    }

    return {
      feed(chunk) { buffer += chunk; },
      finish() { flush(); },
      getConvId() { return lastConvId; },
    };
  }

  // ---- Transparent stream tee ----
  // Creates a TransformStream that passes data through unchanged while
  // feeding a copy to the reader. This avoids response.clone() entirely.

  function teeStream(originalBody, reader) {
    const decoder = new TextDecoder();
    let chunkCount = 0;
    const MAX_DBG = 5;

    return new ReadableStream({
      async start(controller) {
        const bodyReader = originalBody.getReader();
        try {
          while (true) {
            const { value, done } = await bodyReader.read();
            if (done) {
              reader.finish();
              controller.close();
              break;
            }
            // Pass through to consumer immediately
            controller.enqueue(value);
            // Feed our parser (in a try/catch so errors never block the stream)
            try {
              const text = decoder.decode(value, { stream: true });
              if (DEBUG && chunkCount < MAX_DBG) { dbg(`chunk#${chunkCount}`, text.slice(0, 200)); chunkCount++; }
              reader.feed(text);
            } catch {}
          }
        } catch (err) {
          try { reader.finish(); } catch {}
          controller.error(err);
        }
      },
      cancel(reason) {
        try { reader.finish(); } catch {}
      }
    });
  }

  // ---- fetch patch ----

  const _origFetch = window.fetch;
  let origFetch = _origFetch.bind(window);

  function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input
      : input instanceof Request ? input.url : String(input);

    const method = ((init?.method) || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    // Fast path: non-target URLs pass through with ZERO overhead
    const isHistory = (method === 'GET' && isHistoryUrl(url))
      || (PLATFORM === 'grok' && method === 'POST' && /load-responses/.test(url))
      || (PLATFORM === 'gemini' && method === 'POST' && isHistoryUrl(url));
    const isStream = method === 'POST' && isStreamUrl(url);

    if (!isHistory && !isStream) {
      return origFetch(input, init);
    }

    // ---- History load: parse response in background ----
    if (isHistory) {
      dbg('history-load', url);
      const p = origFetch(input, init);
      p.then(response => {
        const cloned = response.clone();
        if (PLATFORM === 'gemini') {
          // Gemini history is also BatchExecute-encoded (text, not JSON)
          cloned.text().then(text => {
            const msgs = parseGeminiHistory(text);
            if (msgs.length > 0) {
              emitHistory({
                platform: PLATFORM,
                convId: extractConvId(url) || null,
                title: null,
                messages: msgs,
              });
            }
          }).catch(() => {});
        } else {
          cloned.json().then(json => {
            const convId = extractConvId(url);
            const msgs = PLATFORM === 'chatgpt' ? parseChatGPTHistory(json)
              : PLATFORM === 'grok' ? parseGrokHistory(json)
              : parseClaudeHistory(json);
            if (msgs.length > 0) {
              emitHistory({
                platform: PLATFORM,
                convId: convId || json.conversation_id || json.uuid || json.conversationId || null,
                title: json.title || json.name || null,
                messages: msgs,
              });
            }
          }).catch(() => {});
        }
      }).catch(() => {});
      return p;
    }

    // ---- Stream intercept: tee the response body ----
    dbg('stream-intercept', url);

    // Extract user message from request body (sync only — never consume ReadableStream bodies)
    let pendingUser = null;
    const bodyObj = (input instanceof Request) ? null
      : PLATFORM === 'gemini' ? tryParseGeminiBody(init)
      : tryParseBody(init);
    if (bodyObj) {
      const user = extractUser(bodyObj);
      if (user) {
        const urlConvId = extractConvId(url);
        const knownConvId = user.convId || urlConvId;
        if (knownConvId) {
          emit({ platform: PLATFORM, convId: knownConvId, role: 'user', content: user.content, done: true });
        } else {
          pendingUser = user.content;
        }
      }
    }

    return origFetch(input, init).then(response => {
      // Only tee if there's a readable body
      if (!response.body) return response;

      const convId = extractConvId(url);
      const reader = PLATFORM === 'chatgpt' ? makeChatGPTStreamReader(convId)
        : PLATFORM === 'claude' ? makeClaudeStreamReader(convId)
        : PLATFORM === 'gemini' ? makeGeminiStreamReader(convId)
        : makeGrokStreamReader(convId);

      // Emit pending user message once we get stream data
      if (pendingUser) {
        const origFeed = reader.feed.bind(reader);
        let emitted = false;
        reader.feed = function(chunk) {
          if (!emitted) {
            emitted = true;
            const cid = reader.getConvId?.() || convId;
            if (cid || PLATFORM !== 'chatgpt') {
              emit({ platform: PLATFORM, convId: cid, role: 'user', content: pendingUser, done: true });
              pendingUser = null;
            } else {
              // For ChatGPT, try to extract convId from first chunk
              try {
                const m = chunk.match(/"conversation_id"\s*:\s*"([^"]+)"/);
                if (m) {
                  emit({ platform: PLATFORM, convId: m[1], role: 'user', content: pendingUser, done: true });
                  pendingUser = null;
                }
              } catch {}
            }
          }
          origFeed(chunk);
          // Retry convId extraction after parse
          if (pendingUser && reader.getConvId?.()) {
            emit({ platform: PLATFORM, convId: reader.getConvId(), role: 'user', content: pendingUser, done: true });
            pendingUser = null;
          }
        };
      }

      const newBody = teeStream(response.body, reader);
      return new Response(newBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    });
  }

  // Protect against re-assignment
  try {
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      enumerable: true,
      get() { return patchedFetch; },
      set(newFetch) {
        if (newFetch !== patchedFetch && typeof newFetch === 'function') {
          dbg('fetch re-assigned by 3rd party, wrapping');
          origFetch = newFetch.bind(window);
        }
      },
    });
    dbg('fetch patched via defineProperty');
  } catch {
    window.fetch = patchedFetch;
  }
})();
