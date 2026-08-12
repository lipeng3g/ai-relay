// AI Relay · content script (isolated world)
// Responsibilities:
//   1. Publish capture/debug settings to the MAIN-world interceptor.
//   2. Listen for 'airelay:capture' / 'airelay:history' CustomEvents from the page.
//   3. Persist captured messages to chrome.storage.local (serialized writes).
//
// Session merge logic lives in lib/session-store.js (loaded before this file,
// shared with Node tests as the single source of truth).

(function () {

  let captureEnabled = false;
  let debugEnabled = false;
  let diagnosticStatus = 'loading';
  let diagnosticError = '';

  function setDiagnosticStatus(status, error = '') {
    diagnosticStatus = status;
    diagnosticError = error;
    const root = document.documentElement;
    if (!root) return;
    root.dataset.airelayContent = status;
    if (error) root.dataset.airelayError = error.slice(0, 300);
    else delete root.dataset.airelayError;
  }

  setDiagnosticStatus('loaded');

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'airelay:get-status') return false;
    sendResponse({
      injected: true,
      status: diagnosticStatus,
      error: diagnosticError,
      captureEnabled,
      url: location.href,
    });
    return false;
  });

  function publishConfig() {
    const root = document.documentElement;
    if (root) {
      root.dataset.airelayCapture = captureEnabled ? 'on' : 'off';
      root.dataset.airelayDebug = debugEnabled ? 'on' : 'off';
    }
    try {
      window.dispatchEvent(new CustomEvent('airelay:config', {
        detail: { captureEnabled, debugEnabled },
      }));
    } catch {}
  }

  chrome.storage.local.get(['airelay.captureEnabled', 'airelay.debugPref'], (res) => {
    captureEnabled = !!res['airelay.captureEnabled'];
    debugEnabled = !!res['airelay.debugPref'];
    setDiagnosticStatus(captureEnabled ? 'active' : 'capture-off');
    publishConfig();
    console.info('[AI Relay] content bridge active');
  });

  // React to the side-panel toggle without requiring a page refresh.
  // The MAIN-world proxy is installed at document_start. The toggle controls
  // whether it observes target requests and whether this bridge persists them.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('airelay.captureEnabled' in changes) {
      captureEnabled = !!changes['airelay.captureEnabled'].newValue;
      setDiagnosticStatus(captureEnabled ? 'active' : 'capture-off');
    }
    if ('airelay.debugPref' in changes) {
      debugEnabled = !!changes['airelay.debugPref'].newValue;
    }
    publishConfig();
  });

  // --- Persistence ---
  // Keep page-local event order here. The background service worker adds a
  // second, extension-wide queue so simultaneous writes from different tabs
  // cannot overwrite one another.

  let writeQueue = Promise.resolve();

  function enqueue(job) {
    writeQueue = writeQueue.then(job).catch(() => {});
  }

  async function persist(detail, operation) {
    if (!captureEnabled || !detail) return;
    const meta = { url: location.href, title: document.title };
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'airelay:persist',
        operation,
        detail,
        meta,
      }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          setDiagnosticStatus('error', chrome.runtime.lastError?.message || response?.error || 'Persistence failed');
        } else {
          setDiagnosticStatus(captureEnabled ? 'active' : 'capture-off');
        }
        resolve();
      });
    });
  }

  window.addEventListener('airelay:capture', (ev) => {
    enqueue(() => persist(ev.detail, 'capture'));
  });
  window.addEventListener('airelay:history', (ev) => {
    enqueue(() => persist(ev.detail, 'history'));
  });
})();
