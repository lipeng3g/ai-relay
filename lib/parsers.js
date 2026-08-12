// AICarry · parsers.js
// Extracted parsing logic that can run both in page context (via page-inject.js)
// and in Node.js tests. No browser APIs used — pure functions only.

(function (exports) {
  // ---------- ChatGPT SSE parsing ----------

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

  function makeChatGPTAssistantAccumulator(urlConvId) {
    let asst = null;
    let lastConvId = urlConvId;
    const results = [];

    function flush() {
      if (asst && Array.isArray(asst.parts)) {
        const text = asst.parts.join('');
        if (text.trim()) {
          results.push({
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
      if ((op === 'add' || op === 'replace') && value?.message?.author) {
        handleFullMessage(value.message);
        return;
      }
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
      if (path === '/message/status' && asst) {
        asst.status = value;
        return;
      }
      if (op === 'patch' && Array.isArray(value)) {
        for (const p of value) applyPatch(p.p || '', p.o || 'replace', p.v);
      }
    }

    function onEvent(ev) {
      if (!ev.data) return;
      if (ev.data === '[DONE]') { flush(); return; }
      let obj;
      try { obj = JSON.parse(ev.data); } catch { return; }

      if (obj.conversation_id) lastConvId = obj.conversation_id;
      if (obj.v?.conversation_id) lastConvId = obj.v.conversation_id;

      if (obj.message?.author) { handleFullMessage(obj.message); return; }
      if (obj.v && typeof obj.v === 'object' && obj.v.message?.author) { handleFullMessage(obj.v.message); return; }
      if (typeof obj.p === 'string' && obj.p.length > 0) { applyPatch(obj.p, obj.o || 'replace', obj.v); return; }
      if (Array.isArray(obj.patches)) { for (const p of obj.patches) applyPatch(p.p || '', p.o || 'replace', p.value ?? p.v); return; }
      if (Array.isArray(obj.v)) { for (const p of obj.v) { if (p && typeof p === 'object' && typeof p.p === 'string') applyPatch(p.p, p.o || 'replace', p.v); } return; }
      if (typeof obj.v === 'string' && asst) { appendToCurrent(obj.v); return; }
      if (obj.p === '' && (obj.o === 'add' || obj.o === 'replace') && obj.v?.message?.author) { handleFullMessage(obj.v.message); return; }
    }

    return { onEvent, flush, getResults: () => results, getConvId: () => lastConvId };
  }

  // Parse raw SSE text (as would be returned by fetch response body) into messages.
  function parseChatGPTSSE(sseText, urlConvId) {
    const acc = makeChatGPTAssistantAccumulator(urlConvId);
    const sse = makeSSEReader(acc.onEvent);
    sse(sseText);
    sse('data: [DONE]\n\n');
    return { messages: acc.getResults(), convId: acc.getConvId() };
  }

  // ---------- Claude stream parsing ----------

  function parseClaudeStream(streamText, convId) {
    let asstText = '';
    let asstId = null;
    let curToolName = null;
    let curToolInput = '';
    const results = [];

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

    function handleLine(rawLine) {
      let line = rawLine.trim();
      if (!line) return;
      if (line.startsWith('event:')) return;
      if (line.startsWith('data:')) line = line.slice(5).trimStart();
      if (!line || line === '[DONE]') return;

      let obj;
      try { obj = JSON.parse(line); } catch { return; }
      const type = obj.type;

      if (type === 'message_start' && obj.message) {
        asstId = obj.message.uuid || obj.message.id || asstId;
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
        if (obj.content_block.type === 'tool_use') {
          flushTool();
          curToolName = obj.content_block.name || '';
          curToolInput = '';
        }
        return;
      }
      if (type === 'content_block_delta' && obj.delta) {
        if (typeof obj.delta.text === 'string') asstText += obj.delta.text;
        if (obj.delta.type === 'input_json_delta' && typeof obj.delta.partial_json === 'string')
          curToolInput += obj.delta.partial_json;
        return;
      }
      if (type === 'content_block_stop' && curToolName) {
        flushTool();
        return;
      }
      if (type === 'completion' && typeof obj.completion === 'string') {
        asstText += obj.completion;
        return;
      }
      if (type === 'message_stop' || type === 'message_complete' || type === 'message_delta') {
        flushTool();
        if (asstText.trim()) {
          results.push({
            platform: 'claude',
            convId,
            role: 'assistant',
            content: asstText,
            messageId: asstId,
            done: true,
          });
          asstText = '';
          asstId = null;
        }
        return;
      }
    }

    const lines = streamText.split('\n');
    for (const line of lines) handleLine(line);
    flushTool();
    if (asstText.trim()) {
      results.push({ platform: 'claude', convId, role: 'assistant', content: asstText, messageId: asstId, done: true });
    }
    return { messages: results };
  }

  // ---------- History (GET) parsers ----------

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

  function parseClaudeHistory(json) {
    const messages = [];
    const chatMessages = json.chat_messages;
    if (!Array.isArray(chatMessages)) return messages;
    const leaf = json.current_leaf_message_uuid;

    // Build uuid→message map and resolve active branch via leaf traversal
    const byUuid = new Map();
    for (const m of chatMessages) byUuid.set(m.uuid, m);

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
      activeMsgs = chatMessages;
    }

    for (const m of activeMsgs) {
      const role = m.sender === 'human' ? 'user'
        : m.sender === 'assistant' ? 'assistant'
        : null;
      if (!role) continue;

      const parts = [];
      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === 'text' && typeof b.text === 'string' && b.text.trim())
            parts.push(b.text);
          if (b.type === 'tool_use' && b.input?.file_text) {
            const fname = b.input.path?.split('/').pop() || b.input.description || 'artifact';
            parts.push(`\n\`\`\`\n// ${fname}\n${b.input.file_text}\n\`\`\``);
          }
        }
      }
      let text = parts.join('\n');
      if (!text && typeof m.text === 'string') text = m.text;
      if (text.trim()) {
        messages.push({ role, content: text, messageId: m.uuid || null });
      }
    }
    return messages;
  }

  // ---------- Grok history parser ----------

  function cleanGrokText(text) {
    if (typeof text !== 'string') return '';
    return text
      // Internal inline cards/citations are UI instructions, not answer text.
      .replace(/<grok:render\b[^>]*>[\s\S]*?<\/grok:render>/gi, '')
      .replace(/<grok:render\b[^>]*\/>/gi, '')
      .replace(/<\/?(?:grok|xai):[^>]*>/gi, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

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

      const rawText = m.message || m.content || m.text || '';
      const text = role === 'assistant' ? cleanGrokText(rawText) : rawText;
      if (typeof text === 'string' && text.trim()) {
        messages.push({ role, content: text, messageId: m.responseId || m.id || m.messageId || null });
      }
    }
    return messages;
  }

  // ---------- Gemini (Google BatchExecute RPC) ----------
  //
  // Gemini's web UI uses Google's internal BatchExecute / wrb.fr protocol.
  // Responses are prefixed with `)]}'` (anti-JSON-hijacking) and consist of
  // length-prefixed JSON arrays. Each `wrb.fr` envelope wraps a stringified
  // JSON payload that needs a second parse.
  //
  // Envelope shape:  ["wrb.fr", "<rpcId>" | null, "<stringified-data>"]
  //
  // Two relevant RPCs are dispatched on POST `/_/BardChatUi/data/batchexecute`:
  //
  //   rpcId = "hNvQHb"                            → conversation history load
  //   POST `/.../assistant.lamda.BardFrontendService/StreamGenerate` → live stream
  //
  // The history endpoint is shared with many unrelated RPCs (UI prefs, list,
  // etc.); we filter by rpcId. The stream endpoint is dedicated.
  //
  // Field paths verified against real recordings (2026-04-25):
  //
  //   --- Stream (StreamGenerate) per-envelope ---
  //   data[1][0]            = conversation_id (c_xxx)
  //   data[1][1]            = response_id (r_xxx)
  //   data[4][0][0]         = response chunk id (rc_xxx)
  //   data[4][0][1][0]      = assistant text (cumulative; pick longest envelope)
  //   data[4][0][37]        = thinking trace (English internal CoT — IGNORE)
  //
  //   --- History (rpcId=hNvQHb) per-envelope ---
  //   data[0]                       = turn list, length = N
  //   data[0][i][0][0]              = conversation_id (c_xxx)
  //   data[0][i][0][1]              = user-side response_id
  //   data[0][i][1]                 = [c, r, rc] or null (branch metadata)
  //   data[0][i][2][0][0]           = USER text
  //   data[0][i][3][0][0][0]        = response chunk id (rc_xxx)
  //   data[0][i][3][0][0][1][0]     = ASSISTANT text
  //   data[0][i][3][0][0][37]       = thinking trace (IGNORE)

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

  // Used only by extractUserFromGeminiBody fallback when precise field path
  // for request body is still unknown. Kept simple and exported for tests.
  function findLongestString(node, minLen) {
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

  // Gemini frequently embeds the actual RPC params as one or more layers of
  // stringified JSON. Treat successfully parsed JSON strings as containers,
  // not prompt candidates, so the returned content is the final user text
  // instead of a serialized array such as `[["hello",0,null,...]]`.
  function findLongestGeminiLeafString(node) {
    let bestNatural = { text: '', depth: -1 };
    let bestFallback = { text: '', depth: -1 };
    const stack = [{ value: node, depth: 0 }];
    while (stack.length) {
      const { value, depth } = stack.pop();
      if (value == null) continue;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) continue;
        if ((trimmed.startsWith('[') && trimmed.endsWith(']'))
          || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
          try {
            stack.push({ value: JSON.parse(trimmed), depth: depth + 1 });
            continue;
          } catch {}
        }
        // Opaque request/session identifiers can be longer than the prompt.
        // They are transport metadata, never user-authored conversation text.
        if (/^![A-Za-z0-9_-]{20,}$/.test(trimmed)
          || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(trimmed)
          || /^[0-9a-f]{24,}$/i.test(trimmed)
          || /^(?:c_|r_|rc_)[A-Za-z0-9_-]{8,}$/.test(trimmed)
          || (/^[A-Za-z0-9_-]{24,}$/.test(trimmed) && !/[\s\u3400-\u9fff]/.test(trimmed))) {
          continue;
        }
        const naturalLanguage = /[\s\u3400-\u9fff]/.test(trimmed);
        const current = naturalLanguage ? bestNatural : bestFallback;
        if (depth > current.depth || (depth === current.depth && trimmed.length > current.text.length)) {
          const candidate = { text: trimmed, depth };
          if (naturalLanguage) bestNatural = candidate;
          else bestFallback = candidate;
        }
        continue;
      }
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) stack.push({ value: value[i], depth: depth + 1 });
        continue;
      }
      if (typeof value === 'object') {
        for (const child of Object.values(value)) stack.push({ value: child, depth: depth + 1 });
      }
    }
    return bestNatural.text || bestFallback.text;
  }

  function isGeminiTransportArtifact(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    return /^![A-Za-z0-9_-]{20,}$/.test(text)
      || /^[0-9a-f]{24,}$/i.test(text)
      || /^(?:c_|r_|rc_)[A-Za-z0-9_-]{8,}$/.test(text)
      || (/^[A-Za-z0-9_-]{32,}$/.test(text) && !/[\s\u3400-\u9fff]/.test(text));
  }

  function normalizeGeminiUserText(value) {
    const text = String(value || '').trim();
    if (!text || isGeminiTransportArtifact(text)) return '';
    if ((text.startsWith('[') && text.endsWith(']'))
      || (text.startsWith('{') && text.endsWith('}'))) {
      const extracted = findLongestGeminiLeafString(text);
      if (extracted && !isGeminiTransportArtifact(extracted)) return extracted;
    }
    return text;
  }

  function parseGeminiStream(streamText, convId) {
    const envelopes = parseGeminiBatchExecute(streamText);
    let asstText = '';
    let asstId = null;
    let discoveredConvId = convId;

    for (const env of envelopes) {
      const data = env.data;
      if (!Array.isArray(data)) continue;

      const cid = data[1] && data[1][0];
      const rid = data[1] && data[1][1];
      if (typeof cid === 'string' && /^c_/.test(cid) && !discoveredConvId) discoveredConvId = cid;
      if (typeof rid === 'string' && /^r_/.test(rid)) asstId = rid;

      const text = data[4] && data[4][0] && data[4][0][1] && data[4][0][1][0];
      if (typeof text === 'string' && text.length > asstText.length) asstText = text;
    }

    const results = [];
    if (asstText.trim()) {
      results.push({
        platform: 'gemini',
        convId: discoveredConvId,
        role: 'assistant',
        content: asstText,
        messageId: asstId,
        done: true,
      });
    }
    return { messages: results, convId: discoveredConvId };
  }

  function parseGeminiHistory(textOrJson) {
    let envelopes;
    if (typeof textOrJson === 'string') {
      envelopes = parseGeminiBatchExecute(textOrJson);
    } else if (textOrJson && typeof textOrJson === 'object') {
      envelopes = [{ rpcId: 'hNvQHb', data: textOrJson }];
    } else {
      return [];
    }

    const messages = [];
    for (const env of envelopes) {
      // History RPC id is hNvQHb; ignore other RPCs sharing the batchexecute endpoint.
      // (When called with a parsed JSON we trust the caller — see branch above.)
      if (env.rpcId && env.rpcId !== 'hNvQHb') continue;

      const turns = env.data && env.data[0];
      if (!Array.isArray(turns)) continue;

      // Gemini's history RPC returns current conversations newest-first. A
      // per-turn Unix timestamp lives at turn[4][0]; sort by it when every
      // turn provides one. Preserve source order for synthetic/older payloads
      // that omit timestamps rather than guessing.
      const timestampedTurns = turns.map((turn, index) => {
        const timestamp = Number(turn?.[4]?.[0]);
        return { turn, index, timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null };
      });
      const orderedTurns = timestampedTurns.every((item) => item.timestamp != null)
        ? timestampedTurns.sort((a, b) => a.timestamp - b.timestamp || a.index - b.index).map((item) => item.turn)
        : turns;

      for (const turn of orderedTurns) {
        if (!Array.isArray(turn)) continue;

        const convId = turn[0] && turn[0][0];
        const userRespId = turn[0] && turn[0][1];
        const userText = turn[2] && turn[2][0] && turn[2][0][0];
        const normalizedUserText = typeof userText === 'string' ? normalizeGeminiUserText(userText) : '';
        if (normalizedUserText) {
          messages.push({ role: 'user', content: normalizedUserText, messageId: typeof userRespId === 'string' ? userRespId : null });
        }

        const asstNode = turn[3] && turn[3][0] && turn[3][0][0];
        const asstChunkId = asstNode && asstNode[0];
        const asstText = asstNode && asstNode[1] && asstNode[1][0];
        if (typeof asstText === 'string' && asstText.trim() && !isGeminiTransportArtifact(asstText)) {
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

  function extractUserFromGeminiBody(body) {
    if (!body) return null;
    // Gemini POST bodies are URL-encoded `f.req=<JSON>`. Accept both
    // already-parsed arrays (from page-inject's tryParseGeminiBody) and
    // raw form-urlencoded strings (from tests/Node consumers).
    if (typeof body === 'string') {
      const m = body.match(/(?:^|&)f\.req=([^&]+)/);
      if (!m) return null;
      try { body = JSON.parse(decodeURIComponent(m[1])); } catch { return null; }
    }
    // BatchExecute params layout for StreamGenerate is opaque. Recursively
    // unwrap stringified JSON layers, then use the longest leaf string as the
    // user prompt.
    // History merge will replace this with the precise turn[i][2][0][0]
    // value on the next history fetch.
    const text = findLongestGeminiLeafString(body);
    if (text) return { role: 'user', content: text };
    return null;
  }

  // ---------- Grok stream parser ----------

  function parseGrokStream(streamText, convId) {
    let asstText = '';
    let asstId = null;
    let discoveredConvId = convId;
    const results = [];

    const lines = streamText.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      let obj;
      try { obj = JSON.parse(line); } catch { continue; }

      const result = obj.result || obj;

      if (result.conversationId) discoveredConvId = result.conversationId;
      if (obj.conversationId) discoveredConvId = obj.conversationId;
      if (result.responseId) asstId = result.responseId;

      // modelResponse contains the full assembled message — use it directly
      if (result.modelResponse) {
        const mr = result.modelResponse;
        if (mr.responseId) asstId = mr.responseId;
        if (mr.message && typeof mr.message === 'string') {
          asstText = mr.message;
        }
        continue;
      }

      // Skip userResponse echo
      if (result.userResponse) continue;

      if (result.responseType === 'limiter') continue;

      // Only accumulate tokens from final assistant text
      if (typeof result.token === 'string' && result.token) {
        const tag = result.messageTag || '';
        if (tag === 'final' || (!tag && !result.isThinking)) {
          asstText += result.token;
        }
      }
    }

    asstText = cleanGrokText(asstText);
    if (asstText.trim()) {
      results.push({
        platform: 'grok',
        convId: discoveredConvId,
        role: 'assistant',
        content: asstText,
        messageId: asstId,
        done: true,
      });
    }
    return { messages: results, convId: discoveredConvId };
  }

  // ---------- Grok WebSocket event parser ----------

  function grokTextValue(value, depth) {
    depth = depth || 0;
    if (depth > 5 || value == null) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value.map((part) => grokTextValue(part, depth + 1)).filter(Boolean).join('');
    }
    if (typeof value !== 'object') return '';
    for (const key of ['text', 'value', 'content', 'delta']) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const text = grokTextValue(value[key], depth + 1);
        if (text) return text;
      }
    }
    return '';
  }

  function grokItemText(item) {
    if (!item || typeof item !== 'object') return '';
    const directContent = grokTextValue(item.content);
    if (directContent.trim()) return directContent;

    // The current Grok client places outgoing user text below item.x_grok.
    // Its exact nesting changes frequently, so prefer message-like field names
    // and never mistake IDs, modes or event tags for the prompt.
    const candidates = [];
    const preferred = /^(text|message|prompt|content|query|user_message)$/i;
    const stack = [item.x_grok];
    const seen = new Set();
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (Array.isArray(node)) {
        for (const child of node) stack.push(child);
        continue;
      }
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string' && preferred.test(key) && value.trim()) {
          candidates.push(value);
        } else if (value && typeof value === 'object') {
          stack.push(value);
        }
      }
    }
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0] || '';
  }

  function parseGrokWsEvent(frame) {
    let root = frame;
    if (typeof root === 'string') {
      try { root = JSON.parse(root); } catch { return null; }
    }
    if (!root || typeof root !== 'object') return null;
    let event = root.event || root;
    if (typeof event === 'string') {
      try { event = JSON.parse(event); } catch { return null; }
    }
    if (!event || typeof event !== 'object' || typeof event.type !== 'string') return null;

    const out = { type: event.type };
    if (event.type === 'conversation.attached' && typeof event.conversation?.id === 'string') {
      out.convId = event.conversation.id;
    }
    if (event.type === 'conversation.item.create') {
      const role = String(event.item?.role || '').toLowerCase();
      const content = role === 'user' ? grokItemText(event.item) : '';
      if (content.trim()) {
        out.user = { role: 'user', content, messageId: event.item?.id || event.event_id || null };
      }
    }
    if (event.type === 'response.created') {
      out.responseId = event.response?.id || null;
      out.reset = true;
    }
    if (event.type === 'response.output_item.added') {
      out.messageId = event.item?.id || event.item_id || null;
      out.responseId = event.response_id || null;
    }
    if (event.type === 'response.chunk') {
      // Text-only chunks are transient UI status labels (for example
      // "Thinking about your request"). Final answer chunks carry metadata.
      const delta = event.chunk?.metadata && typeof event.chunk.metadata === 'object'
        ? grokTextValue(event.chunk.text)
        : '';
      if (delta) out.delta = delta;
      out.messageId = event.item_id || null;
      out.responseId = event.response_id || null;
    }
    if (event.type === 'response.output_text.done') {
      const text = grokTextValue(event.text);
      if (text) out.text = text;
      out.messageId = event.item_id || null;
      out.responseId = event.response_id || null;
      out.done = true;
    }
    if (event.type === 'response.output_item.done') {
      const text = grokItemText(event.item);
      if (text) out.text = text;
      out.messageId = event.item?.id || event.item_id || null;
      out.responseId = event.response_id || null;
      out.done = true;
    }
    if (event.type === 'response.done') {
      out.responseId = event.response?.id || null;
      out.done = true;
    }
    return out;
  }

  function makeGrokWsAccumulator(initialConvId) {
    const state = {
      convId: initialConvId || null,
      text: '',
      messageId: null,
      responseId: null,
      emittedResponseId: null,
    };

    return {
      push(frame, direction) {
        const parsed = parseGrokWsEvent(frame);
        const messages = [];
        if (!parsed) return { messages, convId: state.convId };

        if (parsed.convId) state.convId = parsed.convId;
        if (direction === 'out' && parsed.user) {
          messages.push({
            platform: 'grok',
            convId: state.convId,
            ...parsed.user,
            done: true,
          });
        }
        if (parsed.reset) {
          state.text = '';
          state.messageId = null;
          state.responseId = parsed.responseId || null;
        }
        if (parsed.responseId) state.responseId = parsed.responseId;
        if (parsed.messageId) state.messageId = parsed.messageId;
        if (typeof parsed.delta === 'string') state.text += parsed.delta;
        if (typeof parsed.text === 'string' && parsed.text.trim() && !state.text.trim()) {
          state.text = parsed.text;
        }

        if (direction === 'in' && parsed.done && state.text.trim()) {
          const dedupId = state.responseId || state.messageId || state.text;
          if (state.emittedResponseId !== dedupId) {
            const content = cleanGrokText(state.text);
            if (!content) return { messages, convId: state.convId };
            messages.push({
              platform: 'grok',
              convId: state.convId,
              role: 'assistant',
              content,
              messageId: state.messageId || state.responseId,
              done: true,
            });
            state.emittedResponseId = dedupId;
          }
        }
        return { messages, convId: state.convId };
      },
    };
  }

  // ---------- Request body parsers ----------

  function extractUserFromChatGPTBody(body) {
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

  // ---------- Exports ----------

  exports.makeSSEReader = makeSSEReader;
  exports.makeChatGPTAssistantAccumulator = makeChatGPTAssistantAccumulator;
  exports.parseChatGPTSSE = parseChatGPTSSE;
  exports.parseClaudeStream = parseClaudeStream;
  exports.parseGrokStream = parseGrokStream;
  exports.parseGrokWsEvent = parseGrokWsEvent;
  exports.makeGrokWsAccumulator = makeGrokWsAccumulator;
  exports.parseGeminiStream = parseGeminiStream;
  exports.parseGeminiBatchExecute = parseGeminiBatchExecute;
  exports.parseChatGPTHistory = parseChatGPTHistory;
  exports.parseClaudeHistory = parseClaudeHistory;
  exports.parseGrokHistory = parseGrokHistory;
  exports.cleanGrokText = cleanGrokText;
  exports.parseGeminiHistory = parseGeminiHistory;
  exports.isGeminiTransportArtifact = isGeminiTransportArtifact;
  exports.normalizeGeminiUserText = normalizeGeminiUserText;
  exports.extractUserFromChatGPTBody = extractUserFromChatGPTBody;
  exports.extractUserFromClaudeBody = extractUserFromClaudeBody;
  exports.extractUserFromGrokBody = extractUserFromGrokBody;
  exports.extractUserFromGeminiBody = extractUserFromGeminiBody;

})(typeof module !== 'undefined' ? module.exports : (window.AIRelayParsers = {}));
