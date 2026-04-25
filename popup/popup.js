// AI Relay · popup.js (SidePanel)

(async function () {
  const t = window.AIRelayI18n.t;
  window.AIRelayI18n.applyI18nAttributes();

  const SUPPORTED_PLATFORMS = { chatgpt: 'ChatGPT', claude: 'Claude', grok: 'Grok', gemini: 'Gemini' };
  const PLATFORM_URLS = {
    chatgpt: 'https://chatgpt.com/',
    claude: 'https://claude.ai/new',
    grok: 'https://grok.com/',
    gemini: 'https://gemini.google.com/',
  };
  const PLATFORM_DOT_CLASS = { chatgpt: 'dot-chatgpt', claude: 'dot-claude', grok: 'dot-grok', gemini: 'dot-gemini' };
  const SESSION_STORAGE_KEY = 'airelay.sessions.v1';
  const SETTINGS_KEY = 'airelay.settings';
  const DETAIL_PAGE_SIZE = 20;
  const COLLAPSE_THRESHOLD = 300;

  // DOM refs
  const subtitleEl = document.getElementById('subtitle');
  const infoEl = document.getElementById('current-info');
  const statsEl = document.getElementById('current-stats');
  const currentPreview = document.getElementById('current-preview');
  const actionGroup = document.getElementById('action-group');
  const btnSmartCopy = document.getElementById('btn-smart-copy');
  const btnFullCopy = document.getElementById('btn-full-copy');
  const btnPreviewCurrent = document.getElementById('btn-preview-current');
  const snapshotSizeEl = document.getElementById('snapshot-size');
  const currentIgnoreArea = document.getElementById('current-ignore-area');
  const btnIgnoreConv = document.getElementById('btn-ignore-conv');
  const ignoredHintEl = document.getElementById('ignored-hint');
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
  const detailSourceLink = document.getElementById('detail-source-link');
  const detailLoadMore = document.getElementById('detail-load-more');
  const btnLoadMore = document.getElementById('btn-load-more');
  const detailPaging = document.getElementById('detail-paging');
  const btnCloseDetail = document.getElementById('btn-close-detail');
  const btnDetailDelete = document.getElementById('btn-detail-delete');
  const btnDetailSmart = document.getElementById('btn-detail-smart');
  const btnDetailFull = document.getElementById('btn-detail-full');
  const btnDetailPreview = document.getElementById('btn-detail-preview');

  const toggleCapture = document.getElementById('toggle-capture');
  const captureLabel = document.getElementById('capture-label');
  const toggleDebug = document.getElementById('toggle-debug');
  const btnClearAll = document.getElementById('btn-clear-all');
  const selectRecentTurns = document.getElementById('select-recent-turns');

  for (const opt of selectRecentTurns.options) {
    opt.textContent = t('turns_option', { n: opt.value });
  }

  // --- Settings ---
  async function loadSettings() {
    return new Promise((r) => chrome.storage.local.get([SETTINGS_KEY], (res) => r(res[SETTINGS_KEY] || {})));
  }
  async function saveSettings(patch) {
    const current = await loadSettings();
    return new Promise((r) => chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...patch } }, r));
  }

  // --- Utils ---
  const supportedList = Object.values(SUPPORTED_PLATFORMS).join(', ');

  function detectPlatformFromUrl(url) {
    if (!url) return null;
    if (url.includes('chatgpt.com')) return 'chatgpt';
    if (url.includes('claude.ai')) return 'claude';
    if (url.includes('grok.com')) return 'grok';
    if (url.includes('gemini.google.com')) return 'gemini';
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

  function truncate(s, n) { if (!s) return ''; s = s.trim(); return s.length <= n ? s : s.slice(0, n) + '…'; }
  function firstUserMessage(session) {
    if (!session?.messages) return '';
    const m = session.messages.find((m) => m.role === 'user');
    return m ? truncate(m.content, 80) : '';
  }
  function sessionTitle(session) {
    if (session.title && !session.title.startsWith('http'))
      return truncate(session.title.replace(/\s*[-|·].*$/, ''), 50);
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
    if (session.platform === 'chatgpt' && session.convId) return `https://chatgpt.com/c/${session.convId}`;
    if (session.platform === 'claude' && session.convId) return `https://claude.ai/chat/${session.convId}`;
    if (session.platform === 'grok' && session.convId) return `https://grok.com/chat/${session.convId}`;
    if (session.platform === 'gemini' && session.convId) return `https://gemini.google.com/app/${session.convId}`;
    return null;
  }
  function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // --- State ---
  let settings = await loadSettings();
  let currentSession = null;
  let currentPlatform = null;
  const snapshotCache = new Map();

  function makeCacheKey(session, mode) {
    if (!session) return '';
    return `${window.AIRelayCompress.sessionFingerprint(session)}::${mode}`;
  }
  function getCacheEntry(session, mode) { return snapshotCache.get(makeCacheKey(session, mode)) || null; }
  function setCacheEntry(session, mode, snap) {
    snapshotCache.set(makeCacheKey(session, mode), { snap, generatedAt: Date.now(), fingerprint: window.AIRelayCompress.sessionFingerprint(session) });
  }
  function isCacheValid(session, mode) {
    const entry = getCacheEntry(session, mode);
    return entry && entry.fingerprint === window.AIRelayCompress.sessionFingerprint(session);
  }

  // --- Ignore list ---
  async function getIgnoredConvs() {
    return new Promise((r) => chrome.storage.local.get(['airelay.ignoredConvs'], (res) => r(res['airelay.ignoredConvs'] || [])));
  }
  async function setIgnoredConvs(list) {
    return new Promise((r) => chrome.storage.local.set({ 'airelay.ignoredConvs': list }, r));
  }
  async function isConvIgnored(convId) {
    if (!convId) return false;
    const list = await getIgnoredConvs();
    return list.includes(convId);
  }
  async function ignoreConv(convId) {
    const list = await getIgnoredConvs();
    if (!list.includes(convId)) { list.push(convId); await setIgnoredConvs(list); }
  }
  async function unignoreConv(convId) {
    let list = await getIgnoredConvs();
    list = list.filter((c) => c !== convId);
    await setIgnoredConvs(list);
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

  // --- Snapshot generation (with cache) ---
  function generateSnapshot(session, mode) {
    if (isCacheValid(session, mode)) return getCacheEntry(session, mode).snap;
    const recentTurns = settings.recentTurns || 3;
    const snap = window.AIRelayCompress.compress(session, mode, { recentTurns });
    setCacheEntry(session, mode, snap);
    return snap;
  }

  // --- Shared UI: copy a snapshot for given session+mode, with button feedback ---
  async function copyModeSnapshot(session, mode, btnEl) {
    const snap = generateSnapshot(session, mode);
    if (!snap) { showToast(t('toast_empty')); return false; }
    const titleSpan = btnEl.querySelector('.action-title');
    const label = titleSpan || btnEl;
    const origText = label.textContent;
    btnEl.disabled = true;
    const ok = await copyToClipboard(snap);
    if (ok) {
      showToast(t('toast_copied'));
      label.textContent = t('btn_copied_ok');
      btnEl.classList.add('ok');
      setTimeout(() => { label.textContent = origText; btnEl.classList.remove('ok'); btnEl.disabled = false; }, 2500);
      return true;
    }
    showToast(t('toast_copy_fail'));
    btnEl.disabled = false;
    return false;
  }

  // --- Shared UI: show snapshot preview ---
  function showPreview(session, mode) {
    mode = mode || 'smart';
    const snap = generateSnapshot(session, mode);
    if (!snap) { showToast(t('toast_empty')); return; }
    previewText.textContent = snap;
    const ss = window.AIRelayCompress.snapshotStats(snap);
    previewStats.textContent = `${ss.chars.toLocaleString()} ${t('stat_chars')} · ~${ss.approxTokens.toLocaleString()} tokens`;
    previewOverlay.style.display = 'flex';
  }
  function hidePreview() { previewOverlay.style.display = 'none'; }
  btnClosePreview.onclick = hidePreview;
  btnCopyFromPreview.onclick = async () => {
    const snap = previewText.textContent;
    if (!snap) return;
    const ok = await copyToClipboard(snap);
    if (ok) { showToast(t('copied_text')); hidePreview(); }
  };

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

  function updateSnapshotSize(session) {
    if (!session?.messages?.length || !snapshotSizeEl) { if (snapshotSizeEl) snapshotSizeEl.innerHTML = ''; return; }
    const est = window.AIRelayCompress.estimateModeSize(session, 'smart');
    snapshotSizeEl.innerHTML = t('estimate_label', { chars: est.chars.toLocaleString(), tokens: est.approxTokens.toLocaleString() });
  }

  // --- Current tab: preview last 2 messages ---
  function renderCurrentPreview(session) {
    if (!session?.messages?.length) { currentPreview.style.display = 'none'; return; }
    const msgs = session.messages;
    const last = msgs.slice(-2);
    let html = '';
    for (const m of last) {
      const cls = m.role === 'user' ? 'pm-user' : 'pm-asst';
      const roleLabel = m.role === 'user' ? t('role_user') : t('role_assistant');
      html += `<div class="preview-msg ${cls}"><div class="pm-role">${roleLabel}</div><div class="pm-text">${escHtml(truncate(m.content, 200))}</div></div>`;
    }
    html += `<div class="preview-footer">${t('current_view_detail')}</div>`;
    currentPreview.innerHTML = html;
    currentPreview.style.display = 'block';
    currentPreview.onclick = () => showDetail(session);
  }

  // --- Active tab ---
  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs?.[0] || null;
  }
  function findSessionForTab(allRecent, tab, platform) {
    if (!platform || !tab?.url) return null;
    const byConvId = allRecent.find((s) => s.platform === platform && s.convId && tab.url.includes(s.convId));
    if (byConvId) return byConvId;
    const byUrl = allRecent.find((s) => s.platform === platform && s.url && s.url === tab.url);
    if (byUrl) return byUrl;
    const recent = allRecent.find((s) => s.platform === platform && s.updatedAt && (Date.now() - s.updatedAt < 60000));
    return recent || null;
  }

  // --- Refresh current panel ---
  async function refreshCurrentPanel() {
    const tab = await getActiveTab();
    currentPlatform = detectPlatformFromUrl(tab?.url || '');

    if (!currentPlatform) {
      subtitleEl.textContent = t('not_supported');
      infoEl.innerHTML = t('use_platforms', { list: `<b>${supportedList}</b>` });
      statsEl.innerHTML = '';
      currentPreview.style.display = 'none';
      actionGroup.style.display = 'none';
      currentIgnoreArea.style.display = 'none';
      ignoredHintEl.style.display = 'none';
      mainHintEl.innerHTML = '';
      return;
    }

    subtitleEl.textContent = `${SUPPORTED_PLATFORMS[currentPlatform]}`;
    const allRecent = await window.AIRelayStorage.listRecent(20);
    const session = findSessionForTab(allRecent, tab, currentPlatform);

    if (!session || !session.messages?.length) {
      currentSession = null;
      infoEl.innerHTML = !settings.captureEnabled ? t('capture_disabled_hint') : t('no_capture_hint');
      mainHintEl.innerHTML = '';
      statsEl.innerHTML = '';
      currentPreview.style.display = 'none';
      actionGroup.style.display = 'none';
      currentIgnoreArea.style.display = 'none';
      ignoredHintEl.style.display = 'none';
      return;
    }

    currentSession = session;
    const userCount = session.messages.filter((m) => m.role === 'user').length;
    const asstCount = session.messages.filter((m) => m.role === 'assistant').length;
    infoEl.innerHTML = t('captured_info', { total: session.messages.length, user: userCount, asst: asstCount });
    statsEl.innerHTML = renderStats(session);
    renderCurrentPreview(session);
    updateSnapshotSize(session);
    mainHintEl.innerHTML = '';

    actionGroup.style.display = 'flex';
    btnSmartCopy.disabled = false;
    btnFullCopy.disabled = false;
    btnPreviewCurrent.disabled = false;

    btnSmartCopy.onclick = async () => {
      const ok = await copyModeSnapshot(session, 'smart', btnSmartCopy);
      if (ok) showTargetLinks(currentPlatform);
    };
    btnFullCopy.onclick = async () => {
      const ok = await copyModeSnapshot(session, 'full', btnFullCopy);
      if (ok) showTargetLinks(currentPlatform);
    };
    btnPreviewCurrent.onclick = () => showPreview(session, 'smart');

    const ignored = await isConvIgnored(session.convId);
    if (ignored) {
      ignoredHintEl.style.display = 'block';
      btnIgnoreConv.textContent = t('btn_unignore_conv');
      currentIgnoreArea.style.display = 'block';
      btnIgnoreConv.onclick = async () => {
        await unignoreConv(session.convId);
        showToast(t('toast_unignored'));
        refreshCurrentPanel();
      };
    } else {
      ignoredHintEl.style.display = 'none';
      btnIgnoreConv.textContent = t('btn_ignore_conv');
      currentIgnoreArea.style.display = session.convId ? 'block' : 'none';
      btnIgnoreConv.onclick = async () => {
        await ignoreConv(session.convId);
        showToast(t('toast_ignored'));
        refreshCurrentPanel();
      };
    }
  }

  // --- Detail overlay with paging ---
  let detailSession = null;
  let detailRenderedCount = 0;

  function renderDetailMessages(container, messages, startIdx, count) {
    const end = Math.min(startIdx + count, messages.length);
    for (let i = startIdx; i < end; i++) {
      const m = messages[i];
      const roleLabel = m.role === 'user' ? t('role_user') : t('role_assistant');
      const roleClass = m.role === 'user' ? 'msg-user' : 'msg-asst';
      const needCollapse = m.content && m.content.length > COLLAPSE_THRESHOLD;

      const div = document.createElement('div');
      div.className = `detail-msg ${roleClass}`;

      let contentHtml = `<div class="msg-role">${roleLabel}</div>`;
      contentHtml += `<div class="msg-content${needCollapse ? ' collapsed' : ''}">${escHtml(m.content || '')}</div>`;
      if (needCollapse) {
        contentHtml += `<span class="msg-toggle" data-expanded="false">${t('btn_expand')}</span>`;
      }
      div.innerHTML = contentHtml;

      if (needCollapse) {
        const toggle = div.querySelector('.msg-toggle');
        toggle.onclick = () => {
          const content = div.querySelector('.msg-content');
          const expanded = toggle.getAttribute('data-expanded') === 'true';
          content.classList.toggle('collapsed', expanded);
          toggle.setAttribute('data-expanded', String(!expanded));
          toggle.textContent = expanded ? t('btn_expand') : t('btn_collapse');
        };
      }

      container.appendChild(div);
    }
    return end;
  }

  function showDetail(session) {
    detailSession = session;
    const platform = session.platform || 'chatgpt';
    const label = SUPPORTED_PLATFORMS[platform] || platform;
    detailTitle.textContent = sessionTitle(session) || label;

    const sourceUrl = getSessionSourceUrl(session);
    if (sourceUrl) {
      detailSourceLink.href = sourceUrl;
      detailSourceLink.style.display = 'inline';
      detailSourceLink.title = t('btn_open_original');
    } else {
      detailSourceLink.style.display = 'none';
    }

    const userCount = session.messages.filter((m) => m.role === 'user').length;
    const asstCount = session.messages.filter((m) => m.role === 'assistant').length;
    const stats = window.AIRelayCompress.estimateStats(session);
    const totalMsgs = session.messages.length;

    let html = `<div class="detail-meta">`;
    html += `<div class="detail-platform">${label} · ${t('detail_messages', { n: userCount + asstCount, turns: stats.turns })}</div>`;
    if (sourceUrl) {
      html += `<a class="detail-url" href="${escHtml(sourceUrl)}" target="_blank">${escHtml(truncate(sourceUrl.replace(/^https?:\/\//, ''), 70))}</a>`;
    }
    html += `<div class="detail-time">${timeAgo(session.updatedAt)}</div>`;
    html += `</div><div class="detail-messages" id="detail-msg-container"></div>`;
    detailBody.innerHTML = html;

    const container = document.getElementById('detail-msg-container');
    detailRenderedCount = 0;
    const rendered = renderDetailMessages(container, session.messages, 0, DETAIL_PAGE_SIZE);
    detailRenderedCount = rendered;

    if (rendered < totalMsgs) {
      detailLoadMore.style.display = 'block';
      detailPaging.textContent = t('detail_showing', { n: rendered, total: totalMsgs });
    } else {
      detailLoadMore.style.display = 'none';
    }

    btnDetailSmart.disabled = false;
    btnDetailFull.disabled = false;
    btnDetailPreview.disabled = false;
    detailOverlay.style.display = 'flex';
  }

  btnLoadMore.onclick = () => {
    if (!detailSession) return;
    const container = document.getElementById('detail-msg-container');
    if (!container) return;
    const rendered = renderDetailMessages(container, detailSession.messages, detailRenderedCount, DETAIL_PAGE_SIZE);
    detailRenderedCount = rendered;
    if (rendered >= detailSession.messages.length) {
      detailLoadMore.style.display = 'none';
    } else {
      detailPaging.textContent = t('detail_showing', { n: rendered, total: detailSession.messages.length });
    }
  };

  function hideDetail() { detailOverlay.style.display = 'none'; detailSession = null; }
  btnCloseDetail.onclick = hideDetail;

  btnDetailDelete.onclick = async () => {
    if (!detailSession) return;
    if (!confirm(t('confirm_delete_session'))) return;
    const key = window.AIRelayStorage.sessionKey(detailSession.platform, detailSession.convId);
    await window.AIRelayStorage.deleteSessionByKey(key);
    showToast(t('toast_deleted'));
    hideDetail();
    renderRecent();
    refreshCurrentPanel();
  };

  btnDetailSmart.onclick = async () => {
    if (!detailSession) return;
    await copyModeSnapshot(detailSession, 'smart', btnDetailSmart);
  };
  btnDetailFull.onclick = async () => {
    if (!detailSession) return;
    await copyModeSnapshot(detailSession, 'full', btnDetailFull);
  };
  btnDetailPreview.onclick = () => {
    if (!detailSession) return;
    showPreview(detailSession, 'smart');
  };

  // --- Recent panel ---
  async function renderRecent() {
    const recent = await window.AIRelayStorage.listRecent(10);
    if (!recent.length) {
      recentEl.innerHTML = `<div class="recent-empty">${t('recent_empty', { list: supportedList })}</div>`;
      return;
    }
    recentEl.innerHTML = '';
    for (const s of recent) {
      const item = document.createElement('div');
      item.className = 'recent-item';
      const platform = s.platform || 'chatgpt';
      const badgeClass = platform === 'claude' ? 'badge-claude'
        : platform === 'grok' ? 'badge-grok'
        : platform === 'gemini' ? 'badge-gemini'
        : 'badge-chatgpt';
      const badgeText = platform === 'claude' ? 'C'
        : platform === 'grok' ? 'X'
        : platform === 'gemini' ? 'Gm'
        : 'G';
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
  await refreshCurrentPanel();
  await renderRecent();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SESSION_STORAGE_KEY]) { refreshCurrentPanel(); renderRecent(); }
  });
  chrome.tabs.onActivated.addListener(() => { refreshCurrentPanel(); });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url) refreshCurrentPanel();
  });

  // --- Settings panel ---
  selectRecentTurns.value = String(settings.recentTurns || 3);
  selectRecentTurns.onchange = async () => {
    settings.recentTurns = parseInt(selectRecentTurns.value, 10);
    await saveSettings({ recentTurns: settings.recentTurns });
    snapshotCache.clear();
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
