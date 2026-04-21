// AI Relay · i18n.js
// Lightweight internationalization: auto-detect browser locale, support zh/en.

(function (global) {
  const lang = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';

  const dict = {
    // --- Header ---
    'capture_on': { zh: '抓取开启', en: 'Capture ON' },
    'capture_off': { zh: '抓取关闭', en: 'Capture OFF' },
    'loading': { zh: '正在加载…', en: 'Loading…' },
    'privacy_inline': { zh: '所有数据仅存储在本地浏览器，不上传任何内容', en: 'All data stays in your browser. Nothing is uploaded.' },

    // --- Tabs ---
    'tab_current': { zh: '当前', en: 'Current' },
    'tab_history': { zh: '历史', en: 'History' },
    'tab_settings': { zh: '设置', en: 'Settings' },

    // --- Current panel ---
    'mode_raw': { zh: '原文模式 · 保留最近 {n} 轮完整对话', en: 'Verbatim · keeping last {n} turns' },
    'mode_llm': { zh: 'AI 摘要 · {model}', en: 'AI summary · {model}' },
    'btn_relay': { zh: '生成快照并复制', en: 'Generate Snapshot & Copy' },
    'target_title': { zh: '去其他平台继续对话：', en: 'Continue on another platform:' },
    'not_supported': { zh: '未检测到支持的平台', en: 'No supported platform detected' },
    'use_platforms': { zh: '请在以下平台使用：{list}', en: 'Please use on: {list}' },
    'capture_disabled_hint': { zh: '抓取功能已关闭。<br />请在顶部打开<b>抓取开关</b>后刷新页面。', en: 'Capture is off.<br />Enable the <b>Capture switch</b> above and refresh the page.' },
    'no_capture_hint': { zh: '尚未捕获到对话。<br />请<b>刷新当前页面</b>，扩展会自动抓取。', en: 'No conversation captured yet.<br />Please <b>refresh the page</b> and the extension will capture automatically.' },
    'captured_info': { zh: '已捕获 <b>{total}</b> 条（{user} 用户 · {asst} 助手）', en: 'Captured <b>{total}</b> messages ({user} user · {asst} assistant)' },
    'mode_label_llm': { zh: 'AI 摘要模式', en: 'AI Summary Mode' },
    'mode_label_raw': { zh: '原文保留模式', en: 'Verbatim Mode' },
    'main_hint': { zh: '当前为 <b>{mode}</b>，点击下方按钮生成快照并自动复制到剪贴板。', en: 'Current: <b>{mode}</b>. Click below to generate a snapshot and copy to clipboard.' },
    'main_hint_no_api': { zh: '<br />在设置中配置 API Key 可启用 AI 摘要压缩。', en: '<br />Configure an API Key in Settings to enable AI summarization.' },
    'estimate_label': { zh: '预估：<b>{chars}</b> 字符 · ~<b>{tokens}</b> tokens', en: 'Est: <b>{chars}</b> chars · ~<b>{tokens}</b> tokens' },
    'estimate_long': { zh: ' · 较长', en: ' · long' },

    // --- Stats ---
    'stat_turns': { zh: '轮', en: 'turns' },
    'stat_chars': { zh: '字符', en: 'chars' },

    // --- Recent panel ---
    'recent_empty': { zh: '还没有历史记录。<br />请先到 {list} 对话后再回来查看。', en: 'No history yet.<br />Start a conversation on {list} first.' },
    'recent_count': { zh: '{n} 条', en: '{n} msgs' },
    'no_title': { zh: '(无标题)', en: '(untitled)' },
    'time_just_now': { zh: '刚刚', en: 'just now' },
    'time_minutes': { zh: '{n} 分钟前', en: '{n}m ago' },
    'time_hours': { zh: '{n} 小时前', en: '{n}h ago' },
    'time_days': { zh: '{n} 天前', en: '{n}d ago' },

    // --- Detail overlay ---
    'detail_title': { zh: '会话详情', en: 'Session Details' },
    'btn_detail_snapshot': { zh: '生成快照并复制', en: 'Generate & Copy' },
    'btn_detail_preview': { zh: '预览快照', en: 'Preview Snapshot' },
    'role_user': { zh: '用户', en: 'User' },
    'role_assistant': { zh: '助手', en: 'Assistant' },
    'detail_messages': { zh: '{n} 条消息 · {turns} 轮', en: '{n} messages · {turns} turns' },

    // --- Preview overlay ---
    'preview_title': { zh: '快照预览', en: 'Snapshot Preview' },
    'btn_copy_clipboard': { zh: '复制到剪贴板', en: 'Copy to Clipboard' },

    // --- Settings ---
    'setting_llm_title': { zh: 'AI 摘要压缩', en: 'AI Summary Compression' },
    'setting_llm_desc': { zh: '配置后，长对话将通过廉价模型智能压缩（保留代码和关键上下文）', en: 'When configured, long conversations are compressed via a cheap model (preserving code and key context)' },
    'setting_api_url': { zh: 'API 地址', en: 'API Endpoint' },
    'setting_api_key': { zh: 'API Key', en: 'API Key' },
    'setting_model': { zh: '模型', en: 'Model' },
    'setting_api_hint': { zh: '支持任何 OpenAI 兼容 API（DeepSeek、OpenRouter 等）', en: 'Supports any OpenAI-compatible API (DeepSeek, OpenRouter, etc.)' },
    'btn_save': { zh: '保存', en: 'Save' },
    'btn_test': { zh: '测试连接', en: 'Test Connection' },
    'setting_turns_title': { zh: '保留轮次', en: 'Keep Turns' },
    'setting_turns_desc': { zh: '无 API Key 时完整保留的最近对话轮数', en: 'Number of recent turns kept verbatim when no API Key is set' },
    'turns_option': { zh: '最近 {n} 轮', en: 'Last {n} turns' },
    'setting_debug_title': { zh: '调试日志', en: 'Debug Logs' },
    'setting_debug_desc': { zh: '在 AI 网页的 Console 输出拦截日志（需刷新页面）', en: 'Print interception logs in the AI page console (requires page reload)' },
    'setting_clear_title': { zh: '清除所有记录', en: 'Clear All Data' },
    'setting_clear_desc': { zh: '删除扩展本地存储的全部会话数据', en: 'Delete all session data stored locally by this extension' },
    'btn_clear': { zh: '清除数据', en: 'Clear Data' },
    'setting_about': { zh: '关于', en: 'About' },
    'about_desc': { zh: 'AI Relay v0.2 · 对话接力助手', en: 'AI Relay v0.2 · Conversation Relay Assistant' },
    'privacy_title': { zh: '隐私说明', en: 'Privacy Notice' },
    'privacy_text': { zh: '本扩展仅在本地浏览器运行，不上传任何对话数据到第三方服务器。快照生成（AI 摘要模式）时，对话内容会发送至您自行配置的 API 地址。所有数据存储在浏览器本地 storage 中，可随时清除。', en: 'This extension runs entirely in your browser and never uploads conversation data to any third-party server. In AI Summary mode, conversations are sent only to the API endpoint you configure. All data is stored in browser local storage and can be cleared at any time.' },

    // --- Toasts & actions ---
    'toast_copied': { zh: '已复制到剪贴板', en: 'Copied to clipboard' },
    'toast_copy_fail': { zh: '复制失败', en: 'Copy failed' },
    'toast_gen_fail': { zh: '生成失败: {err}', en: 'Generation failed: {err}' },
    'toast_empty': { zh: '对话为空', en: 'Conversation is empty' },
    'toast_saved': { zh: '已保存', en: 'Saved' },
    'toast_deleted': { zh: '已删除', en: 'Deleted' },
    'toast_cleared': { zh: '已清除', en: 'Cleared' },
    'toast_capture_on': { zh: '已开启抓取 · 刷新 AI 页面生效', en: 'Capture enabled · refresh the AI page to take effect' },
    'toast_capture_off': { zh: '已关闭抓取', en: 'Capture disabled' },
    'toast_debug_on': { zh: '已开启调试日志', en: 'Debug logs enabled' },
    'toast_debug_off': { zh: '已关闭', en: 'Disabled' },
    'btn_generating': { zh: '生成中…', en: 'Generating…' },
    'btn_copied_ok': { zh: '已复制 ✓', en: 'Copied ✓' },
    'btn_testing': { zh: '测试中…', en: 'Testing…' },
    'test_ok': { zh: '✓ 连接成功 ({model})', en: '✓ Connected ({model})' },
    'test_fail': { zh: '✗ {msg}', en: '✗ {msg}' },
    'fill_api_key': { zh: '请填写 API Key', en: 'Please enter an API Key' },
    'confirm_clear': { zh: '确定要清除所有会话记录吗？此操作不可恢复。', en: 'Clear all session records? This cannot be undone.' },
    'copied_text': { zh: '已复制', en: 'Copied' },

    // --- Compress (snapshot template) ---
    'snap_header': { zh: '# 接力快照 · 来自 {source} · {date}\n> 模式：{mode} · 原始对话 {msgs} 条（{turns} 轮）', en: '# Relay Snapshot · from {source} · {date}\n> Mode: {mode} · Original: {msgs} messages ({turns} turns)' },
    'snap_mode_llm': { zh: 'AI摘要', en: 'AI Summary' },
    'snap_mode_raw': { zh: '原文保留', en: 'Verbatim' },
    'snap_old_section': { zh: '## 早期对话概要', en: '## Earlier Conversation Summary' },
    'snap_recent_section': { zh: '## 最近对话（原文完整保留）', en: '## Recent Conversation (verbatim)' },
    'snap_last_user': { zh: '### User  ⬅ 你要回答的是这一条', en: '### User  ⬅ This is the message you should answer' },
    'snap_footer': { zh: '---\n你是接力过来的 AI。请先用一句话确认你理解了上述背景，然后直接回答最后一条 User 消息。不要复述摘要。\n\n— Relayed via AI Relay · https://github.com/lipeng3g/ai-relay', en: '---\nYou are a relay AI. First, briefly confirm you understand the above context, then directly answer the last User message. Do not repeat the summary.\n\n— Relayed via AI Relay · https://github.com/lipeng3g/ai-relay' },
    'snap_trimmed': { zh: '_(…内容过长已裁剪…)_', en: '_(…content trimmed for length…)_' },

    // LLM system prompt
    'llm_system_prompt': {
      zh: `你是一个对话压缩助手。你的任务是将一段AI对话压缩为"接力摘要"，目标是让另一个AI能无缝接上这个对话。

规则：
1. 越新的内容越重要。最近2-3轮对话必须完整保留原文（包括代码块、表格等格式）
2. 代码块必须完整保留，不要截断或省略
3. 较早的对话压缩为简短摘要（每轮一句话概括即可）
4. 输出格式必须严格如下：

## 早期对话概要
（较早轮次的一句话摘要列表）

## 最近对话（原文完整保留）

### User
（用户原文）

### Assistant
（助手原文）

### User  ⬅ 你要回答的是这一条
（最后一条用户消息原文）

5. 注意：最后一条 User 消息的标题必须写成 "### User  ⬅ 你要回答的是这一条"，不要把 ⬅ 放在别的地方
6. 不要在末尾添加 --- 分隔线或任何附加说明，直接在最后一条消息后结束
7. 使用中文输出`,
      en: `You are a conversation compression assistant. Your task is to compress an AI conversation into a "relay summary" so another AI can seamlessly continue.

Rules:
1. Newer content is more important. The last 2-3 turns must be preserved verbatim (including code blocks, tables, etc.)
2. Code blocks must be kept intact — never truncate or omit them
3. Older turns should be compressed into brief summaries (one sentence each)
4. Output format must be strictly as follows:

## Earlier Conversation Summary
(one-sentence summaries for older turns)

## Recent Conversation (verbatim)

### User
(user's original text)

### Assistant
(assistant's original text)

### User  ⬅ This is the message you should answer
(last user message, verbatim)

5. The last User heading MUST be "### User  ⬅ This is the message you should answer"
6. Do NOT add --- or any extra notes at the end. End right after the last message
7. Output in English`
    },
    'llm_user_prompt': { zh: '请将以下来自 {source} 的 {turns} 轮对话压缩为接力摘要。总长度控制在 {budget} 字符以内。', en: 'Compress the following {turns}-turn conversation from {source} into a relay summary. Keep total length under {budget} characters.' },
  };

  function t(key, params) {
    const entry = dict[key];
    if (!entry) return key;
    let text = entry[lang] || entry.en || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.split(`{${k}}`).join(String(v));
      }
    }
    return text;
  }

  function applyI18nAttributes(root) {
    const els = (root || document).querySelectorAll('[data-i18n]');
    for (const el of els) {
      const key = el.getAttribute('data-i18n');
      const translated = t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translated;
      } else {
        el.innerHTML = translated;
      }
    }
    const titleEls = (root || document).querySelectorAll('[data-i18n-title]');
    for (const el of titleEls) {
      el.title = t(el.getAttribute('data-i18n-title'));
    }
  }

  global.AIRelayI18n = { t, lang, applyI18nAttributes };
})(typeof window !== 'undefined' ? window : globalThis);
