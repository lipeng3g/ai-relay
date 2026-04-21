// AI Relay · parsers.js
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
    let buffer = '';
    let asstText = '';
    let asstId = null;
    const results = [];

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
        return;
      }
      if (type === 'content_block_delta' && obj.delta) {
        if (typeof obj.delta.text === 'string') asstText += obj.delta.text;
        return;
      }
      if (type === 'completion' && typeof obj.completion === 'string') {
        asstText += obj.completion;
        return;
      }
      if (type === 'message_stop' || type === 'message_complete' || type === 'message_delta') {
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
  exports.parseChatGPTHistory = parseChatGPTHistory;
  exports.parseClaudeHistory = parseClaudeHistory;
  exports.parseGrokHistory = parseGrokHistory;
  exports.extractUserFromChatGPTBody = extractUserFromChatGPTBody;
  exports.extractUserFromClaudeBody = extractUserFromClaudeBody;
  exports.extractUserFromGrokBody = extractUserFromGrokBody;

})(typeof module !== 'undefined' ? module.exports : (window.AIRelayParsers = {}));
