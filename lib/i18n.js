// AI Relay · i18n.js
// Lightweight internationalization: auto-detect browser locale, support zh/en.

(function (global) {
  const lang = (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';

  const dict = {
    // --- Header ---
    'capture_on': { zh: '抓取开启', en: 'Capture ON' },
    'capture_off': { zh: '抓取关闭', en: 'Capture OFF' },
    'loading': { zh: '正在加载…', en: 'Loading…' },
    'privacy_inline': { zh: '仅存本地', en: 'Local only' },

    // --- Tabs ---
    'tab_current': { zh: '当前', en: 'Current' },
    'tab_history': { zh: '历史', en: 'History' },
    'tab_settings': { zh: '设置', en: 'Settings' },
    'tabs_label': { zh: '主导航', en: 'Main navigation' },
    'capture_toggle_label': { zh: '开启或关闭对话抓取', en: 'Turn conversation capture on or off' },
    'debug_toggle_label': { zh: '开启或关闭调试日志', en: 'Turn debug logs on or off' },
    'platform_filter_label': { zh: '按平台筛选历史会话', en: 'Filter conversation history by platform' },

    // --- Current panel ---
    'relay_mode_title': { zh: '选择接力方式', en: 'Choose relay mode' },
    'mode_smart_name': { zh: '精简接力', en: 'Concise relay' },
    'mode_full_name': { zh: '完整接力', en: 'Complete relay' },
    'recommended': { zh: '推荐', en: 'Recommended' },
    'mode_full_desc': { zh: '保留全部原始对话，适合较短会话', en: 'Keep every original message. Best for shorter conversations.' },
    'mode_smart_desc': { zh: '保留需求、代码和近期原文，压缩较早内容', en: 'Keep requests, code, and recent messages; compress older context.' },
    'target_title': { zh: '选择要接力到的平台', en: 'Choose a destination' },
    'not_supported': { zh: '未检测到支持的平台', en: 'No supported platform detected' },
    'use_platforms': { zh: '请在以下平台使用：{list}', en: 'Please use on: {list}' },
    'capture_disabled_hint': { zh: '抓取功能已关闭。<br />打开顶部<b>抓取开关</b>后新消息立即开始捕获；刷新页面可带上已有对话。', en: 'Capture is off.<br />Turn on the <b>Capture switch</b> above to capture new messages instantly; refresh the page to load existing history.' },
    'no_capture_hint': { zh: '尚未捕获到当前会话。', en: 'The current conversation has not been captured yet.' },
    'captured_info': { zh: '已捕获 <b>{total}</b> 条（{user} 用户 · {asst} 助手）', en: 'Captured <b>{total}</b> messages ({user} user · {asst} assistant)' },
    'estimate_label': { zh: '预估：<b>{chars}</b> 字符 · ~<b>{tokens}</b> tokens', en: 'Est: <b>{chars}</b> chars · ~<b>{tokens}</b> tokens' },
    'estimate_long': { zh: ' · 较长', en: ' · long' },
    'cache_ready': { zh: '接力文本已生成（{time}）', en: 'Relay text ready ({time})' },
    'cache_outdated': { zh: '对话已更新，需重新生成', en: 'Conversation updated, regenerate needed' },

    // --- Stats ---
    'stat_turns': { zh: '轮', en: 'turns' },
    'stat_chars': { zh: '字符', en: 'chars' },

    // --- Recent panel ---
    'recent_empty': { zh: '还没有历史记录。<br />请先到 {list} 对话后再回来查看。', en: 'No history yet.<br />Start a conversation on {list} first.' },
    'recent_count': { zh: '{n} 条', en: '{n} msgs' },
    'recent_fallback_title': { zh: '最近会话', en: 'Recent conversations' },
    'view_all': { zh: '查看全部', en: 'View all' },
    'history_search_placeholder': { zh: '搜索会话标题', en: 'Search conversation titles' },
    'platform_all': { zh: '全部平台', en: 'All platforms' },
    'history_result_count': { zh: '{n} 个会话', en: '{n} conversations' },
    'history_no_results': { zh: '没有匹配的会话', en: 'No matching conversations' },
    'session_more': { zh: '更多操作', en: 'More actions' },
    'no_title': { zh: '(无标题)', en: '(untitled)' },
    'time_just_now': { zh: '刚刚', en: 'just now' },
    'time_minutes': { zh: '{n} 分钟前', en: '{n}m ago' },
    'time_hours': { zh: '{n} 小时前', en: '{n}h ago' },
    'time_days': { zh: '{n} 天前', en: '{n}d ago' },

    // --- Detail overlay ---
    'detail_title': { zh: '原始会话', en: 'Original Conversation' },
    'btn_smart_copy': { zh: '精简接力', en: 'Concise Relay' },
    'btn_full_copy': { zh: '完整接力', en: 'Complete Relay' },
    'btn_preview': { zh: '预览接力文本', en: 'Preview Relay Text' },
    'btn_preview_relay': { zh: '预览接力文本', en: 'Preview Relay Text' },
    'btn_generate_copy': { zh: '生成并复制接力文本', en: 'Generate & Copy Relay Text' },
    'btn_recopy': { zh: '重新复制', en: 'Copy again' },
    'btn_cancel_relay': { zh: '结束本次接力', en: 'End relay' },
    'btn_open_original': { zh: '查看原文', en: 'Open Original' },
    'btn_delete_session': { zh: '删除此对话', en: 'Delete Session' },
    'btn_close': { zh: '关闭', en: 'Close' },
    'confirm_delete_session': { zh: '确定删除此对话记录？\n\n删除后重新访问原始页面即可重新录制。', en: 'Delete this session?\n\nYou can re-record by visiting the original page again.' },
    'btn_show_more': { zh: '加载更多', en: 'Load More' },
    'btn_expand': { zh: '展开全文', en: 'Expand' },
    'btn_collapse': { zh: '收起', en: 'Collapse' },
    'detail_showing': { zh: '显示 {n}/{total} 条消息', en: 'Showing {n}/{total} messages' },
    'current_preview_title': { zh: '对话预览', en: 'Conversation Preview' },
    'current_view_detail': { zh: '点击查看完整对话', en: 'Click to view full conversation' },
    'action_hint': { zh: '选择模式后预览或复制接力文本', en: 'Choose a mode, then preview or copy the relay text.' },
    'btn_ignore_conv': { zh: '忽略此对话', en: 'Ignore this conversation' },
    'btn_unignore_conv': { zh: '恢复录制', en: 'Resume recording' },
    'toast_ignored': { zh: '已忽略此对话，将不再录制', en: 'Conversation ignored, recording stopped' },
    'toast_unignored': { zh: '已恢复，刷新页面后生效', en: 'Resumed, refresh the page to take effect' },
    'ignored_hint': { zh: '此对话已被忽略，不会录制新内容', en: 'This conversation is ignored. New content will not be recorded.' },
    'role_user': { zh: '用户', en: 'User' },
    'role_assistant': { zh: '助手', en: 'Assistant' },
    'detail_messages': { zh: '{n} 条消息 · {turns} 轮', en: '{n} messages · {turns} turns' },

    // --- Preview overlay ---
    'preview_title': { zh: '接力文本预览', en: 'Relay Text Preview' },
    'preview_explainer': { zh: '这是即将复制给下一个 AI 的接力文本，不会修改原始会话。', en: 'This is the relay text for the next AI. It does not change the original conversation.' },
    'btn_copy_clipboard': { zh: '复制到剪贴板', en: 'Copy to Clipboard' },

    // --- Settings ---
    'settings_relay_title': { zh: '接力偏好', en: 'Relay preferences' },
    'settings_data_title': { zh: '隐私与数据', en: 'Privacy & data' },
    'settings_about_title': { zh: '关于', en: 'About' },
    'settings_advanced_title': { zh: '高级设置', en: 'Advanced settings' },
    'setting_turns_title': { zh: '精简接力：保留轮次', en: 'Concise Relay: Recent Turns' },
    'setting_turns_desc': { zh: '精简接力会完整保留最近 N 轮原文，并压缩更早对话。轮次越多，接力文本越长。', en: 'Concise relay keeps the last N turns verbatim and compresses older context. More turns produce longer relay text.' },
    'turns_option': { zh: '最近 {n} 轮', en: 'Last {n} turns' },
    'setting_debug_title': { zh: '调试日志', en: 'Debug Logs' },
    'setting_debug_desc': { zh: '在 AI 网页的 Console 输出拦截日志（需刷新页面）', en: 'Print interception logs in the AI page console (requires page reload)' },
    'setting_clear_title': { zh: '清除所有记录', en: 'Clear All Data' },
    'setting_clear_desc': { zh: '删除 AI Relay 本地保存的会话。重新访问原始 AI 页面时，这些会话可能再次被捕获。', en: 'Delete conversations stored by AI Relay. They may be captured again when you revisit the original AI pages.' },
    'btn_clear': { zh: '清除数据', en: 'Clear Data' },
    'setting_about': { zh: '关于', en: 'About' },
    'about_desc': { zh: 'AI Relay v{version} · 对话接力助手', en: 'AI Relay v{version} · Conversation Relay Assistant' },
    'privacy_title': { zh: '隐私说明', en: 'Privacy Notice' },
    'privacy_text': { zh: '本扩展完全在本地浏览器运行，不上传任何对话数据到服务器。抓取的原始会话保存在浏览器本地，可随时在设置中清除。', en: 'This extension runs entirely in your browser and never uploads conversation data. Captured original conversations stay in local browser storage and can be cleared in Settings.' },

    // --- Toasts & actions ---
    'toast_copied': { zh: '已复制到剪贴板', en: 'Copied to clipboard' },
    'toast_copy_fail': { zh: '复制失败', en: 'Copy failed' },
    'toast_gen_fail': { zh: '生成失败: {err}', en: 'Generation failed: {err}' },
    'toast_empty': { zh: '对话为空', en: 'Conversation is empty' },
    'toast_saved': { zh: '已保存', en: 'Saved' },
    'toast_deleted': { zh: '已删除', en: 'Deleted' },
    'toast_cleared': { zh: '已清除', en: 'Cleared' },
    'toast_capture_on': { zh: '已开启抓取 · 刷新页面可加载已有对话', en: 'Capture enabled · refresh the page to load existing history' },
    'toast_capture_off': { zh: '已关闭抓取', en: 'Capture disabled' },
    'toast_debug_on': { zh: '已开启调试日志', en: 'Debug logs enabled' },
    'toast_debug_off': { zh: '已关闭', en: 'Disabled' },
    'btn_generating': { zh: '生成中…', en: 'Generating…' },
    'btn_copied_ok': { zh: '已复制 ✓', en: 'Copied ✓' },
    'confirm_clear': { zh: '确定删除 AI Relay 本地保存的所有会话吗？\n\n重新访问原始 AI 页面时，这些会话可能再次被捕获。', en: 'Delete all conversations stored by AI Relay?\n\nThey may be captured again when you revisit the original AI pages.' },
    'copied_text': { zh: '已复制', en: 'Copied' },

    // --- Detection and relay status ---
    'btn_retry_detection': { zh: '重新检测', en: 'Check again' },
    'empty_capture_off_title': { zh: '抓取已关闭', en: 'Capture is off' },
    'empty_capture_off_body': { zh: '打开顶部抓取开关后，新消息会立即开始捕获。', en: 'Turn on capture above to start capturing new messages immediately.' },
    'empty_new_chat_title': { zh: '这是一个新聊天', en: 'This is a new chat' },
    'empty_new_chat_body': { zh: '发送第一条消息后，AI Relay 会自动显示原始会话。', en: 'Send the first message and AI Relay will display the original conversation automatically.' },
    'empty_not_injected_title': { zh: '扩展尚未连接此页面', en: 'Extension is not connected to this page' },
    'empty_not_injected_body': { zh: '这通常发生在扩展刚重新加载后。请刷新当前 AI 页面，再重新检测。', en: 'This usually happens after reloading the extension. Refresh the AI page, then check again.' },
    'empty_waiting_title': { zh: '正在等待当前会话', en: 'Waiting for this conversation' },
    'empty_waiting_body': { zh: '页面已连接，但尚未返回当前会话。可继续对话，或刷新页面加载历史。', en: 'The page is connected but has not returned this conversation yet. Continue chatting or refresh to load history.' },
    'empty_error_title': { zh: '捕获连接出错', en: 'Capture connection error' },
    'empty_error_body': { zh: '请刷新当前页面后重试。', en: 'Refresh the current page and try again.' },
    'relay_copied_heading': { zh: '来自 {source} 的接力文本已复制', en: 'Relay text from {source} copied' },
    'relay_status_meta': { zh: '{mode} · {chars} 字符', en: '{mode} · {chars} chars' },
    'relay_next_current': { zh: '下一步：在 {target} 输入框按 <kbd>⌘V</kbd> 粘贴', en: 'Next: press <kbd>⌘V</kbd> in the {target} input' },
    'relay_next_choose': { zh: '下一步：选择目标平台，然后按 <kbd>⌘V</kbd> 粘贴', en: 'Next: choose a destination, then press <kbd>⌘V</kbd>' },
    'toast_relay_cancelled': { zh: '已结束本次接力', en: 'Relay ended' },

    // --- Compress (snapshot template) ---
    'snap_header': { zh: '# AI 接力文本 · 来自 {source} · {date}\n> 模式：{mode} · 原始对话 {msgs} 条（{turns} 轮）', en: '# AI Relay Text · from {source} · {date}\n> Mode: {mode} · Original: {msgs} messages ({turns} turns)' },
    'snap_mode_full': { zh: '完整接力', en: 'Complete Relay' },
    'snap_mode_smart': { zh: '精简接力', en: 'Concise Relay' },
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
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
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
    const ariaEls = (root || document).querySelectorAll('[data-i18n-aria]');
    for (const el of ariaEls) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    }
  }

  global.AIRelayI18n = { t, lang, applyI18nAttributes };
})(typeof window !== 'undefined' ? window : globalThis);
