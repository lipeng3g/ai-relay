// AI Relay · compress.js
// Two compression strategies:
//   1. LLM-based: call a cheap OpenAI-compatible model to summarize
//   2. Fallback: keep recent N turns verbatim, older turns as one-line topics
//
// Input: session { platform, messages: [{role, content}] }
// Output: Markdown "relay snapshot" string (or Promise for LLM mode)

(function (global) {
  const PLATFORM_LABEL = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    grok: 'Grok',
  };

  const COMPRESS_FALLBACK = {
    snap_header: '# Relay Snapshot · from {source} · {date}\n> Mode: {mode} · Original: {msgs} messages ({turns} turns)',
    snap_mode_llm: 'AI Summary',
    snap_mode_raw: 'Verbatim',
    snap_old_section: '## Earlier Conversation Summary',
    snap_recent_section: '## Recent Conversation (verbatim)',
    snap_last_user: '### User  ⬅ This is the message you should answer',
    snap_footer: '---\nYou are a relay AI. First, briefly confirm you understand the above context, then directly answer the last User message. Do not repeat the summary.\n\n— Relayed via AI Relay · https://github.com/lipeng3g/ai-relay',
    snap_trimmed: '_(…content trimmed for length…)_',
    llm_system_prompt: 'You are a conversation compression assistant. Compress an AI conversation into a relay summary so another AI can seamlessly continue.\n\nRules:\n1. Newer content is more important. Last 2-3 turns must be preserved verbatim (code blocks, tables, etc.)\n2. Code blocks must be kept intact\n3. Older turns: one sentence summary each\n4. Output format:\n\n## Earlier Conversation Summary\n(summaries)\n\n## Recent Conversation (verbatim)\n\n### User\n(original text)\n\n### Assistant\n(original text)\n\n### User  ⬅ This is the message you should answer\n(last user message)\n\n5. Last User heading MUST be "### User  ⬅ This is the message you should answer"\n6. Do NOT add --- or extra notes at the end\n7. Output in the same language as the conversation',
    llm_user_prompt: 'Compress the following {turns}-turn conversation from {source} into a relay summary. Keep total length under {budget} characters.',
  };

  function t(key, params) {
    if (global.AIRelayI18n) return global.AIRelayI18n.t(key, params);
    let text = COMPRESS_FALLBACK[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.split(`{${k}}`).join(String(v));
      }
    }
    return text;
  }

  // ---------- Shared helpers ----------

  function trim(s, n) {
    if (!s) return '';
    s = s.trim();
    if (s.length <= n) return s;
    return s.slice(0, n) + '…';
  }

  function toTurns(messages) {
    const turns = [];
    let current = null;
    for (const m of messages) {
      if (m.role === 'user') {
        if (current) turns.push(current);
        current = { user: m.content, assistant: null };
      } else if (m.role === 'assistant' && current) {
        current.assistant = m.content;
      }
    }
    if (current) turns.push(current);
    return turns;
  }

  function makeHeader(sourceLabel, msgCount, turnCount, mode) {
    const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const modeLabel = mode === 'llm' ? t('snap_mode_llm') : t('snap_mode_raw');
    return t('snap_header', { source: sourceLabel, date, mode: modeLabel, msgs: msgCount, turns: turnCount }) + '\n';
  }

  function makeFooter() {
    return t('snap_footer');
  }

  // ---------- Strategy B: Fallback (no API key) ----------

  const FALLBACK_DEFAULTS = {
    recentTurns: 3,
    maxTotalChars: 12000,
  };

  function compressFallback(session, options) {
    if (!session || !Array.isArray(session.messages) || session.messages.length === 0) {
      return '';
    }
    const opts = { ...FALLBACK_DEFAULTS, ...options };
    const msgs = session.messages;
    const sourceLabel = PLATFORM_LABEL[session.platform] || session.platform || 'AI';
    const turns = toTurns(msgs);
    const recentCount = Math.min(opts.recentTurns, turns.length);
    const olderTurns = turns.slice(0, turns.length - recentCount);
    const recentTurns = turns.slice(turns.length - recentCount);

    const lines = [];
    lines.push(makeHeader(sourceLabel, msgs.length, turns.length, 'fallback'));
    lines.push('');

    if (olderTurns.length > 0) {
      lines.push(t('snap_old_section'));
      for (let i = 0; i < olderTurns.length; i++) {
        const tu = olderTurns[i];
        lines.push(`${i + 1}. **User**: ${trim(tu.user, 150)}`);
        if (tu.assistant) {
          const firstLine = tu.assistant.replace(/```[\s\S]*?```/g, ' ')
            .split('\n').map((l) => l.trim()).filter((l) => l.length > 5)[0] || '';
          lines.push(`   **Assistant**: ${trim(firstLine, 200)}`);
        }
      }
      lines.push('');
    }

    lines.push(t('snap_recent_section'));
    for (let i = 0; i < recentTurns.length; i++) {
      const tu = recentTurns[i];
      const isLast = i === recentTurns.length - 1 && !tu.assistant;
      lines.push('');
      if (isLast) {
        lines.push(t('snap_last_user'));
      } else {
        lines.push('### User');
      }
      lines.push(tu.user);

      if (tu.assistant) {
        lines.push('');
        lines.push('### Assistant');
        lines.push(tu.assistant);
      }
    }
    lines.push('');
    lines.push(makeFooter());

    let result = lines.join('\n');

    if (result.length > opts.maxTotalChars) {
      result = enforceBudget(result, opts.maxTotalChars);
    }

    return result;
  }

  function enforceBudget(text, budget) {
    const recentSectionTitle = t('snap_recent_section');
    const sections = text.split(/^(## .+)$/m);
    const parts = [];
    let preamble = sections[0];
    for (let i = 1; i < sections.length; i += 2) {
      parts.push({ header: sections[i], body: sections[i + 1] || '' });
    }

    let attempts = 0;
    while (attempts < 10) {
      const current = preamble + parts.map((p) => p.header + p.body).join('');
      if (current.length <= budget) return current;

      let maxIdx = -1, maxLen = 0;
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].body.length < 100) continue;
        const isRecent = parts[i].header.includes('Recent') || parts[i].header.includes('最近');
        const priority = isRecent ? 0.5 : 1;
        const effective = parts[i].body.length * priority;
        if (effective > maxLen) {
          maxLen = effective;
          maxIdx = i;
        }
      }
      if (maxIdx === -1) break;
      const halfLen = Math.floor(parts[maxIdx].body.length / 2);
      parts[maxIdx].body = parts[maxIdx].body.slice(0, halfLen) + '\n\n' + t('snap_trimmed') + '\n';
      attempts++;
    }

    return preamble + parts.map((p) => p.header + p.body).join('');
  }

  // ---------- Strategy A: LLM compression ----------

  function getLLMSystemPrompt() {
    return t('llm_system_prompt');
  }

  function buildLLMUserPrompt(session, budget) {
    const msgs = session.messages;
    const sourceLabel = PLATFORM_LABEL[session.platform] || session.platform || 'AI';
    const turns = toTurns(msgs);

    let conversationText = '';
    for (let i = 0; i < turns.length; i++) {
      conversationText += `[Turn ${i + 1}]\nUser: ${turns[i].user}\n`;
      if (turns[i].assistant) {
        conversationText += `Assistant: ${turns[i].assistant}\n`;
      }
      conversationText += '\n';
    }

    return t('llm_user_prompt', { source: sourceLabel, turns: turns.length, budget }) +
      `\n\n---\n${conversationText}---`;
  }

  async function compressWithLLM(session, apiConfig, options) {
    if (!session || !Array.isArray(session.messages) || session.messages.length === 0) {
      return '';
    }
    const opts = { budget: 8000, ...options };
    const msgs = session.messages;
    const sourceLabel = PLATFORM_LABEL[session.platform] || session.platform || 'AI';
    const turns = toTurns(msgs);

    if (turns.length <= 3) {
      return compressFallback(session, options);
    }

    const endpoint = (apiConfig.endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = apiConfig.model || 'gpt-4.1-mini';

    const body = {
      model,
      messages: [
        { role: 'system', content: getLLMSystemPrompt() },
        { role: 'user', content: buildLLMUserPrompt(session, opts.budget) },
      ],
      max_tokens: Math.ceil(opts.budget / 2),
      temperature: 0.3,
    };

    const resp = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.key}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`LLM API error ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content || '';
    if (!content.trim()) {
      throw new Error('LLM returned empty response');
    }

    content = content.trim()
      .replace(/\n---\s*\n.*接力.*AI[\s\S]*$/m, '')
      .replace(/\n---\s*\n.*relay.*AI[\s\S]*$/im, '')
      .replace(/\n---\s*\n\s*⬅.*$/m, '')
      .replace(/\n---\s*$/m, '')
      .trim();

    const header = makeHeader(sourceLabel, msgs.length, turns.length, 'llm');
    return header + '\n' + content + '\n\n' + makeFooter();
  }

  // ---------- Unified entry point ----------

  function compress(session, options) {
    return compressFallback(session, options);
  }

  async function compressAsync(session, apiConfig, options) {
    if (apiConfig && apiConfig.key) {
      try {
        return await compressWithLLM(session, apiConfig, options);
      } catch (err) {
        console.warn('[AI Relay] LLM compress failed, using fallback:', err.message);
        return compressFallback(session, options);
      }
    }
    return compressFallback(session, options);
  }

  // ---------- Stats ----------

  function estimateStats(session) {
    if (!session || !Array.isArray(session.messages)) {
      return { turns: 0, chars: 0, approxTokens: 0 };
    }
    const turns = session.messages.length;
    const chars = session.messages.reduce((s, m) => s + (m.content?.length || 0), 0);
    const approxTokens = Math.ceil(chars / 3.5);
    return { turns, chars, approxTokens };
  }

  function snapshotStats(snapshotText) {
    if (!snapshotText) return { chars: 0, approxTokens: 0 };
    const chars = snapshotText.length;
    return { chars, approxTokens: Math.ceil(chars / 3.5) };
  }

  global.AIRelayCompress = {
    compress,
    compressAsync,
    compressFallback,
    compressWithLLM,
    estimateStats,
    snapshotStats,
    FALLBACK_DEFAULTS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
