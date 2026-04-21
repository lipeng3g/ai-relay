// AI Relay · popup.js (SidePanel)

(async function () {
  const t = window.AIRelayI18n.t;
  window.AIRelayI18n.applyI18nAttributes();

  // Populate select options after i18n is ready
  const turnsSelect = document.getElementById('select-recent-turns');
  for (const opt of turnsSelect.options) {
    opt.textContent = t('turns_option', { n: opt.value });
  }

  const SUPPORTED_PLATFORMS = { chatgpt: 'ChatGPT', claude: 'Claude', grok: 'Grok' };
  const PLATFORM_URLS = {
    chatgpt: 'https://chatgpt.com/',
    claude: 'https://claude.ai/new',
    grok: 'https://grok.com/',
  };
  const PLATFORM_DOT_CLASS = {
    chatgpt: 'dot-chatgpt',
    claude: 'dot-claude',
    grok: 'dot-grok',
  };
  const SESSION_STORAGE_KEY = 'airelay.sessions.v1';
  const SETTINGS_KEY = 'airelay.settings';

  const subtitleEl = document.getElementById('subtitle');
  const infoEl = document.getElementById('current-info');
  const statsEl = document.getElementById('current-stats');
  const compressModeEl = document.getElementById('compress-mode-hint');
  const modeIconEl = document.getElementById('mode-icon');
  const modeTextEl = document.getElementById('mode-text');
  const btnRelay = document.getElementById('btn-relay');
  const snapshotSizeEl = document.getElementById('snapshot-size');
  const targetLinksEl = document.getElementById('target-links');
  const targetBtnsEl = document.getElementById('target-btns');
  const mainHintEl = document.getElementById('main-hint');
  const recentEl = document.getElementById('recent-list');
  const toastEl = document.getElementById('toast');

  const previewOverlay = document.getElementById('preview-overlay');
  const previewText = document.getElementById('preview-text');
  const previewStats = document.getElementById('preview-stats');
  const btnClosePreview = document.getElementById('btn-close-preview');
  const btnCopyFromPreview = document.getElementById('btn-copy-from-preview');

  const detailOverlay = document.getElementById('detail-overlay');
  const detailTitle = document.getElementById('detail-title');
  const detailBody = document.getElementById('detail-body');
  const btnCloseDetail = document.getElementById('btn-close-detail');
  const btnDetailSnapshot = document.getElementById('btn-detail-snapshot');
  const btnDetailPreview = document.getElementById('btn-detail-preview');

  const toggleCapture = document.getElementById('toggle-capture');
  const captureLabel = document.getElementById('capture-label');
  const toggleDebug = document.getElementById('toggle-debug');
  const btnClearAll = document.getElementById('btn-clear-all');

  const apiEndpointEl = document.getElementById('api-endpoint');
  const apiKeyEl = document.getElementById('api-key');
  const apiModelEl = document.getElementById('api-model');
  const btnSaveApi = document.getElementById('btn-save-api');
  const btnTestApi = document.getElementById('btn-test-api');
  const apiStatusEl = document.getElementById('api-status');
  const selectRecentTurns = document.getElementById('select-recent-turns');

  // --- Settings ---
  async function loadSettings() {
    return new Promise((r) => {
      chrome.storage.local.get([SETTINGS_KEY], (res) => r(res[SETTINGS_KEY] || {}));
    });
  }
  async function saveSettings(patch) {
    const current = await loadSettings();
    const merged = { ...current, ...patch };
    return new Promise((r) => {
      chrome.storage.local.set({ [SETTINGS_KEY]: merged }, r);
    });
  }
  function getApiConfig(s) {
    if (!s.apiKey) return null;
    return {
      endpoint: s.apiEndpoint || 'https://api.openai.com/v1',
      key: s.apiKey,
      model: s.apiModel || 'gpt-4.1-mini',
    };
  }

  // --- Utils ---
  const supportedList = Object.values(SUPPORTED_PLATFORMS).join(', ');

  function detectPlatformFromUrl(url) {
    if (!url) return null;
    if (url.includes('chatgpt.com')) return 'chatgpt';
    if (url.includes('claude.ai')) return 'claude';
    if (url.includes('grok.com')) return 'grok';
    return null;
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2000);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      return ok;
    }
  }

  function truncate(s, n) {
    if (!s) return '';
    s = s.trim();
    return s.length <= n ? s : s.slice(0, n) + '…';
  }
  function firstUserMessage(session) {
    if (!session?.messages) return '';
    const m = session.messages.find((m) => m.role === 'user');
    return m ? truncate(m.content, 80) : '';
  }
  function sessionTitle(session) {
    if (session.title && !session.title.startsWith('http')) {
      return truncate(session.title.replace(/\s*[-|·].*$/, ''), 50);
    }
    return firstUserMessage(session) || t('no_title');
  }
  function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return t('time_just_now');
    if (diff < 3600000) return t('time_minutes', { n: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('time_hours', { n: Math.floor(diff / 3600000) });
    return t('time_days', { n: Math.floor(diff / 86400000) });
  }
  function renderStats(session) {
    const s = window.AIRelayCompress.estimateStats(session);
    return `<span class="stat-item"><span class="stat-num">${s.turns}</span> ${t('stat_turns')}</span>` +
      `<span class="stat-item"><span class="stat-num">${s.chars.toLocaleString()}</span> ${t('stat_chars')}</span>` +
      `<span class="stat-item">~<span class="stat-num">${s.approxTokens.toLocaleString()}</span> tokens</span>`;
  }
  function getSessionSourceUrl(session) {
    if (session.url) return session.url;
    if (session.platform === 'chatgpt' && session.convId)
      return `https://chatgpt.com/c/${session.convId}`;
    if (session.platform === 'claude' && session.convId)
      return `https://claude.ai/chat/${session.convId}`;
    if (session.platform === 'grok' && session.convId)
      return `https://grok.com/chat/${session.convId}`;
    return null;
  }
  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- State ---
  let settings = await loadSettings();
  let currentSession = null;
  let currentPlatform = null;

  const snapshotCache = new Map();

  function makeCacheKey(session) {
    if (!session) return '';
    const n = session.messages?.length || 0;
    const ts = session.updatedAt || 0;
    const api = settings.apiKey ? '1' : '0';
    const turns = settings.recentTurns || 3;
    return `${session.platform}::${session.convId}::${n}::${ts}::${api}::${turns}`;
  }

  // --- Capture toggle ---
  const captureEnabled = settings.captureEnabled ?? false;
  toggleCapture.checked = captureEnabled;
  captureLabel.textContent = captureEnabled ? t('capture_on') : t('capture_off');
  captureLabel.className = 'capture-label' + (captureEnabled ? ' on' : '');
  await chrome.storage.local.set({ 'airelay.captureEnabled': captureEnabled });

  toggleCapture.onchange = async () => {
    const on = toggleCapture.checked;
    settings.captureEnabled = on;
    await saveSettings({ captureEnabled: on });
    await chrome.storage.local.set({ 'airelay.captureEnabled': on });
    captureLabel.textContent = on ? t('capture_on') : t('capture_off');
    captureLabel.className = 'capture-label' + (on ? ' on' : '');
    showToast(on ? t('toast_capture_on') : t('toast_capture_off'));
  };

  // --- Compress mode hint ---
  function updateModeHint() {
    const hasApi = !!settings.apiKey;
    const turns = settings.recentTurns || 3;
    if (hasApi) {
      modeIconEl.textContent = '🤖';
      modeTextEl.textContent = t('mode_llm', { model: settings.apiModel || 'gpt-4.1-mini' });
      compressModeEl.classList.add('llm-active');
    } else {
      modeIconEl.textContent = '📋';
      modeTextEl.textContent = t('mode_raw', { n: turns });
      compressModeEl.classList.remove('llm-active');
    }
  }

  function updateSnapshotSize(session) {
    if (!session?.messages?.length) { snapshotSizeEl.innerHTML = ''; return; }
    const recentTurns = settings.recentTurns || 3;
    const snap = window.AIRelayCompress.compress(session, { recentTurns });
    const ss = window.AIRelayCompress.snapshotStats(snap);
    const warn = ss.chars > 12000;
    snapshotSizeEl.className = 'snapshot-size' + (warn ? ' warn' : '');
    snapshotSizeEl.innerHTML = t('estimate_label', { chars: ss.chars.toLocaleString(), tokens: ss.approxTokens.toLocaleString() }) + (warn ? t('estimate_long') : '');
  }

  // --- Core: generate snapshot (with per-session cache) ---
  async function generateSnapshot(session) {
    const key = makeCacheKey(session);
    if (snapshotCache.has(key)) return snapshotCache.get(key);
    const recentTurns = settings.recentTurns || 3;
    const apiConfig = getApiConfig(settings);
    const snap = await window.AIRelayCompress.compressAsync(session, apiConfig, { recentTurns });
    snapshotCache.set(key, snap);
    return snap;
  }

  // --- Shared UI actions ---

  function showTargetLinks(platform) {
    targetBtnsEl.innerHTML = '';
    for (const [key, url] of Object.entries(PLATFORM_URLS)) {
      if (key === platform) continue;
      const label = SUPPORTED_PLATFORMS[key] || key;
      const a = document.createElement('a');
      a.className = 'target-btn';
      a.href = url;
      a.target = '_blank';
      a.innerHTML = `<span class="dot ${PLATFORM_DOT_CLASS[key] || ''}"></span>${label}`;
      targetBtnsEl.appendChild(a);
    }
    targetLinksEl.style.display = 'block';
  }

  async function showPreview(session, triggerBtn) {
    if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.textContent = t('btn_generating'); }
    try {
      const snap = await generateSnapshot(session);
      if (!snap) { showToast(t('toast_empty')); return; }
      previewText.textContent = snap;
      const ss = window.AIRelayCompress.snapshotStats(snap);
      previewStats.textContent = `${ss.chars.toLocaleString()} ${t('stat_chars')} · ~${ss.approxTokens.toLocaleString()} tokens`;
      previewOverlay.style.display = 'flex';
    } catch (err) {
      showToast(t('toast_gen_fail', { err: err.message }));
    } finally {
      if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = t('btn_detail_preview'); }
    }
  }

  function hidePreview() { previewOverlay.style.display = 'none'; }

  async function copySnapshot(session, btn, originalTextKey) {
    btn.disabled = true;
    btn.textContent = t('btn_generating');
    try {
      const snap = await generateSnapshot(session);
      if (!snap) { showToast(t('toast_empty')); return; }
      const ok = await copyToClipboard(snap);
      if (ok) {
        showToast(t('toast_copied'));
        btn.textContent = t('btn_copied_ok');
        btn.classList.add('ok');
        setTimeout(() => { btn.textContent = t(originalTextKey); btn.classList.remove('ok'); btn.disabled = false; }, 2500);
        return true;
      }
      showToast(t('toast_copy_fail'));
    } catch (err) {
      showToast(t('toast_gen_fail', { err: err.message }));
    }
    btn.textContent = t(originalTextKey);
    btn.disabled = false;
    return false;
  }

  btnClosePreview.onclick = hidePreview;
  btnCopyFromPreview.onclick = async () => {
    const snap = previewText.textContent;
    if (!snap) return;
    const ok = await copyToClipboard(snap);
    if (ok) { showToast(t('copied_text')); hidePreview(); }
  };

  // --- Active tab ---
  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs?.[0] || null;
  }
  function findSessionForTab(allRecent, tab, platform) {
    if (!platform || !tab) return null;
    const match = allRecent.find(
      (s) => s.platform === platform && tab.url &&
        (tab.url.includes(s.convId || '___no_match___') || s.url === tab.url)
    );
    return match || allRecent.find((s) => s.platform === platform) || null;
  }

  // --- Refresh current panel ---
  async function refreshCurrentPanel() {
    const tab = await getActiveTab();
    currentPlatform = detectPlatformFromUrl(tab?.url || '');

    if (!currentPlatform) {
      subtitleEl.textContent = t('not_supported');
      infoEl.innerHTML = t('use_platforms', { list: `<b>${supportedList}</b>` });
      statsEl.innerHTML = '';
      snapshotSizeEl.innerHTML = '';
      btnRelay.disabled = true;
      mainHintEl.innerHTML = '';
      return;
    }

    subtitleEl.textContent = `${SUPPORTED_PLATFORMS[currentPlatform]}`;
    const allRecent = await window.AIRelayStorage.listRecent(20);
    const session = findSessionForTab(allRecent, tab, currentPlatform);

    if (!session || !session.messages?.length) {
      currentSession = null;
      if (!settings.captureEnabled) {
        infoEl.innerHTML = t('capture_disabled_hint');
      } else {
        infoEl.innerHTML = t('no_capture_hint');
      }
      mainHintEl.innerHTML = '';
      statsEl.innerHTML = '';
      snapshotSizeEl.innerHTML = '';
      btnRelay.disabled = true;
      return;
    }

    currentSession = session;
    const userCount = session.messages.filter((m) => m.role === 'user').length;
    const asstCount = session.messages.filter((m) => m.role === 'assistant').length;
    const hasApi = !!settings.apiKey;
    const modeLabel = hasApi ? t('mode_label_llm') : t('mode_label_raw');
    infoEl.innerHTML = t('captured_info', { total: session.messages.length, user: userCount, asst: asstCount });
    statsEl.innerHTML = renderStats(session);
    updateSnapshotSize(session);
    mainHintEl.innerHTML = t('main_hint', { mode: modeLabel }) + (hasApi ? '' : t('main_hint_no_api'));
    btnRelay.disabled = false;
    btnRelay.onclick = async () => {
      const ok = await copySnapshot(session, btnRelay, 'btn_relay');
      if (ok) showTargetLinks(currentPlatform);
    };
  }

  // --- Detail overlay ---
  let detailSession = null;

  function showDetail(session) {
    detailSession = session;
    const platform = session.platform || 'chatgpt';
    const label = SUPPORTED_PLATFORMS[platform] || platform;
    detailTitle.textContent = sessionTitle(session) || label;
    const sourceUrl = getSessionSourceUrl(session);
    const userCount = session.messages.filter((m) => m.role === 'user').length;
    const asstCount = session.messages.filter((m) => m.role === 'assistant').length;
    const stats = window.AIRelayCompress.estimateStats(session);

    let html = `<div class="detail-meta">`;
    html += `<div class="detail-platform">${label} · ${t('detail_messages', { n: userCount + asstCount, turns: stats.turns })}</div>`;
    if (sourceUrl) {
      html += `<a class="detail-url" href="${escHtml(sourceUrl)}" target="_blank">${escHtml(truncate(sourceUrl.replace(/^https?:\/\//, ''), 70))}</a>`;
    }
    html += `<div class="detail-time">${timeAgo(session.updatedAt)}</div>`;
    html += `</div><div class="detail-messages">`;
    for (const m of session.messages) {
      const roleLabel = m.role === 'user' ? t('role_user') : t('role_assistant');
      const roleClass = m.role === 'user' ? 'msg-user' : 'msg-asst';
      html += `<div class="detail-msg ${roleClass}"><div class="msg-role">${roleLabel}</div><div class="msg-content">${escHtml(truncate(m.content, 500))}</div></div>`;
    }
    html += `</div>`;
    detailBody.innerHTML = html;

    btnDetailSnapshot.disabled = false;
    btnDetailSnapshot.textContent = t('btn_detail_snapshot');
    btnDetailPreview.disabled = false;
    btnDetailPreview.textContent = t('btn_detail_preview');

    detailOverlay.style.display = 'flex';
  }

  function hideDetail() { detailOverlay.style.display = 'none'; detailSession = null; }
  btnCloseDetail.onclick = hideDetail;

  btnDetailSnapshot.onclick = async () => {
    if (!detailSession) return;
    await copySnapshot(detailSession, btnDetailSnapshot, 'btn_detail_snapshot');
  };

  btnDetailPreview.onclick = async () => {
    if (!detailSession) return;
    await showPreview(detailSession, btnDetailPreview);
  };

  // --- Recent panel ---
  async function renderRecent() {
    const recent = await window.AIRelayStorage.listRecent(10);
    if (!recent.length) {
      recentEl.innerHTML =
        `<div class="recent-empty">${t('recent_empty', { list: supportedList })}</div>`;
      return;
    }
    recentEl.innerHTML = '';
    for (const s of recent) {
      const item = document.createElement('div');
      item.className = 'recent-item';
      const platform = s.platform || 'chatgpt';
      const badgeClass = platform === 'claude' ? 'badge-claude' : platform === 'grok' ? 'badge-grok' : 'badge-chatgpt';
      const badgeText = platform === 'claude' ? 'C' : platform === 'grok' ? 'X' : 'G';
      const title = sessionTitle(s);
      const userCount = s.messages.filter((m) => m.role === 'user').length;
      const asstCount = s.messages.filter((m) => m.role === 'assistant').length;
      const sourceUrl = getSessionSourceUrl(s);

      item.innerHTML = `
        <div class="recent-badge ${badgeClass}">${badgeText}</div>
        <div class="recent-body">
          <div class="recent-title">${escHtml(title)}</div>
          ${sourceUrl ? `<a class="recent-url" href="${escHtml(sourceUrl)}" target="_blank">${escHtml(truncate(sourceUrl.replace(/^https?:\/\//, ''), 55))}</a>` : ''}
          <div class="recent-meta">${t('recent_count', { n: userCount + asstCount })} · ${timeAgo(s.updatedAt)}</div>
        </div>
        <button class="recent-del" title="Delete">&times;</button>
      `;

      item.querySelector('.recent-body').addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        showDetail(s);
      });

      item.querySelector('.recent-del').onclick = async (e) => {
        e.stopPropagation();
        const key = window.AIRelayStorage.sessionKey(s.platform, s.convId);
        await window.AIRelayStorage.deleteSessionByKey(key);
        showToast(t('toast_deleted'));
        renderRecent();
      };

      recentEl.appendChild(item);
    }
  }

  // --- Init ---
  updateModeHint();
  await refreshCurrentPanel();
  await renderRecent();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SESSION_STORAGE_KEY]) {
      refreshCurrentPanel();
      renderRecent();
    }
  });
  chrome.tabs.onActivated.addListener(() => { refreshCurrentPanel(); });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url) refreshCurrentPanel();
  });

  // --- Settings panel ---
  apiEndpointEl.value = settings.apiEndpoint || '';
  apiKeyEl.value = settings.apiKey || '';
  apiModelEl.value = settings.apiModel || '';
  selectRecentTurns.value = String(settings.recentTurns || 3);

  btnSaveApi.onclick = async () => {
    settings = {
      ...settings,
      apiEndpoint: apiEndpointEl.value.trim(),
      apiKey: apiKeyEl.value.trim(),
      apiModel: apiModelEl.value.trim(),
    };
    await saveSettings(settings);
    snapshotCache.clear();
    updateModeHint();
    if (currentSession) updateSnapshotSize(currentSession);
    showToast(t('toast_saved'));
    apiStatusEl.textContent = '';
  };

  btnTestApi.onclick = async () => {
    const cfg = {
      endpoint: (apiEndpointEl.value.trim() || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      key: apiKeyEl.value.trim(),
      model: apiModelEl.value.trim() || 'gpt-4.1-mini',
    };
    if (!cfg.key) {
      apiStatusEl.textContent = t('fill_api_key');
      apiStatusEl.className = 'api-status err';
      return;
    }
    apiStatusEl.textContent = t('btn_testing');
    apiStatusEl.className = 'api-status';
    btnTestApi.disabled = true;
    try {
      const resp = await fetch(`${cfg.endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'Hi, reply OK.' }], max_tokens: 10 }),
      });
      if (resp.ok) {
        await resp.json();
        apiStatusEl.textContent = t('test_ok', { model: cfg.model });
        apiStatusEl.className = 'api-status ok';
      } else {
        const errText = await resp.text().catch(() => '');
        apiStatusEl.textContent = t('test_fail', { msg: `${resp.status}: ${errText.slice(0, 80)}` });
        apiStatusEl.className = 'api-status err';
      }
    } catch (err) {
      apiStatusEl.textContent = t('test_fail', { msg: err.message });
      apiStatusEl.className = 'api-status err';
    }
    btnTestApi.disabled = false;
  };

  selectRecentTurns.onchange = async () => {
    settings.recentTurns = parseInt(selectRecentTurns.value, 10);
    await saveSettings({ recentTurns: settings.recentTurns });
    snapshotCache.clear();
    updateModeHint();
    if (currentSession) updateSnapshotSize(currentSession);
  };

  const debugPref = await new Promise((r) =>
    chrome.storage.local.get(['airelay.debugPref'], (res) => r(res['airelay.debugPref'] || false))
  );
  toggleDebug.checked = !!debugPref;
  toggleDebug.onchange = () => {
    chrome.storage.local.set({ 'airelay.debugPref': toggleDebug.checked });
    showToast(toggleDebug.checked ? t('toast_debug_on') : t('toast_debug_off'));
  };

  btnClearAll.onclick = async () => {
    if (!confirm(t('confirm_clear'))) return;
    await window.AIRelayStorage.clearAll();
    showToast(t('toast_cleared'));
    currentSession = null;
    snapshotCache.clear();
  };
})();
