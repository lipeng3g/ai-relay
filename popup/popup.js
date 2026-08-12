// AI Relay · popup.js (SidePanel)

(async function () {
  const t = window.AIRelayI18n.t;
  const UI = window.AIRelayUIHelpers;
  window.AIRelayI18n.applyI18nAttributes();
  document.querySelector('[data-i18n="about_desc"]').innerHTML =
    t('about_desc', { version: chrome.runtime.getManifest().version });

  const SUPPORTED_PLATFORMS = { chatgpt: 'ChatGPT', claude: 'Claude', grok: 'Grok', gemini: 'Gemini' };
  const PLATFORM_URLS = {
    chatgpt: 'https://chatgpt.com/',
    claude: 'https://claude.ai/new',
    grok: 'https://grok.com/',
    gemini: 'https://gemini.google.com/',
  };
  const SESSION_STORAGE_KEY = 'airelay.sessions.v1';
  const SETTINGS_KEY = 'airelay.settings';
  const DETAIL_PAGE_SIZE = 20;
  const COLLAPSE_THRESHOLD = 300;

  // DOM refs
  const appShell = document.getElementById('app-shell');
  const tabList = document.querySelector('[role="tablist"]');
  const tabButtons = Array.from(tabList.querySelectorAll('[role="tab"]'));
  const subtitleEl = document.getElementById('subtitle');
  const infoEl = document.getElementById('current-info');
  const statsEl = document.getElementById('current-stats');
  const currentPreview = document.getElementById('current-preview');
  const emptyState = document.getElementById('empty-state');
  const emptyStateTitle = document.getElementById('empty-state-title');
  const emptyStateBody = document.getElementById('empty-state-body');
  const btnRetryDetection = document.getElementById('btn-retry-detection');
  const currentRecent = document.getElementById('current-recent');
  const currentRecentList = document.getElementById('current-recent-list');
  const btnOpenHistory = document.getElementById('btn-open-history');
  const actionGroup = document.getElementById('action-group');
  const currentRelayMode = document.getElementById('current-relay-mode');
  const btnCopyRelay = document.getElementById('btn-copy-relay');
  const btnPreviewCurrent = document.getElementById('btn-preview-current');
  const relayEstimateEl = document.getElementById('relay-estimate');
  const relayStatusEl = document.getElementById('relay-status');
  const relayStatusHeading = document.getElementById('relay-status-heading');
  const relayStatusMeta = document.getElementById('relay-status-meta');
  const relayNextStep = document.getElementById('relay-next-step');
  const btnPreviewCopied = document.getElementById('btn-preview-copied');
  const btnRecopy = document.getElementById('btn-recopy');
  const btnCancelRelay = document.getElementById('btn-cancel-relay');
  const currentIgnoreArea = document.getElementById('current-ignore-area');
  const btnIgnoreConv = document.getElementById('btn-ignore-conv');
  const ignoredHintEl = document.getElementById('ignored-hint');
  const targetLinksEl = document.getElementById('target-links');
  const targetBtnsEl = document.getElementById('target-btns');
  const mainHintEl = document.getElementById('main-hint');
  const recentEl = document.getElementById('recent-list');
  const historySearch = document.getElementById('history-search');
  const historyPlatform = document.getElementById('history-platform');
  const historySummary = document.getElementById('history-summary');
  const btnHistoryMore = document.getElementById('btn-history-more');
  const toastEl = document.getElementById('toast');

  const previewOverlay = document.getElementById('preview-overlay');
  const previewText = document.getElementById('preview-text');
  const previewStats = document.getElementById('preview-stats');
  const btnClosePreview = document.getElementById('btn-close-preview');
  const btnCopyFromPreview = document.getElementById('btn-copy-from-preview');
  const previewRelayMode = document.getElementById('preview-relay-mode');

  const detailOverlay = document.getElementById('detail-overlay');
  const detailTitle = document.getElementById('detail-title');
  const detailBody = document.getElementById('detail-body');
  const detailSourceLink = document.getElementById('detail-source-link');
  const detailLoadMore = document.getElementById('detail-load-more');
  const btnLoadMore = document.getElementById('btn-load-more');
  const detailPaging = document.getElementById('detail-paging');
  const btnCloseDetail = document.getElementById('btn-close-detail');
  const btnDetailDelete = document.getElementById('btn-detail-delete');
  const detailRelayMode = document.getElementById('detail-relay-mode');
  const btnDetailCopy = document.getElementById('btn-detail-copy');
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

  function showToast(text, isError = false) {
    toastEl.setAttribute('role', isError ? 'alert' : 'status');
    toastEl.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    toastEl.textContent = text;
    toastEl.classList.add('show');
    setTimeout(() => {
      toastEl.classList.remove('show');
      setTimeout(() => {
        toastEl.textContent = '';
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', 'polite');
      }, 250);
    }, 2000);
  }

  function selectTab(name, { focus = false } = {}) {
    const targetId = `tab-${name}`;
    for (const button of tabButtons) {
      const selected = button.id === targetId;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      panel.classList.toggle('active', selected);
      panel.hidden = !selected;
      if (selected && focus) button.focus();
    }
  }

  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => selectTab(button.id.replace('tab-', '')));
    button.addEventListener('keydown', (event) => {
      let next = null;
      if (event.key === 'ArrowRight') next = (index + 1) % tabButtons.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabButtons.length) % tabButtons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabButtons.length - 1;
      if (next === null) return;
      event.preventDefault();
      selectTab(tabButtons[next].id.replace('tab-', ''), { focus: true });
    });
  });

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

  const truncate = UI.truncate;
  function sessionTitle(session) {
    return UI.sessionTitle(session, t('no_title'), 50);
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
    return UI.getSessionSourceUrl(session);
  }
  function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function iconSvg(name, className = '') {
    return `<svg class="icon ${className}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  }
  function platformIconName(platform) {
    return ['chatgpt', 'claude', 'gemini', 'grok'].includes(platform) ? platform : 'relay';
  }

  // --- State ---
  let settings = await loadSettings();
  let currentSession = null;
  let currentPlatform = null;
  let currentRefreshId = 0;
  let detectionRetryTimer = null;
  let detectionRetryAttempts = 0;
  let relayTask = null;
  let previewContext = null;
  let recentLimit = 10;
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

  function modeLabel(mode) {
    return mode === 'full' ? t('mode_full_name') : t('mode_smart_name');
  }

  function selectedMode(group) {
    return group?.querySelector('input[type="radio"]:checked')?.value || 'smart';
  }

  const dialogReturnFocus = new Map();
  function isDialogOpen(dialog) { return dialog.style.display !== 'none'; }
  function openDialog(dialog, initialFocus) {
    const wasOpen = isDialogOpen(dialog);
    if (!wasOpen) dialogReturnFocus.set(dialog, document.activeElement);
    appShell.inert = true;
    if (dialog === previewOverlay && isDialogOpen(detailOverlay)) detailOverlay.inert = true;
    dialog.style.display = 'flex';
    if (!wasOpen) requestAnimationFrame(() => (initialFocus || dialog.querySelector('button, a, input'))?.focus());
  }
  function closeDialog(dialog) {
    dialog.style.display = 'none';
    dialog.inert = false;
    const detailStillOpen = isDialogOpen(detailOverlay);
    const previewStillOpen = isDialogOpen(previewOverlay);
    if (dialog === previewOverlay && detailStillOpen) {
      detailOverlay.inert = false;
    }
    if (!detailStillOpen && !previewStillOpen) {
      appShell.inert = false;
    }
    const returnFocus = dialogReturnFocus.get(dialog);
    dialogReturnFocus.delete(dialog);
    if (returnFocus?.isConnected && !(dialog === detailOverlay && previewStillOpen)) {
      requestAnimationFrame(() => returnFocus.focus());
    }
  }
  function trapDialogFocus(dialog, event) {
    const focusable = Array.from(dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'))
      .filter((element) => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // --- Shared UI: copy relay text for a session and keep the active relay task ---
  async function copyModeSnapshot(session, mode, btnEl) {
    const snap = generateSnapshot(session, mode);
    if (!snap) { showToast(t('toast_empty')); return false; }
    const titleSpan = btnEl.querySelector('.action-title, [data-i18n]');
    const label = titleSpan || btnEl;
    const origText = label.textContent;
    btnEl.disabled = true;
    const ok = await copyToClipboard(snap);
    if (ok) {
      showToast(t('toast_copied'));
      relayTask = {
        session,
        mode,
        text: snap,
        chars: snap.length,
        sourcePlatform: session.platform || currentPlatform,
        copiedAt: Date.now(),
      };
      renderRelayTask();
      label.textContent = t('btn_copied_ok');
      btnEl.classList.add('ok');
      setTimeout(() => { label.textContent = origText; btnEl.classList.remove('ok'); btnEl.disabled = false; }, 2500);
      return true;
    }
    showToast(t('toast_copy_fail'), true);
    btnEl.disabled = false;
    return false;
  }

  // --- Shared UI: show relay text preview ---
  function renderPreview(session, mode) {
    mode = mode || 'smart';
    const snap = generateSnapshot(session, mode);
    if (!snap) { showToast(t('toast_empty')); return; }
    previewContext = { session, mode, text: snap };
    const modeInput = previewRelayMode.querySelector(`input[value="${mode}"]`);
    if (modeInput) modeInput.checked = true;
    previewText.textContent = snap;
    const ss = window.AIRelayCompress.snapshotStats(snap);
    previewStats.textContent = `${modeLabel(mode)} · ${ss.chars.toLocaleString()} ${t('stat_chars')} · ~${ss.approxTokens.toLocaleString()} tokens`;
  }
  function showPreview(session, mode) {
    renderPreview(session, mode);
    if (!previewContext) return;
    openDialog(previewOverlay, btnClosePreview);
  }
  function hidePreview() { closeDialog(previewOverlay); previewContext = null; }
  btnClosePreview.onclick = hidePreview;
  previewRelayMode.addEventListener('change', () => {
    if (previewContext) renderPreview(previewContext.session, selectedMode(previewRelayMode));
  });
  btnCopyFromPreview.onclick = async () => {
    const snap = previewText.textContent;
    if (!snap) return;
    const ok = await copyToClipboard(snap);
    if (ok && previewContext) {
      relayTask = {
        session: previewContext.session,
        mode: previewContext.mode,
        text: snap,
        chars: snap.length,
        sourcePlatform: previewContext.session.platform || currentPlatform,
        copiedAt: Date.now(),
      };
      renderRelayTask();
      showToast(t('copied_text'));
      hidePreview();
    } else if (!ok) showToast(t('toast_copy_fail'), true);
  };

  function showTargetLinks(sourcePlatform) {
    targetBtnsEl.innerHTML = '';
    for (const [key, url] of Object.entries(PLATFORM_URLS)) {
      if (key === sourcePlatform) continue;
      const label = SUPPORTED_PLATFORMS[key] || key;
      const a = document.createElement('a');
      a.className = 'target-btn';
      a.href = url;
      a.target = '_blank';
      a.innerHTML = `${iconSvg(platformIconName(key), `platform-icon platform-${key}`)}<span>${label}</span>`;
      targetBtnsEl.appendChild(a);
    }
    targetLinksEl.style.display = 'block';
  }

  function updateRelayEstimate(session, mode) {
    if (!session?.messages?.length) { relayEstimateEl.innerHTML = ''; return; }
    const est = window.AIRelayCompress.estimateModeSize(session, mode, {
      recentTurns: settings.recentTurns || 3,
    });
    relayEstimateEl.innerHTML = t('estimate_label', { chars: est.chars.toLocaleString(), tokens: est.approxTokens.toLocaleString() });
  }

  function renderRelayTask() {
    if (!relayTask) {
      relayStatusEl.style.display = 'none';
      targetLinksEl.style.display = 'none';
      return;
    }
    const source = SUPPORTED_PLATFORMS[relayTask.sourcePlatform] || relayTask.sourcePlatform;
    relayStatusHeading.textContent = t('relay_copied_heading', { source });
    relayStatusMeta.textContent = t('relay_status_meta', {
      mode: modeLabel(relayTask.mode),
      chars: relayTask.chars.toLocaleString(),
    });
    const destination = UI.relayDestination(relayTask.sourcePlatform, currentPlatform);
    if (destination.kind === 'current') {
      relayNextStep.innerHTML = t('relay_next_current', { target: SUPPORTED_PLATFORMS[destination.platform] || destination.platform });
      targetLinksEl.style.display = 'none';
    } else {
      relayNextStep.innerHTML = t('relay_next_choose');
      showTargetLinks(relayTask.sourcePlatform);
    }
    relayStatusEl.style.display = 'block';
  }

  btnPreviewCopied.onclick = () => {
    if (relayTask) showPreview(relayTask.session, relayTask.mode);
  };
  btnRecopy.onclick = async () => {
    if (!relayTask) return;
    const ok = await copyToClipboard(relayTask.text);
    showToast(ok ? t('toast_copied') : t('toast_copy_fail'), !ok);
  };
  btnCancelRelay.onclick = () => {
    relayTask = null;
    renderRelayTask();
    showToast(t('toast_relay_cancelled'));
  };

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
    currentPreview.onkeydown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      showDetail(session);
    };
  }

  function renderCurrentRecent(sessions) {
    const recent = (sessions || []).slice(0, 3);
    if (!recent.length) {
      currentRecent.style.display = 'none';
      return;
    }
    currentRecentList.innerHTML = '';
    for (const session of recent) {
      const button = document.createElement('button');
      button.className = 'compact-session';
      const platform = SUPPORTED_PLATFORMS[session.platform] || session.platform;
      const stats = window.AIRelayCompress.estimateStats(session);
      button.innerHTML = `<span class="compact-session-title">${escHtml(sessionTitle(session))}</span>` +
        `<span class="compact-session-meta">${escHtml(platform)} · ${stats.turns} ${t('stat_turns')} · ${timeAgo(session.updatedAt)}</span>`;
      button.onclick = () => showDetail(session);
      currentRecentList.appendChild(button);
    }
    currentRecent.style.display = 'block';
  }

  // --- Active tab ---
  async function getActiveTab() {
    // A side panel document can outlive the tab where it was opened. In that
    // context `currentWindow` may stay anchored to the previous tab/window;
    // `lastFocusedWindow` follows the browser window the user is operating.
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs?.[0] || null;
  }
  function getContentStatus(tabId) {
    if (!tabId) return Promise.resolve({ injected: false });
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: 'airelay:get-status' }, (response) => {
        if (chrome.runtime.lastError || !response) resolve({ injected: false });
        else resolve(response);
      });
    });
  }
  function showEmptyState(kind) {
    const keys = {
      captureOff: ['empty_capture_off_title', 'empty_capture_off_body'],
      newChat: ['empty_new_chat_title', 'empty_new_chat_body'],
      notInjected: ['empty_not_injected_title', 'empty_not_injected_body'],
      error: ['empty_error_title', 'empty_error_body'],
      waiting: ['empty_waiting_title', 'empty_waiting_body'],
    };
    const [titleKey, bodyKey] = keys[kind] || keys.waiting;
    emptyStateTitle.textContent = t(titleKey);
    emptyStateBody.textContent = t(bodyKey);
    btnRetryDetection.style.display = kind === 'newChat' || kind === 'captureOff' ? 'none' : 'block';
    emptyState.style.display = 'block';
    if (kind === 'notInjected') scheduleDetectionRetry();
    else resetDetectionRetry();
  }
  function hideEmptyState() { emptyState.style.display = 'none'; }
  function resetDetectionRetry() {
    if (detectionRetryTimer) clearTimeout(detectionRetryTimer);
    detectionRetryTimer = null;
    detectionRetryAttempts = 0;
  }
  function scheduleDetectionRetry() {
    if (detectionRetryTimer || detectionRetryAttempts >= 8) return;
    const delay = Math.min(250 * (2 ** detectionRetryAttempts), 2000);
    detectionRetryAttempts += 1;
    detectionRetryTimer = setTimeout(() => {
      detectionRetryTimer = null;
      refreshCurrentPanel();
    }, delay);
  }
  function findSessionForTab(allRecent, tab, platform) {
    return UI.findSessionForTab(allRecent, tab, platform);
  }

  // --- Refresh current panel ---
  async function refreshCurrentPanel() {
    const refreshId = ++currentRefreshId;
    const tab = await getActiveTab();
    if (refreshId !== currentRefreshId) return;
    currentPlatform = detectPlatformFromUrl(tab?.url || '');
    renderRelayTask();

    if (!currentPlatform) {
      resetDetectionRetry();
      subtitleEl.textContent = t('not_supported');
      infoEl.style.display = 'block';
      infoEl.innerHTML = t('use_platforms', { list: `<b>${supportedList}</b>` });
      statsEl.innerHTML = '';
      currentPreview.style.display = 'none';
      actionGroup.style.display = 'none';
      hideEmptyState();
      currentRecent.style.display = 'none';
      currentIgnoreArea.style.display = 'none';
      ignoredHintEl.style.display = 'none';
      mainHintEl.innerHTML = '';
      return;
    }

    subtitleEl.textContent = `${SUPPORTED_PLATFORMS[currentPlatform]}`;
    const [allRecent, contentStatus] = await Promise.all([
      window.AIRelayStorage.listRecent(20),
      getContentStatus(tab?.id),
    ]);
    if (refreshId !== currentRefreshId) return;
    const session = findSessionForTab(allRecent, tab, currentPlatform);

    if (!session || !session.messages?.length) {
      currentSession = null;
      infoEl.innerHTML = '';
      infoEl.style.display = 'none';
      mainHintEl.innerHTML = '';
      statsEl.innerHTML = '';
      currentPreview.style.display = 'none';
      actionGroup.style.display = 'none';
      currentIgnoreArea.style.display = 'none';
      ignoredHintEl.style.display = 'none';
      showEmptyState(UI.emptyStateKind({
        captureEnabled: settings.captureEnabled,
        contentStatus,
        platform: currentPlatform,
        url: tab?.url || '',
      }));
      renderCurrentRecent(allRecent);
      return;
    }

    currentSession = session;
    resetDetectionRetry();
    hideEmptyState();
    currentRecent.style.display = 'none';
    infoEl.style.display = 'block';
    const userCount = session.messages.filter((m) => m.role === 'user').length;
    const asstCount = session.messages.filter((m) => m.role === 'assistant').length;
    infoEl.innerHTML = t('captured_info', { total: session.messages.length, user: userCount, asst: asstCount });
    statsEl.innerHTML = renderStats(session);
    renderCurrentPreview(session);
    updateRelayEstimate(session, selectedMode(currentRelayMode));
    mainHintEl.innerHTML = '';

    actionGroup.style.display = 'flex';
    btnCopyRelay.disabled = false;
    btnPreviewCurrent.disabled = false;

    btnCopyRelay.onclick = () => copyModeSnapshot(session, selectedMode(currentRelayMode), btnCopyRelay);
    btnPreviewCurrent.onclick = () => showPreview(session, selectedMode(currentRelayMode));

    const ignored = await isConvIgnored(session.convId);
    if (refreshId !== currentRefreshId) return;
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

  currentRelayMode.addEventListener('change', () => {
    if (currentSession) updateRelayEstimate(currentSession, selectedMode(currentRelayMode));
  });
  btnRetryDetection.onclick = () => {
    resetDetectionRetry();
    refreshCurrentPanel();
  };
  btnOpenHistory.onclick = () => selectTab('history', { focus: true });

  // --- Detail overlay with paging ---
  let detailSession = null;
  let detailRenderedCount = 0;
  let detailRequestId = 0;

  function reconcileTransientSessions(sessionMap) {
    const previousRelayTask = relayTask;
    const previousPreviewContext = previewContext;
    const previousDetailSession = detailSession;
    const next = UI.reconcileTransientSessions(sessionMap, {
      currentSession,
      relayTask,
      previewContext,
      detailSession,
    });
    currentSession = next.currentSession;
    relayTask = next.relayTask;
    previewContext = next.previewContext;
    detailSession = next.detailSession;
    if (previousRelayTask && !relayTask) renderRelayTask();
    if (previousPreviewContext && !previewContext && isDialogOpen(previewOverlay)) {
      closeDialog(previewOverlay);
    }
    if (previousDetailSession && !detailSession && isDialogOpen(detailOverlay)) {
      hideDetail();
    }
  }

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
      contentHtml += `<div class="msg-content markdown-body${needCollapse ? ' collapsed' : ''}">${UI.renderSafeMarkdown(m.content || '')}</div>`;
      if (needCollapse) {
        contentHtml += `<button class="msg-toggle" data-expanded="false">${t('btn_expand')}</button>`;
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

  function sessionUiRevision(session) {
    if (!session) return '';
    return JSON.stringify([
      window.AIRelayCompress.sessionFingerprint(session),
      session.title || '',
      session.url || '',
      session.updatedAt || 0,
    ]);
  }

  async function showDetail(session, { loadFresh = true } = {}) {
    const requestId = ++detailRequestId;
    if (loadFresh && session?.platform && session?.convId) {
      const key = window.AIRelayStorage.sessionKey(session.platform, session.convId);
      const fresh = await window.AIRelayStorage.getSessionByKey(key);
      if (requestId !== detailRequestId) return;
      if (!fresh) {
        hideDetail();
        return;
      }
      session = fresh;
    }
    const wasOpen = isDialogOpen(detailOverlay);
    const previousRenderedCount = wasOpen ? detailRenderedCount : 0;
    const previousScrollTop = wasOpen ? detailBody.scrollTop : 0;
    detailSession = session;
    const platform = session.platform || 'chatgpt';
    const label = SUPPORTED_PLATFORMS[platform] || platform;
    detailTitle.textContent = sessionTitle(session) || label;

    const sourceUrl = getSessionSourceUrl(session);
    if (sourceUrl) {
      detailSourceLink.href = sourceUrl;
      detailSourceLink.style.display = 'inline-flex';
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
    const initialCount = Math.max(DETAIL_PAGE_SIZE, previousRenderedCount);
    const rendered = renderDetailMessages(container, session.messages, 0, initialCount);
    detailRenderedCount = rendered;

    if (rendered < totalMsgs) {
      detailLoadMore.style.display = 'block';
      detailPaging.textContent = t('detail_showing', { n: rendered, total: totalMsgs });
    } else {
      detailLoadMore.style.display = 'none';
    }

    btnDetailCopy.disabled = false;
    btnDetailPreview.disabled = false;
    openDialog(detailOverlay, btnCloseDetail);
    if (wasOpen) {
      requestAnimationFrame(() => {
        detailBody.scrollTop = Math.min(previousScrollTop, detailBody.scrollHeight - detailBody.clientHeight);
      });
    }
  }

  async function refreshOpenDetail() {
    if (!detailSession) return;
    const key = window.AIRelayStorage.sessionKey(detailSession.platform, detailSession.convId);
    const fresh = await window.AIRelayStorage.getSessionByKey(key);
    if (!fresh) {
      hideDetail();
      return;
    }
    if (sessionUiRevision(fresh) === sessionUiRevision(detailSession)) return;
    await showDetail(fresh, { loadFresh: false });
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

  function hideDetail() {
    detailRequestId += 1;
    closeDialog(detailOverlay);
    detailSession = null;
  }
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

  btnDetailCopy.onclick = async () => {
    if (!detailSession) return;
    await copyModeSnapshot(detailSession, selectedMode(detailRelayMode), btnDetailCopy);
  };
  btnDetailPreview.onclick = () => {
    if (!detailSession) return;
    showPreview(detailSession, selectedMode(detailRelayMode));
  };

  // --- Recent panel ---
  let openSessionMenuButton = null;
  let sessionMenuSerial = 0;

  function closeSessionMenus(except, { restoreFocus = false } = {}) {
    for (const menu of recentEl.querySelectorAll('.recent-menu')) {
      if (menu !== except) {
        menu.style.display = 'none';
        menu.parentElement?.querySelector('.recent-more')?.setAttribute('aria-expanded', 'false');
      }
    }
    if (!except) {
      const returnFocus = restoreFocus ? openSessionMenuButton : null;
      openSessionMenuButton = null;
      if (returnFocus?.isConnected) requestAnimationFrame(() => returnFocus.focus());
    }
  }

  async function renderRecent({ resetLimit = false } = {}) {
    if (resetLimit) recentLimit = 10;
    const allRecent = await window.AIRelayStorage.listRecent(100);
    const filtered = UI.filterSessions(allRecent, {
      query: historySearch.value,
      platform: historyPlatform.value,
      noTitle: t('no_title'),
    });
    historySummary.textContent = t('history_result_count', { n: filtered.length });
    btnHistoryMore.style.display = filtered.length > recentLimit ? 'block' : 'none';

    if (!allRecent.length) {
      recentEl.innerHTML = `<div class="recent-empty">${t('recent_empty', { list: supportedList })}</div>`;
      return;
    }
    if (!filtered.length) {
      recentEl.innerHTML = `<div class="recent-empty">${t('history_no_results')}</div>`;
      return;
    }
    recentEl.innerHTML = '';
    for (const s of filtered.slice(0, recentLimit)) {
      const item = document.createElement('div');
      item.className = 'recent-item';
      const platform = s.platform || 'chatgpt';
      const badgeClass = platform === 'claude' ? 'badge-claude'
        : platform === 'grok' ? 'badge-grok'
        : platform === 'gemini' ? 'badge-gemini'
        : 'badge-chatgpt';
      const title = sessionTitle(s);
      const userCount = s.messages.filter((m) => m.role === 'user').length;
      const asstCount = s.messages.filter((m) => m.role === 'assistant').length;
      const sourceUrl = getSessionSourceUrl(s);
      const stats = window.AIRelayCompress.estimateStats(s);
      const menuId = `session-menu-${++sessionMenuSerial}`;

      item.innerHTML = `
        <div class="recent-badge ${badgeClass}">${iconSvg(platformIconName(platform), 'platform-icon')}</div>
        <div class="recent-body">
          <div class="recent-title">${escHtml(title)}</div>
          <div class="recent-platform">${escHtml(SUPPORTED_PLATFORMS[platform] || platform)}</div>
          <div class="recent-meta">${t('recent_count', { n: userCount + asstCount })} · ${stats.turns} ${t('stat_turns')} · ${timeAgo(s.updatedAt)}</div>
        </div>
        <button class="recent-more" title="${escHtml(t('session_more'))}" aria-label="${escHtml(t('session_more'))}" aria-haspopup="menu" aria-controls="${menuId}" aria-expanded="false">${iconSvg('more')}</button>
        <div class="recent-menu" id="${menuId}" role="menu" style="display:none;">
          ${sourceUrl ? `<a role="menuitem" href="${escHtml(sourceUrl)}" target="_blank">${t('btn_open_original')}</a>` : ''}
          ${s.convId ? `<button role="menuitem" type="button" data-action="ignore">${t('btn_ignore_conv')}</button>` : ''}
          <button role="menuitem" type="button" data-action="delete" class="danger-item">${t('btn_delete_session')}</button>
        </div>
      `;

      const recentBody = item.querySelector('.recent-body');
      recentBody.setAttribute('role', 'button');
      recentBody.tabIndex = 0;
      recentBody.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        showDetail(s);
      });
      recentBody.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        showDetail(s);
      });

      const menu = item.querySelector('.recent-menu');
      const moreButton = item.querySelector('.recent-more');
      moreButton.onclick = (e) => {
        e.stopPropagation();
        const opening = menu.style.display === 'none';
        closeSessionMenus(menu);
        menu.style.display = opening ? 'flex' : 'none';
        moreButton.setAttribute('aria-expanded', String(opening));
        openSessionMenuButton = opening ? moreButton : null;
        if (opening) requestAnimationFrame(() => menu.querySelector('[role="menuitem"]')?.focus());
        else moreButton.focus();
      };
      menu.addEventListener('keydown', (event) => {
        const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
        const currentIndex = items.indexOf(document.activeElement);
        let nextIndex = null;
        if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
        if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = items.length - 1;
        if (event.key === 'Escape') {
          event.preventDefault();
          closeSessionMenus(null, { restoreFocus: true });
          return;
        }
        if (nextIndex === null || !items.length) return;
        event.preventDefault();
        items[nextIndex].focus();
      });
      const ignoreAction = menu.querySelector('[data-action="ignore"]');
      if (ignoreAction) ignoreAction.onclick = async (e) => {
        e.stopPropagation();
        await ignoreConv(s.convId);
        showToast(t('toast_ignored'));
        closeSessionMenus(null, { restoreFocus: true });
      };
      menu.querySelector('[data-action="delete"]').onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(t('confirm_delete_session'))) return;
        const key = window.AIRelayStorage.sessionKey(s.platform, s.convId);
        await window.AIRelayStorage.deleteSessionByKey(key);
        showToast(t('toast_deleted'));
        renderRecent();
      };

      recentEl.appendChild(item);
    }
  }

  historySearch.addEventListener('input', () => renderRecent({ resetLimit: true }));
  historyPlatform.addEventListener('change', () => renderRecent({ resetLimit: true }));
  btnHistoryMore.onclick = () => { recentLimit += 10; renderRecent(); };
  document.addEventListener('click', () => closeSessionMenus());
  document.addEventListener('keydown', (event) => {
    const activeDialog = isDialogOpen(previewOverlay)
      ? previewOverlay
      : isDialogOpen(detailOverlay) ? detailOverlay : null;
    if (event.key === 'Escape') {
      if (activeDialog === previewOverlay) hidePreview();
      else if (activeDialog === detailOverlay) hideDetail();
      else closeSessionMenus(null, { restoreFocus: true });
      return;
    }
    if (event.key === 'Tab' && activeDialog) trapDialogFocus(activeDialog, event);
  });

  // --- Init ---
  await refreshCurrentPanel();
  await renderRecent();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SESSION_STORAGE_KEY]) {
      reconcileTransientSessions(changes[SESSION_STORAGE_KEY].newValue || {});
      refreshCurrentPanel();
      renderRecent();
      void refreshOpenDetail();
    }
  });
  chrome.tabs.onActivated.addListener(() => {
    resetDetectionRetry();
    refreshCurrentPanel();
  });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      resetDetectionRetry();
      refreshCurrentPanel();
    }
  });

  // --- Settings panel ---
  selectRecentTurns.value = String(settings.recentTurns || 3);
  selectRecentTurns.onchange = async () => {
    settings.recentTurns = parseInt(selectRecentTurns.value, 10);
    await saveSettings({ recentTurns: settings.recentTurns });
    snapshotCache.clear();
    if (currentSession) updateRelayEstimate(currentSession, selectedMode(currentRelayMode));
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
    reconcileTransientSessions({});
    showToast(t('toast_cleared'));
    snapshotCache.clear();
    await Promise.all([refreshCurrentPanel(), renderRecent()]);
  };
})();
