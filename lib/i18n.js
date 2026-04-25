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
    'mode_full_desc': { zh: '原封不动复制全部对话内容，适合对话不太长的情况', en: 'Copy all messages verbatim. Best for shorter conversations.' },
    'mode_smart_desc': { zh: '保留全部代码和用户消息，压缩 AI 过程性文字，适合大多数场景', en: 'Keep all code & user messages, compress AI prose. Best for most cases.' },
    'target_title': { zh: '去其他平台继续对话：', en: 'Continue on another platform:' },
    'not_supported': { zh: '未检测到支持的平台', en: 'No supported platform detected' },
    'use_platforms': { zh: '请在以下平台使用：{list}', en: 'Please use on: {list}' },
    'capture_disabled_hint': { zh: '抓取功能已关闭。<br />请在顶部打开<b>抓取开关</b>后刷新页面。', en: 'Capture is off.<br />Enable the <b>Capture switch</b> above and refresh the page.' },
    'no_capture_hint': { zh: '尚未捕获到对话。<br />请<b>刷新当前页面</b>，扩展会自动抓取。', en: 'No conversation captured yet.<br />Please <b>refresh the page</b> and the extension will capture automatically.' },
    'captured_info': { zh: '已捕获 <b>{total}</b> 条（{user} 用户 · {asst} 助手）', en: 'Captured <b>{total}</b> messages ({user} user · {asst} assistant)' },
    'estimate_label': { zh: '预估：<b>{chars}</b> 字符 · ~<b>{tokens}</b> tokens', en: 'Est: <b>{chars}</b> chars · ~<b>{tokens}</b> tokens' },
    'estimate_long': { zh: ' · 较长', en: ' · long' },
    'cache_ready': { zh: '快照已生成（{time}）', en: 'Snapshot ready ({time})' },
    'cache_outdated': { zh: '对话已更新，需重新生成', en: 'Conversation updated, regenerate needed' },

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
    'btn_smart_copy': { zh: '智能接力并复制', en: 'Smart Relay & Copy' },
    'btn_full_copy': { zh: '全文复制', en: 'Full Copy' },
    'btn_preview': { zh: '预览快照内容', en: 'Preview Snapshot' },
    'btn_open_original': { zh: '查看原文', en: 'Open Original' },
    'btn_delete_session': { zh: '删除此对话', en: 'Delete Session' },
    'confirm_delete_session': { zh: '确定删除此对话记录？\n\n删除后重新访问原始页面即可重新录制。', en: 'Delete this session?\n\nYou can re-record by visiting the original page again.' },
    'btn_show_more': { zh: '加载更多', en: 'Load More' },
    'btn_expand': { zh: '展开全文', en: 'Expand' },
    'btn_collapse': { zh: '收起', en: 'Collapse' },
    'detail_showing': { zh: '显示 {n}/{total} 条消息', en: 'Showing {n}/{total} messages' },
    'current_preview_title': { zh: '对话预览', en: 'Conversation Preview' },
    'current_view_detail': { zh: '点击查看完整对话', en: 'Click to view full conversation' },
    'action_hint': { zh: '点击上方按钮直接生成快照并复制到剪贴板', en: 'Click a button above to generate a snapshot and copy it to clipboard' },
    'btn_ignore_conv': { zh: '忽略此对话', en: 'Ignore this conversation' },
    'btn_unignore_conv': { zh: '恢复录制', en: 'Resume recording' },
    'toast_ignored': { zh: '已忽略此对话，将不再录制', en: 'Conversation ignored, recording stopped' },
    'toast_unignored': { zh: '已恢复，刷新页面后生效', en: 'Resumed, refresh the page to take effect' },
    'ignored_hint': { zh: '此对话已被忽略，不会录制新内容', en: 'This conversation is ignored. New content will not be recorded.' },
    'role_user': { zh: '用户', en: 'User' },
    'role_assistant': { zh: '助手', en: 'Assistant' },
    'detail_messages': { zh: '{n} 条消息 · {turns} 轮', en: '{n} messages · {turns} turns' },

    // --- Preview overlay ---
    'preview_title': { zh: '快照预览', en: 'Snapshot Preview' },
    'btn_copy_clipboard': { zh: '复制到剪贴板', en: 'Copy to Clipboard' },

    // --- Settings ---
    'setting_turns_title': { zh: '智能接力：保留轮次', en: 'Smart Relay: Recent Turns' },
    'setting_turns_desc': { zh: '"智能接力并复制"时，最近 N 轮对话原文完整保留，更早的对话则智能压缩。轮次越多，快照越长。', en: 'In "Smart Relay & Copy", the last N turns are kept verbatim while older turns are intelligently compressed. More turns = longer snapshot.' },
    'turns_option': { zh: '最近 {n} 轮', en: 'Last {n} turns' },
    'setting_debug_title': { zh: '调试日志', en: 'Debug Logs' },
    'setting_debug_desc': { zh: '在 AI 网页的 Console 输出拦截日志（需刷新页面）', en: 'Print interception logs in the AI page console (requires page reload)' },
    'setting_clear_title': { zh: '清除所有记录', en: 'Clear All Data' },
    'setting_clear_desc': { zh: '删除扩展本地存储的全部会话数据', en: 'Delete all session data stored locally by this extension' },
    'btn_clear': { zh: '清除数据', en: 'Clear Data' },
    'setting_about': { zh: '关于', en: 'About' },
    'about_desc': { zh: 'AI Relay v0.2 · 对话接力助手', en: 'AI Relay v0.2 · Conversation Relay Assistant' },
    'privacy_title': { zh: '隐私说明', en: 'Privacy Notice' },
    'privacy_text': { zh: '本扩展完全在本地浏览器运行，不上传任何对话数据到任何服务器。所有抓取的对话、生成的快照均存储在浏览器本地 storage 中，可随时在设置中清除。', en: 'This extension runs entirely in your browser and never uploads any data to any server. All captured conversations and generated snapshots are stored in browser local storage and can be cleared at any time in Settings.' },

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
    'confirm_clear': { zh: '确定要清除所有会话记录吗？此操作不可恢复。', en: 'Clear all session records? This cannot be undone.' },
    'copied_text': { zh: '已复制', en: 'Copied' },

    // --- Compress (snapshot template) ---
    'snap_header': { zh: '# 接力快照 · 来自 {source} · {date}\n> 模式：{mode} · 原始对话 {msgs} 条（{turns} 轮）', en: '# Relay Snapshot · from {source} · {date}\n> Mode: {mode} · Original: {msgs} messages ({turns} turns)' },
    'snap_mode_full': { zh: '全文复制', en: 'Full Verbatim' },
    'snap_mode_smart': { zh: '智能接力', en: 'Smart Relay' },
    'snap_section_code': { zh: '## 代码 / 产出物', en: '## Code & Artifacts' },
    'snap_section_conv': { zh: '## 对话内容', en: '## Conversation' },
    'snap_section_old': { zh: '## 早期对话概要', en: '## Earlier Conversation Summary' },
    'snap_section_recent': { zh: '## 最近对话（原文完整保留）', en: '## Recent Conversation (verbatim)' },
    'snap_last_user': { zh: '### User  ⬅ 你要回答的是这一条', en: '### User  ⬅ This is the message you should answer' },
    'snap_footer': { zh: '---\n你是接力过来的 AI。请先用一句话确认你理解了上述背景，然后直接回答最后一条 User 消息。不要复述摘要。\n\n— Relayed via AI Relay · https://github.com/lipeng3g/ai-relay', en: '---\nYou are a relay AI. First, briefly confirm you understand the above context, then directly answer the last User message. Do not repeat the summary.\n\n— Relayed via AI Relay · https://github.com/lipeng3g/ai-relay' },
    'snap_trimmed': { zh: '_(…内容过长已裁剪…)_', en: '_(…content trimmed for length…)_' },
    'snap_code_from_turn': { zh: '（来自第 {n} 轮）', en: '(from turn {n})' },
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
