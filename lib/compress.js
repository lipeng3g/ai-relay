// AI Relay · compress.js
// Two compression modes:
//   1. full  — verbatim copy of all messages + relay header/footer
//   2. smart — deterministic: keep all code/user msgs, compress assistant prose
//
// Input: session { platform, messages: [{role, content}] }
// Output: Markdown "relay snapshot" string

(function (global) {
  const PLATFORM_LABEL = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    grok: 'Grok',
    gemini: 'Gemini',
  };

  const COMPRESS_FALLBACK = {
    snap_header: '# Relay Snapshot · from {source} · {date}\n> Mode: {mode} · Original: {msgs} messages ({turns} turns)',
    snap_mode_full: 'Full Verbatim',
    snap_mode_smart: 'Smart Relay',
    snap_section_code: '## Code & Artifacts',
    snap_section_conv: '## Conversation',
    snap_section_old: '## Earlier Conversation Summary',
    snap_section_recent: '## Recent Conversation (verbatim)',
    snap_last_user: '### User  ⬅ This is the message you should answer',
    snap_footer: '---\nYou are a relay AI. First, briefly confirm you understand the above context, then directly answer the last User message. Do not repeat the summary.\n\n— Relayed via AI Relay · https://github.com/lipeng3g/ai-relay',
    snap_trimmed: '_(…content trimmed for length…)_',
    snap_code_from_turn: '(from turn {n})',
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

  // ---- Shared helpers ----

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
    const modeKey = mode === 'full' ? 'snap_mode_full' : mode === 'smart' ? 'snap_mode_smart' : 'snap_mode_summary';
    const modeLabel = t(modeKey);
    return t('snap_header', { source: sourceLabel, date, mode: modeLabel, msgs: msgCount, turns: turnCount }) + '\n';
  }

  function makeFooter() {
    return t('snap_footer');
  }

  // ---- Code block extraction ----

  const CODE_RE = /```[\s\S]*?```/g;
  const ARTIFACT_RE = /```\s*\n\/\/\s*\S+[\s\S]*?```/g;

  function extractCodeBlocks(text) {
    if (!text) return [];
    const matches = text.match(CODE_RE) || [];
    return matches.filter(b => b.length > 30);
  }

  function stripCodeBlocks(text) {
    if (!text) return '';
    return text.replace(CODE_RE, '\n[code block omitted]\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function isSubstantialCode(block) {
    const inner = block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    return inner.split('\n').length >= 3 || inner.length >= 100;
  }

  // ---- Content classification ----

  const CONCLUSION_RE = /(?:^|\n)(?:##?\s|(?:\*\*)?(?:总结|结论|方案|建议|核心|关键|最终|summary|conclusion|key\s|final|takeaway)[：:\s])/im;
  const TABLE_RE = /\|.+\|.+\|/;
  const LIST_RE = /^(?:\d+\.|[-*])\s+/m;

  function extractConclusion(text) {
    if (!text || text.length < 50) return '';
    const stripped = stripCodeBlocks(text);
    if (stripped.length < 30) return '';

    const lines = stripped.split('\n');
    const conclusionLines = [];
    let inConclusion = false;
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (CONCLUSION_RE.test(line) || TABLE_RE.test(line)) {
        inConclusion = true;
        depth = 0;
      }
      if (inConclusion) {
        conclusionLines.push(line);
        if (line.trim() === '' && depth > 0) {
          depth++;
          if (depth > 2) { inConclusion = false; depth = 0; }
        } else {
          depth = line.trim() === '' ? 1 : 0;
        }
      }
    }

    if (conclusionLines.length > 0) return conclusionLines.join('\n').trim();

    const lastParagraphs = stripped.split(/\n{2,}/).slice(-2).join('\n\n').trim();
    if (lastParagraphs.length < stripped.length * 0.5) return lastParagraphs;
    return '';
  }

  function isFluff(text) {
    if (!text) return true;
    const s = text.trim();
    if (s.length < 15) return true;
    if (/^(好的|明白|理解|understood|ok|sure|let me|I'll|我来)/i.test(s) && s.length < 80) return true;
    return false;
  }

  // ---- Mode: Full ----

  function compressFull(session) {
    if (!session?.messages?.length) return '';
    const msgs = session.messages;
    const sourceLabel = PLATFORM_LABEL[session.platform] || session.platform || 'AI';
    const turns = toTurns(msgs);
    const lines = [];
    lines.push(makeHeader(sourceLabel, msgs.length, turns.length, 'full'));
    lines.push('');

    for (let i = 0; i < turns.length; i++) {
      const tu = turns[i];
      const isLast = i === turns.length - 1 && !tu.assistant;
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
    return lines.join('\n');
  }

  // ---- Mode: Smart ----

  function compressSmart(session, options) {
    if (!session?.messages?.length) return '';
    const opts = { recentTurns: 2, maxTotalChars: 200000, ...options };
    const msgs = session.messages;
    const sourceLabel = PLATFORM_LABEL[session.platform] || session.platform || 'AI';
    const turns = toTurns(msgs);

    if (turns.length <= 3) return compressFull(session);

    const recentCount = Math.min(opts.recentTurns, turns.length);
    const olderTurns = turns.slice(0, turns.length - recentCount);
    const recentTurns = turns.slice(turns.length - recentCount);

    // Step 1: Extract all code blocks from older turns
    const allCodeBlocks = [];
    for (let i = 0; i < olderTurns.length; i++) {
      const tu = olderTurns[i];
      const asstBlocks = extractCodeBlocks(tu.assistant);
      for (const b of asstBlocks) {
        if (isSubstantialCode(b)) {
          allCodeBlocks.push({ turnIdx: i + 1, code: b });
        }
      }
    }

    // Deduplicate code: if same filename appears multiple times, keep only the latest
    const codeByName = new Map();
    for (const entry of allCodeBlocks) {
      const nameMatch = entry.code.match(/^```\w*\n(?:\/\/\s*)?(\S+\.\w+)/);
      const key = nameMatch ? nameMatch[1] : `__anon_${codeByName.size}`;
      codeByName.set(key, entry);
    }
    const deduplicatedCode = [...codeByName.values()];

    // Step 2: Build older conversation section
    const olderLines = [];
    for (let i = 0; i < olderTurns.length; i++) {
      const tu = olderTurns[i];
      // Always keep user message (trimmed if very long)
      const userText = tu.user.length > 500 ? tu.user.slice(0, 500) + '…' : tu.user;
      olderLines.push(`**Turn ${i + 1} · User**: ${userText}`);

      if (tu.assistant) {
        const conclusion = extractConclusion(tu.assistant);
        if (conclusion && conclusion.length > 20) {
          olderLines.push(`**Assistant** (key points):\n${conclusion}`);
        } else if (!isFluff(tu.assistant)) {
          const stripped = stripCodeBlocks(tu.assistant);
          if (stripped.length > 300) {
            olderLines.push(`**Assistant**: ${stripped.slice(0, 300)}…`);
          } else if (stripped.length > 0) {
            olderLines.push(`**Assistant**: ${stripped}`);
          }
        }
      }
      olderLines.push('');
    }

    // Step 3: Assemble
    const lines = [];
    lines.push(makeHeader(sourceLabel, msgs.length, turns.length, 'smart'));
    lines.push('');

    // Code artifacts section (if any)
    if (deduplicatedCode.length > 0) {
      lines.push(t('snap_section_code'));
      lines.push('');
      for (const entry of deduplicatedCode) {
        lines.push(`${t('snap_code_from_turn', { n: entry.turnIdx })}`);
        lines.push(entry.code);
        lines.push('');
      }
    }

    // Older turns
    if (olderLines.length > 0) {
      lines.push(t('snap_section_old'));
      lines.push('');
      lines.push(olderLines.join('\n'));
    }

    // Recent turns (verbatim)
    lines.push(t('snap_section_recent'));
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
    const sections = text.split(/^(## .+)$/m);
    const parts = [];
    const preamble = sections[0];
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
        const isCode = parts[i].header.includes('Code') || parts[i].header.includes('代码');
        const priority = isRecent ? 0.3 : isCode ? 0.5 : 1;
        const effective = parts[i].body.length * priority;
        if (effective > maxLen) { maxLen = effective; maxIdx = i; }
      }
      if (maxIdx === -1) break;
      const halfLen = Math.floor(parts[maxIdx].body.length / 2);
      parts[maxIdx].body = parts[maxIdx].body.slice(0, halfLen) + '\n\n' + t('snap_trimmed') + '\n';
      attempts++;
    }
    return preamble + parts.map((p) => p.header + p.body).join('');
  }

  // ---- Unified entry point ----

  function compress(session, mode, options) {
    mode = mode || 'smart';
    if (mode === 'full') return compressFull(session);
    return compressSmart(session, options);
  }

  // ---- Stats & fingerprinting ----

  function estimateStats(session) {
    if (!session?.messages) return { turns: 0, chars: 0, approxTokens: 0 };
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

  function estimateModeSize(session, mode) {
    if (!session?.messages?.length) return { chars: 0, approxTokens: 0 };
    const snap = mode === 'full' ? compressFull(session) : compressSmart(session);
    return snapshotStats(snap);
  }

  function sessionFingerprint(session) {
    if (!session?.messages?.length) return '';
    const n = session.messages.length;
    const last = session.messages[n - 1];
    const lastId = last.messageId || '';
    const lastSnip = (last.content || '').slice(0, 100);
    return `${session.platform}:${session.convId || ''}:${n}:${lastId}:${lastSnip.length}`;
  }

  global.AIRelayCompress = {
    compress,
    compressFull,
    compressSmart,
    estimateStats,
    snapshotStats,
    estimateModeSize,
    sessionFingerprint,
    toTurns,
    extractCodeBlocks,
  };
})(typeof window !== 'undefined' ? window : globalThis);
